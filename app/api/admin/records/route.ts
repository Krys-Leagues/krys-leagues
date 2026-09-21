import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"

const RPC_GROUPS = {
  history: ["correct_all_time_late_backfill_batch_entry", "correct_all_time_late_backfill_entry", "correct_all_time_record_entry", "void_all_time_late_backfill_entry", "void_all_time_record_entry"],
  climbers: ["create_climbers_season", "finalize_climbers_season", "remember_verified_player_alias"],
  backfill: ["preview_all_time_late_backfill_batch", "preview_all_time_late_backfill_entry", "record_all_time_late_backfill_batch", "record_all_time_late_backfill_entry"],
} as const

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }
function fail(message: string, status = 400) { return json({ error: message }, status) }

async function loadEntryCatalog(client: ReturnType<typeof createAdminServiceClient>) {
  const [courses, seasons] = await Promise.all([
    client.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
    client.from("climbers_seasons").select("id,starts_at,ends_at,status").neq("status", "upcoming").order("starts_at", { ascending: false }),
  ])
  if (courses.error) throw courses.error
  if (seasons.error) throw seasons.error
  return { courses: courses.data || [], seasons: seasons.data || [] }
}

async function runRpc(authorization: Extract<Awaited<ReturnType<typeof authorizeSiteAdminMutation>>, { authorized: true }>, group: keyof typeof RPC_GROUPS, body: Record<string, unknown>) {
  const name = String(body.name || "")
  if (!(RPC_GROUPS[group] as readonly string[]).includes(name)) throw new Error("That records RPC is not in the approved family contract.")
  const result = await authorization.supabase.rpc(name, (body.args || {}) as Record<string, unknown>)
  if (result.error) throw result.error
  return result.data
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
    const client = createAdminServiceClient()
    if (action === "entry_catalog") return json({ data: await loadEntryCatalog(client) })
    if (action === "entry_bests") {
      const courseId = String(body.courseId || "").trim(), playerId = String(body.playerId || "").trim()
      if (!courseId) return fail("Course is required.")
      const [best, all] = await Promise.all([
        playerId ? client.from("all_time_best_records").select("player_id,score").eq("course_id", courseId).eq("player_id", playerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
        client.from("all_time_best_records").select("player_id,score").eq("course_id", courseId),
      ])
      if (best.error) throw best.error
      if (all.error) throw all.error
      return json({ data: { best: best.data, courseBests: all.data || [] } })
    }
    if (action === "single_catalog") {
      const result = await client.from("all_time_courses").select("id, code, display_name, difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name")
      if (result.error) throw result.error
      return json({ data: result.data || [] })
    }
    if (action === "single_records") {
      const courseId = String(body.courseId || "").trim()
      if (!courseId) return fail("Course is required.")
      const [best, unresolved] = await Promise.all([
        client.from("all_time_best_records").select("id, course_id, score, historical_player_name, player:players(screen_name)").eq("course_id", courseId),
        client.from("all_time_record_observations").select("id, course_id, score, historical_player_name").eq("course_id", courseId).in("identity_status", ["unresolved", "ambiguous"]),
      ])
      if (best.error) throw best.error
      if (unresolved.error) throw unresolved.error
      return json({ data: { best: best.data || [], unresolved: unresolved.data || [] } })
    }
    if (action === "combined_load") {
      const [players, records] = await Promise.all([
        client.from("players").select("id, screen_name").eq("active", true).order("screen_name", { ascending: true }),
        client.from("combined_course_records").select("*").order("course_name", { ascending: true }).order("combined_score", { ascending: true }),
      ])
      if (players.error) throw players.error
      if (records.error) throw records.error
      return json({ data: { players: players.data || [], records: records.data || [] } })
    }
    if (action === "combined_save") {
      const result = await client.from("combined_course_records").upsert(body.record as Record<string, unknown>, { onConflict: "player_name,course_name" })
      if (result.error) throw result.error
      return json({ data: result.data || null })
    }
    if (action === "history_load") {
      const [courses, players, rows] = await Promise.all([
        client.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        client.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
        client.from("all_time_record_observations").select("id,card_batch_id,course_id,player_id,historical_player_name,score,entry_type,hole_strokes,source_label,provenance_reference,notes,observed_at,updated_at,recorded_at,recorded_by,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,voided_at,voided_by,void_reason,corrected_at").order("observed_at", { ascending: false }),
      ])
      if (courses.error) throw courses.error
      if (players.error) throw players.error
      if (rows.error) throw rows.error
      return json({ data: { courses: courses.data || [], players: players.data || [], rows: rows.data || [] } })
    }
    if (action === "history_rpc") return json({ data: await runRpc(authorization, "history", body) })
    if (action === "climbers_load") {
      const key = String(body.baselineImportKey || "")
      const [seasons, events, passes, ytd, players, courses, marker, sourceRows, baselines] = await Promise.all([
        client.from("climbers_seasons").select("id,label,starts_at,ends_at,status").order("starts_at", { ascending: false }),
        client.from("climbers_events").select("id,season_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,calculation_version,source_label,provenance_reference,created_at,voided_at").order("created_at", { ascending: false }),
        client.from("climbers_event_passes").select("event_id,passed_player_id"),
        client.from("climbers_year_to_date").select("player_id,points,event_count").order("points", { ascending: false }),
        client.from("players").select("id,screen_name").order("screen_name"),
        client.from("all_time_courses").select("id,code,display_name,difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]),
        client.from("climbers_legacy_baseline_imports").select("import_key,cutoff_at,applied_at").eq("import_key", key).maybeSingle(),
        client.from("climbers_legacy_baseline_source_rows").select("source_name,ytd_points,period_points,canonical_player_id,identity_status").eq("import_key", key),
        client.from("climbers_legacy_baselines").select("canonical_player_id").eq("import_key", key),
      ])
      const error = [seasons, events, passes, ytd, players, courses, marker, sourceRows, baselines].find((item) => item.error)?.error
      if (error) throw error
      return json({ data: { seasons: seasons.data || [], events: events.data || [], passes: passes.data || [], ytd: ytd.data || [], players: players.data || [], courses: courses.data || [], baselineMarker: marker.data, baselineSourceRows: sourceRows.data || [], baselines: baselines.data || [] } })
    }
    if (action === "climbers_rpc") return json({ data: await runRpc(authorization, "climbers", body) })
    if (action === "backfill_load") {
      const [courses, players, audit] = await Promise.all([
        client.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        client.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
        client.from("all_time_late_backfill_audit").select("card_batch_id,course_id,player_id,submitted_score,authoritative_submitted_date,source_label,status").order("authoritative_submitted_date", { ascending: false }),
      ])
      const error = [courses, players, audit].find((item) => item.error)?.error
      if (error) throw error
      return json({ data: { courses: courses.data || [], players: players.data || [], audit: audit.data || [] } })
    }
    if (action === "backfill_best") {
      const courseId = String(body.courseId || "").trim(), ids = Array.isArray(body.playerIds) ? body.playerIds : []
      const result = await client.from("all_time_best_records").select("player_id,score").eq("course_id", courseId).in("player_id", ids)
      if (result.error) throw result.error
      return json({ data: result.data || [] })
    }
    if (action === "backfill_rpc") return json({ data: await runRpc(authorization, "backfill", body) })
    return fail("Unsupported records admin action.")
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Records admin action failed." }, 400)
  }
}
