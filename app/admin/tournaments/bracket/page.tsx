import { trustedTournamentClient } from "@/lib/tournaments/server"
import BracketAdminClient, {
  type BracketAdminData,
  type BracketMatch,
  type BracketPlayer,
  type BracketRound,
} from "./BracketAdminClient"
import styles from "./page.module.css"

const TOURNAMENT_SLUG = "5-4-3-2-1"

export const dynamic = "force-dynamic"

export default async function BracketAdminPage() {
  const client = trustedTournamentClient()
  const { data: tournament, error: tournamentError } = await client
    .from("tournaments")
    .select("id,name,slug,status,bracket_size,format,overall_deadline_at,start_at")
    .eq("slug", TOURNAMENT_SLUG)
    .maybeSingle()

  if (tournamentError || !tournament) {
    return (
      <main className={styles.bracketAdminError}>
        <h1>Bracket Admin unavailable</h1>
        <p>
          The protected tournament record could not be loaded. No bracket records were
          changed.
        </p>
        {tournamentError ? <pre>{tournamentError.message}</pre> : null}
      </main>
    )
  }

  const [{ data: rounds, error: roundsError }, { data: matches, error: matchesError }] =
    await Promise.all([
      client
        .from("tournament_rounds")
        .select("round_number,name,deadline_at,is_final")
        .eq("tournament_id", tournament.id)
        .order("round_number"),
      client
        .from("tournament_matches")
        .select(
          "id,round_number,match_number,stable_key,status,player_a_id,player_b_id,winner_player_id,loser_player_id,scheduled_at,deadline_at,match_timezone,slot_a,slot_b"
        )
        .eq("tournament_id", tournament.id)
        .order("round_number")
        .order("match_number"),
    ])

  const matchRows = (matches ?? []) as BracketMatch[]
  const matchIds = matchRows.map((match) => match.id)
  const playerIds = [
    ...new Set(
      matchRows.flatMap((match) =>
        [match.player_a_id, match.player_b_id, match.winner_player_id, match.loser_player_id].filter(
          (id): id is string => Boolean(id)
        )
      )
    ),
  ]

  const [playersResult, confirmationsResult, resultsResult, forcedAdvancementsResult] = await Promise.all([
    playerIds.length
      ? client.from("players").select("id,screen_name").in("id", playerIds)
      : Promise.resolve({ data: [], error: null }),
    matchIds.length
      ? client
          .from("tournament_winner_confirmations")
          .select("match_id,player_id,selected_winner_id,created_at")
          .in("match_id", matchIds)
      : Promise.resolve({ data: [], error: null }),
    matchIds.length
      ? client
          .from("tournament_match_results")
          .select("match_id,winner_player_id,loser_player_id,score_label,evidence_reference,verified_by,recorded_at")
          .in("match_id", matchIds)
      : Promise.resolve({ data: [], error: null }),
    matchIds.length
      ? client
          .from("tournament_forced_advancements")
          .select("match_id,advancing_player_id,reason,decided_by,created_at")
          .in("match_id", matchIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const queryError =
    roundsError ||
    matchesError ||
    playersResult.error ||
    confirmationsResult.error ||
    resultsResult.error ||
    forcedAdvancementsResult.error

  if (queryError) {
    return (
      <main className={styles.bracketAdminError}>
        <h1>Bracket Admin unavailable</h1>
        <p>The tournament was found, but its protected bracket details could not be loaded.</p>
        <pre>{queryError.message}</pre>
      </main>
    )
  }

  const playerMap = new Map(
    ((playersResult.data ?? []) as BracketPlayer[]).map((player) => [player.id, player.screen_name])
  )

  const data: BracketAdminData = {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      status: tournament.status,
      bracketSize: tournament.bracket_size,
      format: tournament.format,
      startAt: tournament.start_at,
      overallDeadlineAt: tournament.overall_deadline_at,
    },
    rounds: (rounds ?? []) as BracketRound[],
    matches: matchRows,
    players: Object.fromEntries(playerMap),
    confirmations: confirmationsResult.data ?? [],
    results: resultsResult.data ?? [],
    forcedAdvancements: forcedAdvancementsResult.data ?? [],
  }

  return <BracketAdminClient initialData={data} />
}
