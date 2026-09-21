import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"
const RPCS = new Set(["save_major_event", "admin_register_major_player", "set_major_entry_status", "get_major_scorecard_verification_queue", "verify_major_scorecard", "reopen_major_scorecard", "set_major_round_scoring_state", "finalize_major_scoring_round", "get_major_test_testers", "configure_major_signup_release", "set_major_schedule_lock_hours", "release_additional_major_spots", "save_major_standard_signup_time", "remove_major_standard_signup_time", "copy_major_thursday_times_to_standard", "apply_major_standard_signup_times", "create_major_time_slot", "admin_set_major_day_choice", "save_major_schedule_group", "delete_major_schedule_group", "set_major_weekend_status", "publish_major_weekend_field", "save_major_final_placement", "save_major_event_information", "add_major_test_tester", "remove_major_test_tester", "set_major_test_event_listing", "create_major_scoring_session", "update_major_scoring_session", "clear_major_hole_score", "save_major_hole_scores", "save_major_scorecard_theme"])
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
    if (action === "play_day_upsert") {
      const result = await createAdminServiceClient().from("major_play_days").upsert(body.row as never, { onConflict: "major_event_id,day_number" })
      if (result.error) throw result.error
      return json({ data: result.data })
    }
    if (action === "time_slot_update" || action === "time_slot_delete") {
      const id = String(body.id || "")
      if (!id) return json({ error: "A time slot id is required." }, 400)
      const client = createAdminServiceClient()
      const result = action === "time_slot_delete"
        ? await client.from("major_time_slots").delete().eq("id", id)
        : await client.from("major_time_slots").update(body.values as never).eq("id", id)
      if (result.error) throw result.error
      return json({ data: result.data })
    }
    if (action === "table_read") {
      const allowed = new Set(["major_events", "major_play_days", "major_time_slots", "major_standard_signup_times", "major_entries", "major_entry_weekend_status", "major_schedule_groups", "major_final_placements", "major_entry_day_choices", "major_schedule_group_members", "major_scoring_participants", "major_hole_scores", "major_scoring_sessions"])
      const table = String(body.table || "")
      if (!allowed.has(table)) return json({ error: "That Major table is not in the approved read contract." }, 400)
      const query = (body.query || {}) as { select?: string; eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order?: { column: string; ascending?: boolean }; single?: boolean }
      let builder = createAdminServiceClient().from(table).select(query.select || "*")
      for (const [column, value] of Object.entries(query.eq || {})) builder = builder.eq(column, value)
      for (const [column, value] of Object.entries(query.in || {})) builder = builder.in(column, value)
      if (query.order) builder = builder.order(query.order.column, { ascending: query.order.ascending ?? true })
      const result = query.single ? await builder.maybeSingle() : await builder
      if (result.error) throw result.error
      return json({ data: result.data })
    }
    const client = createAdminServiceClient()
    if (action === "events_load") {
      const result = await client.from("major_events").select("*").order("slug")
      if (result.error) throw result.error
      return json({ data: result.data || [] })
    }
    if (action === "entries_load") {
      const result = await client.from("major_entries").select("*").eq("major_event_id", String(body.majorEventId || "")).order("registered_at")
      if (result.error) throw result.error
      return json({ data: result.data || [] })
    }
    if (action === "verification_load") {
      const events = await client.from("major_events").select("*").order("slug")
      const days = await client.from("major_play_days").select("*").order("day_number")
      if (events.error) throw events.error
      if (days.error) throw days.error
      const eventId = String(body.majorEventId || "")
      const queue = eventId ? await authorization.supabase.rpc("get_major_scorecard_verification_queue", { p_major_event_id: eventId }) : { data: [], error: null }
      const entries = eventId ? await client.from("major_entries").select("id", { count: "exact", head: true }).eq("major_event_id", eventId).in("status", ["registered", "confirmed"]) : { count: 0, error: null }
      if (queue.error) throw queue.error
      if (entries.error) throw entries.error
      return json({ data: { events: events.data || [], days: days.data || [], cards: queue.data || [], entryCount: entries.count || 0 } })
    }
    if (action === "rpc") {
      const name = String(body.name || "")
      if (!RPCS.has(name)) return json({ error: "That Major RPC is not in the approved admin contract." }, 400)
      const result = await authorization.supabase.rpc(name, (body.args || {}) as Record<string, unknown>)
      if (result.error) throw result.error
      return json({ data: result.data })
    }
    return json({ error: "Unknown Major admin action." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Major admin request failed." }, 400)
  }
}
