import "server-only"

import { createClient } from "@supabase/supabase-js"
import {
  buildCanonicalPlayerDisplays,
  type CanonicalCurrentPlayerRow,
  type CanonicalIdentityResolution,
} from "@/lib/canonicalPlayerDisplayCore"
import { buildPublicKwtHistoryRows, type KwtHistorySourceRow } from "@/lib/kwtHistory"

type CourseRow = {
  code: string
  base_map: string
  display_name: string | null
}

function createPublicKwtHistoryReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Public KWT history is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function loadAllHistory(reader: ReturnType<typeof createPublicKwtHistoryReader>) {
  const rows: KwtHistorySourceRow[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await reader
      .from("historical_kwt_scorecards")
      .select("season_number,week_number,historical_player_name,canonical_player_id,easy_course_code,easy_score,hard_course_code,hard_score,total_score,placement")
      .order("season_number", { ascending: false })
      .order("week_number", { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    const page = (data || []) as KwtHistorySourceRow[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

async function loadCanonicalDisplays(
  reader: ReturnType<typeof createPublicKwtHistoryReader>,
  sourcePlayerIds: string[],
) {
  const resolutions: CanonicalIdentityResolution[] = []
  const batchSize = 25

  for (let offset = 0; offset < sourcePlayerIds.length; offset += batchSize) {
    const batch = sourcePlayerIds.slice(offset, offset + batchSize)
    const responses = await Promise.all(batch.map((sourcePlayerId) =>
      reader.rpc("get_public_player_canonical_identity", { p_player_id: sourcePlayerId }),
    ))

    for (let index = 0; index < batch.length; index += 1) {
      const response = responses[index]
      if (response.error) throw response.error
      const identity = Array.isArray(response.data) ? response.data[0] : response.data
      resolutions.push({
        source_player_id: batch[index],
        canonical_player_id: identity && typeof identity.canonical_player_id === "string"
          ? identity.canonical_player_id
          : null,
      })
    }
  }

  const canonicalIds = Array.from(new Set(
    resolutions.map((resolution) => resolution.canonical_player_id).filter(Boolean),
  )) as string[]
  const canonicalPlayers: CanonicalCurrentPlayerRow[] = []

  for (let offset = 0; offset < canonicalIds.length; offset += 200) {
    const { data, error } = await reader
      .from("players")
      .select("id,screen_name,status,active")
      .in("id", canonicalIds.slice(offset, offset + 200))
    if (error) throw error
    canonicalPlayers.push(...((data || []) as CanonicalCurrentPlayerRow[]))
  }

  return buildCanonicalPlayerDisplays(sourcePlayerIds, resolutions, canonicalPlayers)
}

export async function loadPublicKwtHistory() {
  const reader = createPublicKwtHistoryReader()
  const [sourceRows, coursesResponse] = await Promise.all([
    loadAllHistory(reader),
    reader.from("all_time_courses").select("code,base_map,display_name").order("base_map"),
  ])
  if (coursesResponse.error) throw coursesResponse.error

  const sourcePlayerIds = Array.from(new Set(sourceRows.map((row) => row.canonical_player_id)))
  const displays = await loadCanonicalDisplays(reader, sourcePlayerIds)
  const playerNamesBySource = new Map(displays.flatMap((display) =>
    display.eligible && display.screen_name ? [[display.source_player_id, display.screen_name] as const] : [],
  ))
  const coursesByCode = new Map(((coursesResponse.data || []) as CourseRow[]).map((course) => [
    course.code.trim().toUpperCase(),
    course.display_name?.trim() || course.base_map,
  ]))

  return buildPublicKwtHistoryRows(sourceRows, playerNamesBySource, coursesByCode)
}
