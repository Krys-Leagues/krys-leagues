import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { CLIMBERS_BASELINE_IMPORT_KEY } from "@/lib/all-time/climbers-baseline-activation"
import { loadAdminCanonicalPlayerNames } from "@/lib/identity/adminGlobalPlayerLookup"
import { createAdminSupabaseClient } from "@/lib/identity/adminSupabaseClient"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
})

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const admin = createAdminSupabaseClient()
    const [seasonResult, eventResult, passResult, ytdResult, courseResult, baselineMarkerResult, baselineSourceResult, baselineResult, players] = await Promise.all([
      admin.from("climbers_seasons").select("id,label,starts_at,ends_at,status").order("starts_at", { ascending: false }),
      admin.from("climbers_events").select("id,season_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,calculation_version,source_label,provenance_reference,created_at,voided_at").order("created_at", { ascending: false }),
      admin.from("climbers_event_passes").select("event_id,passed_player_id"),
      admin.from("climbers_year_to_date").select("player_id,points,event_count").order("points", { ascending: false }),
      admin.from("all_time_courses").select("id,code,display_name,difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]),
      admin.from("climbers_legacy_baseline_imports").select("import_key,cutoff_at,applied_at").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY).maybeSingle(),
      admin.from("climbers_legacy_baseline_source_rows").select("source_name,ytd_points,period_points,canonical_player_id,identity_status").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
      admin.from("climbers_legacy_baselines").select("canonical_player_id").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
      loadAdminCanonicalPlayerNames(),
    ])
    const queryError = seasonResult.error || eventResult.error || passResult.error || ytdResult.error || courseResult.error || baselineMarkerResult.error || baselineSourceResult.error || baselineResult.error
    if (queryError) return json({ error: queryError.message }, 503)

    return json({
      seasons: seasonResult.data ?? [],
      events: eventResult.data ?? [],
      passes: passResult.data ?? [],
      ytd: ytdResult.data ?? [],
      players: [...players.entries()].map(([id, screen_name]) => ({ id, screen_name })),
      courses: courseResult.data ?? [],
      baseline_marker: baselineMarkerResult.data ?? null,
      baseline_source_rows: baselineSourceResult.data ?? [],
      active_baseline_rows: baselineResult.data ?? [],
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Climbers admin data could not be loaded." }, 503)
  }
}
