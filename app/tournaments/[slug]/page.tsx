import Link from "next/link"
import { trustedTournamentClient } from "@/lib/tournaments/server"
import VisualBracket, { labelForRound, type VisualBracketRound } from "@/components/tournaments/VisualBracket"
import styles from "./page.module.css"

const TOURNAMENT_SLUG = "5-4-3-2-1"

type Tournament = {
  id: string
  name: string
  slug: string
  status: string
  bracket_size: number
  format: string
  start_at: string | null
  overall_deadline_at: string | null
}

type Round = { round_number: number; name: string | null; deadline_at: string | null; is_final: boolean }
type Match = {
  id: string
  round_number: number
  match_number: number
  player_a_id: string | null
  player_b_id: string | null
  winner_player_id: string | null
}
type MatchResult = { match_id: string; winner_player_id: string | null }

const MATCH_CENTER_ORIGIN = "https://krys-leagues-match-center.vercel.app"

function formatDate(value: string | null, timeZone: string | null = "America/New_York") {
  if (!value) return "Not scheduled"
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timeZone || "America/New_York" }).format(new Date(value))
}

export const dynamic = "force-dynamic"

export default async function PublicTournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug !== TOURNAMENT_SLUG) return <main className={styles.page}><section className={styles.card}><h1>Tournament not found</h1><Link href="/tournaments">← Bracket Tournaments</Link></section></main>

  const client = trustedTournamentClient()
  const { data: tournament, error: tournamentError } = await client
    .from("tournaments")
    .select("id,name,slug,status,bracket_size,format,start_at,overall_deadline_at")
    .eq("slug", TOURNAMENT_SLUG)
    .maybeSingle()

  if (tournamentError || !tournament) {
    return <main className={styles.page}><section className={styles.card}><p className={styles.kicker}>Area 15 · Player view</p><h1>Current brackets unavailable</h1><p>The authoritative tournament record is not available. No bracket records were changed.</p><Link href="/tournaments">← Bracket Tournaments</Link></section></main>
  }

  const tournamentRow = tournament as Tournament
  const [{ data: rounds, error: roundsError }, { data: matches, error: matchesError }] = await Promise.all([
    client.from("tournament_rounds").select("round_number,name,deadline_at,is_final").eq("tournament_id", tournamentRow.id).order("round_number"),
    client.from("tournament_matches").select("id,round_number,match_number,player_a_id,player_b_id,winner_player_id").eq("tournament_id", tournamentRow.id).order("round_number").order("match_number"),
  ])

  if (roundsError || matchesError) {
    return <main className={styles.page}><section className={styles.card}><p className={styles.kicker}>Area 15 · Player view</p><h1>Current brackets unavailable</h1><p>The authoritative bracket details could not be read. No bracket records were changed.</p><Link href="/tournaments">← Bracket Tournaments</Link></section></main>
  }

  const matchRows = (matches ?? []) as Match[]
  const roundRows = (rounds ?? []) as Round[]
  const matchIds = matchRows.map((match) => match.id)
  const { data: results, error: resultsError } = matchIds.length
    ? await client.from("tournament_match_results").select("match_id,winner_player_id").in("match_id", matchIds)
    : { data: [], error: null }
  if (resultsError) return <main className={styles.page}><section className={styles.card}><h1>Current brackets unavailable</h1><p>The authoritative match results could not be read. No bracket records were changed.</p><Link href="/tournaments">← Bracket Tournaments</Link></section></main>
  const playerIds = [...new Set(matchRows.flatMap((match) => [match.player_a_id, match.player_b_id, match.winner_player_id].filter((id): id is string => Boolean(id)) ))]
  const { data: players, error: playersError } = playerIds.length ? await client.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
  if (playersError) return <main className={styles.page}><section className={styles.card}><h1>Current brackets unavailable</h1><p>Player identities could not be read. No bracket records were changed.</p><Link href="/tournaments">← Bracket Tournaments</Link></section></main>
  const names = new Map((players ?? []).map((player) => [player.id, player.screen_name]))
  const resultByMatch = new Map(((results ?? []) as MatchResult[]).map((result) => [result.match_id, result]))
  const roundsByNumber = new Map<number, Match[]>()
  for (const match of matchRows) roundsByNumber.set(match.round_number, [...(roundsByNumber.get(match.round_number) ?? []), match])

  function playerName(id: string | null) { return (id && names.get(id)) || "TBD" }
  function winnerName(id: string | null) { return id ? playerName(id) : null }

  const visualRounds: VisualBracketRound[] = roundRows.map((round) => ({
    roundNumber: round.round_number,
    label: labelForRound(round.round_number, round.name),
    deadlineLabel: round.deadline_at ? formatDate(round.deadline_at) : null,
    matches: (roundsByNumber.get(round.round_number) ?? []).map((match) => {
      const result = resultByMatch.get(match.id)
      const winnerId = match.winner_player_id ?? result?.winner_player_id ?? null
      const playerAName = playerName(match.player_a_id)
      const playerBName = playerName(match.player_b_id)
      return {
        id: match.id,
        playerAName,
        playerBName,
        winnerName: winnerName(winnerId),
        matchCenterHref: match.player_a_id && match.player_b_id ? `${MATCH_CENTER_ORIGIN}/tournaments/${TOURNAMENT_SLUG}/matches/${encodeURIComponent(match.id)}` : null,
      }
    }),
  }))

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.breadcrumbs} aria-label="Tournament navigation"><Link href="/">← Krys Leagues</Link><span>/</span><Link href="/tournaments">Bracket Tournaments</Link></nav>
      <header className={styles.hero}><p className={styles.kicker}>Area 15 · Current Brackets</p><h1>{tournamentRow.name}</h1><p className={styles.subtitle}>Published read-only view of the existing five-round tournament bracket. Results and advancement remain protected Admin operations.</p></header>
      <section className={styles.notice}><strong>Read-only player view</strong><span>This page displays the authoritative bracket records and does not create, reset, or advance matches.</span></section>
      <section className={styles.bracket} aria-label="Current tournament bracket">
        {roundRows.length === 0 || matchRows.length === 0 ? <div className={styles.card}><h2>Bracket not yet published</h2><p>The tournament exists, but no current match rows are available for display.</p></div> : <VisualBracket rounds={visualRounds} />}
      </section>
    </div>
  </main>
}
