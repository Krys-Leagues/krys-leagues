import "server-only"

import { createClient } from "@supabase/supabase-js"

type SeasonRow = {
  id: string
  season_number: number
  start_date: string | null
  end_date: string | null
  game1_course: string | null
  game2_course: string | null
}

export type KwtCurrentResult = {
  id: string
  season_number: number
  week_number: number
  player_id: string
  player_name: string
  division: string
  easy_course_code: string
  hard_course_code: string
  easy_score: number
  hard_score: number
  total_score: number
  overall_placement: number | null
  division_placement: number | null
  points: number | null
}

export type KwtCurrentSeason = {
  season: SeasonRow
  results: KwtCurrentResult[]
  currentWeek: number | null
}

function createKwtReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("KWT current results are not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function loadPublicKwtCurrentSeason(): Promise<KwtCurrentSeason> {
  const reader = createKwtReader()
  const { data: seasons, error: seasonError } = await reader
    .from("seasons")
    .select("id,season_number,start_date,end_date,game1_course,game2_course")
    .eq("league_type", "kwt")
    .eq("is_active", true)
    .order("season_number", { ascending: false })
    .limit(1)

  if (seasonError) throw seasonError
  const season = (seasons || [])[0] as SeasonRow | undefined
  if (!season) throw new Error("No active KWT season is available.")

  const { data: operationalRows, error: resultError } = await reader
    .from("kwt_operational_results")
    .select("id,season_number,week_number,player_id,division,easy_course_code,hard_course_code,easy_score,hard_score,total_score,overall_placement,division_placement,points")
    .eq("season_id", season.id)
    .eq("status", "official")
    .order("overall_placement", { ascending: true, nullsFirst: false })

  if (resultError) throw resultError

  const rows = operationalRows || []
  const playerIds = Array.from(new Set(rows.map((row) => row.player_id).filter(Boolean)))
  const { data: players, error: playerError } = playerIds.length
    ? await reader.from("players").select("id,screen_name").in("id", playerIds)
    : { data: [], error: null }

  if (playerError) throw playerError
  const playerNames = new Map((players || []).map((player) => [player.id, player.screen_name]))
  if (rows.some((row) => !row.player_id || !playerNames.get(row.player_id)?.trim())) {
    throw new Error("A canonical KWT player name is unavailable.")
  }

  const results = rows.map((row) => ({
    ...row,
    player_name: playerNames.get(row.player_id)!.trim(),
  })) as KwtCurrentResult[]

  return {
    season,
    results,
    currentWeek: results.length ? Math.max(...results.map((row) => row.week_number)) : null,
  }
}
