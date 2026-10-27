import "server-only"

import { createClient } from "@supabase/supabase-js"

export const AMATEUR_PRO_DIVISIONS = [
  "Amateur D1",
  "Semi Pro D1",
  "Pro D1",
  "Pro D2",
  "Pro D3",
] as const

type StandingRow = {
  player_id: string
  points: number | null
  wins: number | null
  losses: number | null
  ties: number | null
  rank: number | null
}

type CanonicalIdentity = {
  canonical_player_id: string | null
}

export type PublicAmateurProStanding = {
  player: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  rank: number
}

function createPublicStandingsReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Public standings are not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function validAmateurProDivision(value: string | null) {
  return AMATEUR_PRO_DIVISIONS.includes(value as (typeof AMATEUR_PRO_DIVISIONS)[number])
}

export function validSeasonNumber(value: string | null) {
  const season = Number(value)
  return Number.isInteger(season) && season > 0 && season <= 10_000 ? season : null
}

export async function loadPublicAmateurProStandings(division: string, season: number) {
  const reader = createPublicStandingsReader()
  const standingsResponse = await reader
    .from("season_standings")
    .select("player_id,points,wins,losses,ties,rank")
    .eq("league_type", "pro")
    .eq("division", division)
    .eq("season_number", season)
    .order("rank", { ascending: true })

  if (standingsResponse.error) throw standingsResponse.error
  const standings = (standingsResponse.data || []) as StandingRow[]
  const sourcePlayerIds = Array.from(new Set(standings.map((row) => row.player_id).filter(Boolean)))

  const identityResponses = await Promise.all(
    sourcePlayerIds.map((playerId) =>
      reader.rpc("get_public_player_canonical_identity", { p_player_id: playerId }),
    ),
  )
  const canonicalBySource = new Map<string, string>()

  for (let index = 0; index < sourcePlayerIds.length; index += 1) {
    const response = identityResponses[index]
    if (response.error) throw response.error
    const identity = (Array.isArray(response.data) ? response.data[0] : response.data) as CanonicalIdentity | null
    canonicalBySource.set(sourcePlayerIds[index], identity?.canonical_player_id || sourcePlayerIds[index])
  }

  const canonicalIds = Array.from(new Set(canonicalBySource.values()))
  const playersResponse = canonicalIds.length > 0
    ? await reader.from("players").select("id,screen_name").in("id", canonicalIds)
    : { data: [], error: null }
  if (playersResponse.error) throw playersResponse.error

  const nameByCanonicalId = new Map(
    (playersResponse.data || []).map((player) => [player.id as string, player.screen_name as string]),
  )

  return standings.map((row): PublicAmateurProStanding => {
    const wins = Number(row.wins || 0)
    const draws = Number(row.ties || 0)
    const losses = Number(row.losses || 0)
    const canonicalId = canonicalBySource.get(row.player_id)

    return {
      player: (canonicalId && nameByCanonicalId.get(canonicalId)) || "Unknown Player",
      played: wins + draws + losses,
      wins,
      draws,
      losses,
      points: Number(row.points || 0),
      rank: Number(row.rank || 0),
    }
  })
}
