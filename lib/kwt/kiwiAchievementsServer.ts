import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { calculateKwtKiwiAchievements, type KwtKiwiAudit, type KwtKiwiBadge } from "./kiwiAchievements"

export type VerifiedKwtKiwiRow = KwtKiwiAudit & {
  playerId: string
  screenName: string
  division: string
  easyScore: number | null
  hardScore: number | null
  recordedBadges: string[]
}

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("KWT operational data is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function pars(value: unknown) {
  return Array.isArray(value) ? value.map(Number) : []
}

export async function loadCommittedKwtKiwiRows(input: {
  season: number
  week: number
  eventIdentifier: string
  easyCourseCode: string
  hardCourseCode: string
  client?: SupabaseClient
}): Promise<VerifiedKwtKiwiRow[]> {
  const client = input.client ?? trustedClient()
  const batch = await client.from("kwt_current_import_batches").select("id").eq("source_season", input.season).eq("source_week", input.week).eq("event_identifier", input.eventIdentifier).eq("status", "COMMITTED").order("committed_at", { ascending: false }).limit(1).maybeSingle()
  if (batch.error || !batch.data) return []
  const [rowsResponse, coursesResponse] = await Promise.all([
    client.from("kwt_current_import_rows").select("canonical_player_id,division,easy_score,hard_score,easy_holes,hard_holes,badges").eq("batch_id", batch.data.id),
    client.from("all_time_courses").select("code,hole_pars").in("code", [input.easyCourseCode, input.hardCourseCode]).eq("active", true),
  ])
  if (rowsResponse.error || coursesResponse.error) return []
  const easyCourse = coursesResponse.data?.find((row) => row.code === input.easyCourseCode)
  const hardCourse = coursesResponse.data?.find((row) => row.code === input.hardCourseCode)
  if (!easyCourse || !hardCourse) return []
  const rows = rowsResponse.data ?? []
  const playerIds = rows.map((row) => row.canonical_player_id).filter((id): id is string => typeof id === "string")
  const playersResponse = playerIds.length ? await client.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
  if (playersResponse.error) return []
  const names = new Map((playersResponse.data ?? []).map((row) => [row.id, row.screen_name]))
  return rows.flatMap((row) => {
    if (typeof row.canonical_player_id !== "string" || !names.has(row.canonical_player_id)) return []
    const audit = calculateKwtKiwiAchievements({ easyHoles: pars(row.easy_holes), hardHoles: pars(row.hard_holes), easyPars: pars(easyCourse.hole_pars), hardPars: pars(hardCourse.hole_pars) })
    return [{ playerId: row.canonical_player_id, screenName: names.get(row.canonical_player_id)!, division: String(row.division || ""), easyScore: row.easy_score, hardScore: row.hard_score, recordedBadges: Array.isArray(row.badges) ? row.badges.map(String) : [], ...audit }]
  })
}

export function badgesByPlayer(rows: VerifiedKwtKiwiRow[]) {
  return new Map<string, readonly KwtKiwiBadge[]>(rows.map((row) => [row.playerId, row.badges]))
}

