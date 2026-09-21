import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminServiceClient } from "@/lib/admin/adminServiceClient"

export const runtime = "nodejs"
const RPCS = new Set(["save_major_event", "admin_register_major_player", "set_major_entry_status", "get_major_scorecard_verification_queue", "verify_major_scorecard", "reopen_major_scorecard", "set_major_round_scoring_state", "finalize_major_scoring_round"])
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action || "")
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
