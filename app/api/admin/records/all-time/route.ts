import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing trusted Supabase server configuration")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const client = adminClient()
  const url = new URL(request.url)
  const view = url.searchParams.get("view")
  try {
    if (view === "entry") {
      const [courses, players, seasons] = await Promise.all([
        client.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        client.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
        client.from("climbers_seasons").select("id,label,starts_at,ends_at,status").in("status", ["active", "awaiting_finalization"]).order("starts_at", { ascending: false }),
      ])
      const error = courses.error || players.error || seasons.error
      if (error) return json({ error: error.message }, 500)
      return json({ courses: courses.data ?? [], players: players.data ?? [], seasons: seasons.data ?? [] })
    }
    if (view === "entry-bests") {
      const courseId = url.searchParams.get("courseId")
      if (!courseId) return json({ error: "courseId is required" }, 400)
      const result = await client.from("all_time_best_records").select("player_id,score").eq("course_id", courseId)
      if (result.error) return json({ error: result.error.message }, 500)
      return json({ records: result.data ?? [] })
    }
    if (view === "single-catalog") {
      const result = await client.from("all_time_courses").select("id,code,display_name,difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name")
      if (result.error) return json({ error: result.error.message }, 500)
      return json({ courses: result.data ?? [] })
    }
    if (view === "single-records") {
      const courseId = url.searchParams.get("courseId")
      if (!courseId) return json({ error: "courseId is required" }, 400)
      const [best, unresolved] = await Promise.all([
        client.from("all_time_best_records").select("id,course_id,score,historical_player_name,player:players(screen_name)").eq("course_id", courseId),
        client.from("all_time_record_observations").select("id,course_id,score,historical_player_name").eq("course_id", courseId).in("identity_status", ["unresolved", "ambiguous"]),
      ])
      const error = best.error || unresolved.error
      if (error) return json({ error: error.message }, 500)
      return json({ records: best.data ?? [], unresolved: unresolved.data ?? [] })
    }
    if (view === "history") {
      const [courses, players, rows] = await Promise.all([
        client.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        client.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
        client.from("all_time_record_observations").select("id,card_batch_id,course_id,player_id,historical_player_name,score,entry_type,hole_strokes,source_label,provenance_reference,notes,observed_at,updated_at,recorded_at,recorded_by,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,voided_at,voided_by,void_reason,corrected_at").order("observed_at", { ascending: false }),
      ])
      const error = courses.error || players.error || rows.error
      if (error) return json({ error: error.message }, 500)
      return json({ courses: courses.data ?? [], players: players.data ?? [], rows: rows.data ?? [] })
    }
    if (view === "backfill") {
      const [courses, players, existing] = await Promise.all([
        client.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        client.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
        client.from("all_time_late_backfill_audit").select("card_batch_id,course_id,player_id,submitted_score,authoritative_submitted_date,source_label,status").order("authoritative_submitted_date", { ascending: false }),
      ])
      const error = courses.error || players.error || existing.error
      if (error) return json({ error: error.message }, 500)
      return json({ courses: courses.data ?? [], players: players.data ?? [], existing: existing.data ?? [] })
    }
    if (view === "backfill-bests") {
      const courseId = url.searchParams.get("courseId")
      const playerIds = (url.searchParams.get("playerIds") ?? "").split(",").filter(Boolean)
      if (!courseId || playerIds.length === 0) return json({ records: [] })
      const result = await client.from("all_time_best_records").select("player_id,score").eq("course_id", courseId).in("player_id", playerIds)
      if (result.error) return json({ error: result.error.message }, 500)
      return json({ records: result.data ?? [] })
    }
    return json({ error: "Unknown records view" }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Protected records read failed" }, 500)
  }
}
