import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import {
  CLIMBERS_BASELINE_IMPORT_KEY,
  type ClimbersBaselineImportMarker,
  type ClimbersBaselineSourceRow,
} from "@/lib/all-time/climbers-baseline-activation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function climbersAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Climbers admin server access is not configured.")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const supabase = climbersAdminClient()
    const [seasonResult, eventResult, passResult, ytdResult, playerResult, courseResult, baselineMarkerResult, baselineSourceResult, baselineResult] = await Promise.all([
      supabase.from("climbers_seasons").select("id,label,starts_at,ends_at,status").order("starts_at", { ascending: false }),
      supabase.from("climbers_events").select("id,season_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,calculation_version,source_label,provenance_reference,created_at,voided_at").order("created_at", { ascending: false }),
      supabase.from("climbers_event_passes").select("event_id,passed_player_id"),
      supabase.from("climbers_year_to_date").select("player_id,points,event_count").order("points", { ascending: false }),
      supabase.from("players").select("id,screen_name").order("screen_name"),
      supabase.from("all_time_courses").select("id,code,display_name,difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]),
      supabase.from("climbers_legacy_baseline_imports").select("import_key,cutoff_at,applied_at").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY).maybeSingle(),
      supabase.from("climbers_legacy_baseline_source_rows").select("source_name,ytd_points,period_points,canonical_player_id,identity_status").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
      supabase.from("climbers_legacy_baselines").select("canonical_player_id").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
    ])

    const readError = seasonResult.error || eventResult.error || passResult.error || ytdResult.error || playerResult.error || courseResult.error || baselineMarkerResult.error || baselineSourceResult.error || baselineResult.error
    if (readError) return json({ error: readError.message }, 503)

    return json({
      seasons: seasonResult.data ?? [],
      events: eventResult.data ?? [],
      passes: passResult.data ?? [],
      ytd: ytdResult.data ?? [],
      players: playerResult.data ?? [],
      courses: courseResult.data ?? [],
      baselineMarker: (baselineMarkerResult.data ?? null) as ClimbersBaselineImportMarker | null,
      baselineSourceRows: (baselineSourceResult.data ?? []) as ClimbersBaselineSourceRow[],
      activeBaselinePlayers: (baselineResult.data ?? []).length,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Climbers admin data could not be loaded." }, 503)
  }
}
