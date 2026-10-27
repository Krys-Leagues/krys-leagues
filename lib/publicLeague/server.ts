import "server-only"

import { createClient } from "@supabase/supabase-js"

export const PUBLIC_LEAGUE_KINDS = ["stroke", "doubles", "pro", "skins"] as const
export type PublicLeagueKind = (typeof PUBLIC_LEAGUE_KINDS)[number]

const LEAGUE_TYPES: Record<PublicLeagueKind, string> = {
  stroke: "stroke",
  doubles: "doubles",
  pro: "pro",
  skins: "skins",
}

function createPublicLeagueReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Public league boards are not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function loadPublicLeagueBoard(kind: PublicLeagueKind) {
  const reader = createPublicLeagueReader()
  const leagueType = LEAGUE_TYPES[kind]
  const [fixturesResponse, resultsResponse, standingsResponse] = await Promise.all([
    reader.from("schedule")
      .select("id,season_number,division,game,course,player1,player2,player1_name,player2_name,player1_id,player2_id")
      .eq("league_type", leagueType)
      .order("season_number", { ascending: false })
      .order("division", { ascending: true })
      .order("game", { ascending: true }),
    reader.from("results")
      .select("id,schedule_id,season_number,division,game,player1,player2,player1_id,player2_id,player1_score,player2_score,is_draw")
      .eq("league_type", leagueType),
    reader.from("season_standings")
      .select("player_id,season_number,division,rank,wins,losses,ties,points,strokes")
      .eq("league_type", leagueType)
      .order("season_number", { ascending: false })
      .order("rank", { ascending: true }),
  ])

  if (fixturesResponse.error) throw fixturesResponse.error
  if (resultsResponse.error) throw resultsResponse.error
  if (standingsResponse.error) throw standingsResponse.error

  const fixtures = fixturesResponse.data || []
  const results = resultsResponse.data || []
  const standings = standingsResponse.data || []
  let currentSeason: number | null = null
  if (kind === "stroke") {
    const [seasonsResponse, rostersResponse] = await Promise.all([
      reader.from("seasons").select("id,season_number,is_active").eq("league_type", "stroke"),
      reader.from("stroke_roster_versions").select("season_id,status,created_at").in("status", ["approved", "locked"]).order("created_at", { ascending: false }),
    ])
    if (seasonsResponse.error) throw seasonsResponse.error
    if (rostersResponse.error) throw rostersResponse.error
    const seasons = seasonsResponse.data || []
    const rosterSeasonIds = new Set((rostersResponse.data || []).map((row) => row.season_id))
    const configured = seasons
      .filter((row) => row.is_active && rosterSeasonIds.has(row.id))
      .sort((a, b) => Number(b.season_number) - Number(a.season_number))[0]
    const managed = seasons
      .filter((row) => rosterSeasonIds.has(row.id))
      .sort((a, b) => Number(b.season_number) - Number(a.season_number))[0]
    currentSeason = Number(configured?.season_number ?? managed?.season_number ?? 0) || null
  }
  const sourcePlayerIds = Array.from(new Set([
    ...fixtures.flatMap((row) => [row.player1_id, row.player2_id]),
    ...results.flatMap((row) => [row.player1_id, row.player2_id]),
    ...standings.map((row) => row.player_id),
  ].filter((id): id is string => Boolean(id))))

  const resolutions = await Promise.all(sourcePlayerIds.map(async (sourcePlayerId) => {
    const response = await reader.rpc("get_public_player_canonical_identity", { p_player_id: sourcePlayerId })
    if (response.error) throw response.error
    const identity = Array.isArray(response.data) ? response.data[0] : response.data
    return [sourcePlayerId, typeof identity?.canonical_player_id === "string" ? identity.canonical_player_id : sourcePlayerId] as const
  }))
  const canonicalBySource = new Map(resolutions)
  const canonicalIds = Array.from(new Set(resolutions.map(([, canonicalId]) => canonicalId)))
  const playersResponse = canonicalIds.length
    ? await reader.from("players").select("id,screen_name").in("id", canonicalIds)
    : { data: [], error: null }
  if (playersResponse.error) throw playersResponse.error
  const screenNameByCanonicalId = new Map((playersResponse.data || []).map((row) => [row.id, row.screen_name]))
  const names = Object.fromEntries(sourcePlayerIds.map((sourceId) => [
    sourceId,
    screenNameByCanonicalId.get(canonicalBySource.get(sourceId) || sourceId) || null,
  ]))

  return { fixtures, results, standings, names, currentSeason }
}
