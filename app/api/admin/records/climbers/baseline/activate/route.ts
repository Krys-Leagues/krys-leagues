import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import {
  CLIMBERS_BASELINE_CUTOFF,
  CLIMBERS_BASELINE_IMPORT_KEY,
  EXPECTED_CLIMBERS_BASELINE,
  summarizeClimbersBaseline,
  validateClimbersBaselineForActivation,
  type ClimbersBaselineImportMarker,
  type ClimbersBaselineSourceRow,
} from "@/lib/all-time/climbers-baseline-activation"

export const runtime = "nodejs"

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
})

export async function POST() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const { supabase } = authorization

  try {
    const [markerResult, sourceResult, activeResult] = await Promise.all([
      supabase
        .from("climbers_legacy_baseline_imports")
        .select("import_key,cutoff_at,applied_at")
        .eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY)
        .maybeSingle(),
      supabase
        .from("climbers_legacy_baseline_source_rows")
        .select("source_name,ytd_points,period_points,canonical_player_id,identity_status")
        .eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
      supabase
        .from("climbers_legacy_baselines")
        .select("canonical_player_id")
        .eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
    ])

    const readError = markerResult.error || sourceResult.error || activeResult.error
    if (readError) return json({ ok: false, error: readError.message }, 503)

    const marker = (markerResult.data ?? null) as ClimbersBaselineImportMarker | null
    const sourceRows = (sourceResult.data ?? []) as ClimbersBaselineSourceRow[]
    const summary = summarizeClimbersBaseline(sourceRows)
    const validation = validateClimbersBaselineForActivation(marker, summary)
    const unresolvedRows = sourceRows.filter((row) => row.identity_status !== "resolved" || !row.canonical_player_id)
    if (unresolvedRows.length) {
      validation.issues.push(`${unresolvedRows.length} source row(s) still lack a resolved canonical player.`)
    }
    if ((activeResult.data ?? []).length > 0) {
      validation.issues.push("Active legacy baseline rows already exist; activation is blocked to prevent duplication.")
    }
    if (!validation.valid || validation.issues.length) {
      return json({ ok: false, error: "The verified Climbers baseline is not safe to activate.", summary, issues: validation.issues }, 409)
    }

    const applyResult = await supabase.rpc("apply_climbers_legacy_baseline", { p_import_key: CLIMBERS_BASELINE_IMPORT_KEY })
    if (applyResult.error) {
      const status = applyResult.error.code === "42501" ? 403 : 400
      return json({ ok: false, error: applyResult.error.message }, status)
    }

    const [appliedMarkerResult, appliedRowsResult, ytdResult] = await Promise.all([
      supabase
        .from("climbers_legacy_baseline_imports")
        .select("applied_at,cutoff_at")
        .eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY)
        .maybeSingle(),
      supabase
        .from("climbers_legacy_baselines")
        .select("canonical_player_id,combined_points")
        .eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
      supabase.from("climbers_year_to_date").select("player_id,points,event_count"),
    ])
    const verifyError = appliedMarkerResult.error || appliedRowsResult.error || ytdResult.error
    if (verifyError) return json({ ok: false, error: verifyError.message }, 500)

    const ytdRows = (ytdResult.data ?? []) as Array<{ player_id: string; points: number; event_count: number }>
    const ytdTotal = ytdRows.reduce((total, row) => total + row.points, 0)
    const activeBaselinePlayers = (appliedRowsResult.data ?? []).length
    const appliedAt = appliedMarkerResult.data?.applied_at ?? null
    if (!appliedAt || activeBaselinePlayers !== EXPECTED_CLIMBERS_BASELINE.canonicalPlayers || ytdTotal !== EXPECTED_CLIMBERS_BASELINE.combinedPoints) {
      return json({
        ok: false,
        error: "Baseline activation completed without the expected verification totals.",
        verification: { appliedAt, activeBaselinePlayers, ytdTotal },
      }, 500)
    }

    return json({
      ok: true,
      activatedCount: applyResult.data,
      verification: {
        appliedAt,
        activeBaselinePlayers,
        ytdRows: ytdRows.length,
        ytdTotal,
        seasonsCreated: 0,
        eventsCreated: 0,
        cutoff: CLIMBERS_BASELINE_CUTOFF,
      },
    })
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected baseline activation error." }, 500)
  }
}
