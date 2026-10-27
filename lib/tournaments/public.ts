import "server-only"

import { isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"
import { isPublishedBracket } from "@/lib/tournaments/publicProjection"

export type PublicOpenTournament = {
  id: string
  name: string
  slug: string
  bracket_size: 32 | 64
  registration_capacity: number
  confirmed_count: number
  registration_open_at: string | null
  has_artwork: boolean
  has_rules: boolean
}

export type PublicBracketMatch = {
  round_number: number
  match_number: number
  status: string
  player_a_name: string | null
  player_b_name: string | null
  winner_name: string | null
}

export type PublicLiveTournament = {
  id: string
  name: string
  slug: string
  bracket_size: 32 | 64
  participant_count: number
  rounds: { round_number: number; name: string; is_final: boolean }[]
  matches: PublicBracketMatch[]
}

export type PublicCompletedTournament = {
  id: string
  name: string
  slug: string
  bracket_size: 32 | 64
  champion: string | null
  runner_up: string | null
  trophy_awarded: boolean
}

export type PublicTournamentOverview = {
  available: boolean
  open: PublicOpenTournament[]
  live: PublicLiveTournament[]
  completed: PublicCompletedTournament[]
}

function unavailableOverview(): PublicTournamentOverview {
  return { available: false, open: [], live: [], completed: [] }
}

export async function loadPublicTournamentOverview(): Promise<PublicTournamentOverview> {
  const client = trustedTournamentClient()
  const { data: tournaments, error } = await client
    .from("tournaments")
    .select("id,name,slug,status,bracket_size,registration_capacity,registration_open_at,artwork_path,rules,completed_at")
    .in("status", ["registration_open", "live", "completed"])
    .order("created_at", { ascending: false })

  if (error) {
    if (isMissingTournamentSchema(error)) return unavailableOverview()
    throw new Error(error.message)
  }

  const rows = tournaments ?? []
  const openRows = rows.filter((row) => row.status === "registration_open")
  const liveRows = rows.filter((row) => row.status === "live")
  const completedRows = rows.filter((row) => row.status === "completed")

  const open = await Promise.all(openRows.map(async (row) => {
    const registrations = await client
      .from("tournament_registrations")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", row.id)
      .eq("status", "confirmed")
    if (registrations.error) throw new Error(registrations.error.message)
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      bracket_size: row.bracket_size as 32 | 64,
      registration_capacity: row.registration_capacity,
      confirmed_count: registrations.count ?? 0,
      registration_open_at: row.registration_open_at,
      has_artwork: Boolean(row.artwork_path),
      has_rules: Boolean(row.rules && Object.keys(row.rules as Record<string, unknown>).length),
    }
  }))

  const live = (await Promise.all(liveRows.map(async (row): Promise<PublicLiveTournament | null> => {
    const [roundsResult, matchesResult] = await Promise.all([
      client.from("tournament_rounds").select("round_number,name,is_final").eq("tournament_id", row.id).order("round_number"),
      client.from("tournament_matches").select("round_number,match_number,status,player_a_id,player_b_id,winner_player_id").eq("tournament_id", row.id).order("round_number").order("match_number"),
    ])
    if (roundsResult.error || matchesResult.error) throw new Error(roundsResult.error?.message || matchesResult.error?.message || "Live bracket data could not be loaded")
    const matches = matchesResult.data ?? []
    if (!isPublishedBracket(row.status, row.bracket_size, matches.length)) return null
    const playerIds = [...new Set(matches.flatMap((match) => [match.player_a_id, match.player_b_id, match.winner_player_id].filter((value): value is string => Boolean(value))))]
    const players = playerIds.length ? await client.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
    if (players.error) throw new Error(players.error.message)
    const names = new Map((players.data ?? []).map((player) => [player.id, player.screen_name]))
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      bracket_size: row.bracket_size as 32 | 64,
      participant_count: new Set(playerIds).size,
      rounds: roundsResult.data ?? [],
      matches: matches.map((match) => ({
        round_number: match.round_number,
        match_number: match.match_number,
        status: match.status,
        player_a_name: match.player_a_id ? names.get(match.player_a_id) ?? null : null,
        player_b_name: match.player_b_id ? names.get(match.player_b_id) ?? null : null,
        winner_name: match.winner_player_id ? names.get(match.winner_player_id) ?? null : null,
      })),
    }
  }))).filter((item): item is PublicLiveTournament => Boolean(item))

  const completed = (await Promise.all(completedRows.map(async (row): Promise<PublicCompletedTournament | null> => {
    const { data: matches, error: matchesError } = await client
      .from("tournament_matches")
      .select("round_number,status,player_a_id,player_b_id,winner_player_id,loser_player_id")
      .eq("tournament_id", row.id)
      .order("round_number", { ascending: false })
      .limit(1)
    if (matchesError) throw new Error(matchesError.message)
    const finalMatch = matches?.[0]
    const playerIds = [finalMatch?.winner_player_id, finalMatch?.loser_player_id].filter((value): value is string => Boolean(value))
    const players = playerIds.length ? await client.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
    if (players.error) throw new Error(players.error.message)
    const names = new Map((players.data ?? []).map((player) => [player.id, player.screen_name]))
    const awards = finalMatch?.winner_player_id ? await client.from("tournament_awards").select("id").eq("tournament_id", row.id).eq("winner_player_id", finalMatch.winner_player_id).in("status", ["approved", "awarded"]).limit(1) : { data: [], error: null }
    if (awards.error) throw new Error(awards.error.message)
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      bracket_size: row.bracket_size as 32 | 64,
      champion: finalMatch?.winner_player_id ? names.get(finalMatch.winner_player_id) ?? null : null,
      runner_up: finalMatch?.loser_player_id ? names.get(finalMatch.loser_player_id) ?? null : null,
      trophy_awarded: Boolean(awards.data?.length),
    }
  }))).filter((item): item is PublicCompletedTournament => Boolean(item))

  return { available: true, open, live, completed }
}
