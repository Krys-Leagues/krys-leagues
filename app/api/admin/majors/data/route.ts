import "server-only"

import { createClient } from "@supabase/supabase-js"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function majorAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Major admin server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function requiredParam(request: Request, name: string) {
  return new URL(request.url).searchParams.get(name)?.trim() || null
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const resource = new URL(request.url).searchParams.get("resource")
  const eventId = requiredParam(request, "eventId")
  const sessionId = requiredParam(request, "sessionId")

  try {
    const supabase = majorAdminClient()

    if (resource === "events") {
      const result = await supabase.from("major_events").select("*").order("slug")
      if (result.error) return json({ error: result.error.message }, 503)
      return json({ events: result.data || [] })
    }

    if (resource === "entries") {
      if (!eventId) return json({ error: "eventId is required." }, 400)
      const result = await supabase.from("major_entries").select("*").eq("major_event_id", eventId).order("registered_at")
      if (result.error) return json({ error: result.error.message }, 503)
      return json({ entries: result.data || [] })
    }

    if (resource === "schedule") {
      if (!eventId) return json({ error: "eventId is required." }, 400)
      const dayResult = await supabase.from("major_play_days").select("*").eq("major_event_id", eventId).order("day_number")
      if (dayResult.error) return json({ error: dayResult.error.message }, 503)
      const days = dayResult.data || []
      const dayIds = days.map((day) => day.id)
      const [slotResult, standardTimeResult, entryResult, weekendResult, groupResult, placementResult, testerResult] = await Promise.all([
        dayIds.length ? supabase.from("major_time_slots").select("*").in("play_day_id", dayIds).order("starts_at") : Promise.resolve({ data: [], error: null }),
        supabase.from("major_standard_signup_times").select("*").eq("major_event_id", eventId).eq("is_active", true).order("local_time"),
        supabase.from("major_entries").select("*").eq("major_event_id", eventId).order("player_screen_name_snapshot"),
        supabase.from("major_entry_weekend_status").select("*").eq("major_event_id", eventId),
        supabase.from("major_schedule_groups").select("*").eq("major_event_id", eventId).order("group_label"),
        supabase.from("major_final_placements").select("*").eq("major_event_id", eventId),
        supabase.rpc("get_major_test_testers", { p_major_event_id: eventId }),
      ])
      const entries = entryResult.data || []
      const groups = groupResult.data || []
      const [choiceResult, memberResult] = await Promise.all([
        entries.length ? supabase.from("major_entry_day_choices").select("*").in("entry_id", entries.map((entry) => entry.id)) : Promise.resolve({ data: [], error: null }),
        groups.length ? supabase.from("major_schedule_group_members").select("*").in("group_id", groups.map((group) => group.id)) : Promise.resolve({ data: [], error: null }),
      ])
      const error = slotResult.error || standardTimeResult.error || entryResult.error || weekendResult.error || groupResult.error || placementResult.error || testerResult.error || choiceResult.error || memberResult.error
      if (error) return json({ error: error.message }, 503)
      return json({
        days,
        slots: slotResult.data || [],
        standardTimes: standardTimeResult.data || [],
        entries,
        choices: choiceResult.data || [],
        weekend: weekendResult.data || [],
        groups,
        members: memberResult.data || [],
        placements: placementResult.data || [],
        testers: testerResult.data || [],
      })
    }

    if (resource === "scoring") {
      const events = await supabase.from("major_events").select("*").order("slug")
      const sessions = await supabase.from("major_scoring_sessions").select("*").order("updated_at", { ascending: false })
      if (events.error || sessions.error) return json({ error: events.error?.message || sessions.error?.message }, 503)
      if (!sessionId) return json({ events: events.data || [], sessions: sessions.data || [], participants: [], scores: [] })
      const [participants, scores] = await Promise.all([
        supabase.from("major_scoring_participants").select("*").eq("session_id", sessionId).order("position"),
        supabase.from("major_hole_scores").select("*").eq("session_id", sessionId).order("hole_number"),
      ])
      if (participants.error || scores.error) return json({ error: participants.error?.message || scores.error?.message }, 503)
      return json({ events: events.data || [], sessions: sessions.data || [], participants: participants.data || [], scores: scores.data || [] })
    }

    if (resource === "verification") {
      const [events, days] = await Promise.all([
        supabase.from("major_events").select("*").order("slug"),
        supabase.from("major_play_days").select("*").order("day_number"),
      ])
      if (events.error || days.error) return json({ error: events.error?.message || days.error?.message }, 503)
      const selectedEventId = eventId || events.data?.[0]?.id
      if (!selectedEventId) return json({ events: events.data || [], days: days.data || [], cards: [], entryCount: 0 })
      const [queue, entries] = await Promise.all([
        supabase.rpc("get_major_scorecard_verification_queue", { p_major_event_id: selectedEventId }),
        supabase.from("major_entries").select("id", { count: "exact", head: true }).eq("major_event_id", selectedEventId).in("status", ["registered", "confirmed"]),
      ])
      if (queue.error || entries.error) return json({ error: queue.error?.message || entries.error?.message }, 503)
      return json({ events: events.data || [], days: days.data || [], cards: queue.data || [], entryCount: entries.count || 0 })
    }

    return json({ error: "Unknown Major admin data resource." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Major admin data could not be loaded." }, 503)
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json() as Record<string, unknown>
    const action = body.action
    const supabase = majorAdminClient()

    if (action === "save_play_day") {
      const row = {
        major_event_id: String(body.major_event_id || ""),
        day_number: Number(body.day_number),
        label: String(body.label || ""),
        play_date: String(body.play_date || ""),
        choices_locked: Boolean(body.choices_locked),
      }
      if (!row.major_event_id || !Number.isInteger(row.day_number) || row.day_number < 1 || row.day_number > 4 || !row.play_date) return json({ error: "Valid Major play-day fields are required." }, 400)
      const result = await supabase.from("major_play_days").upsert(row, { onConflict: "major_event_id,day_number" }).select("*").single()
      if (result.error) return json({ error: result.error.message }, 503)
      return json({ data: result.data })
    }

    if (action === "update_time_slot") {
      const id = String(body.id || "")
      if (!id) return json({ error: "Time-slot id is required." }, 400)
      const patch: Record<string, unknown> = {}
      if (typeof body.starts_at === "string") patch.starts_at = body.starts_at
      if (typeof body.label === "string") patch.label = body.label.trim() || null
      if (typeof body.is_available === "boolean") patch.is_available = body.is_available
      if (body.clear_standard_signup_time) patch.standard_signup_time_id = null
      const result = await supabase.from("major_time_slots").update(patch).eq("id", id).select("*").single()
      if (result.error) return json({ error: result.error.message }, 503)
      return json({ data: result.data })
    }

    if (action === "delete_time_slot") {
      const id = String(body.id || "")
      if (!id) return json({ error: "Time-slot id is required." }, 400)
      const result = await supabase.from("major_time_slots").delete().eq("id", id)
      if (result.error) return json({ error: result.error.message }, 503)
      return json({ ok: true })
    }

    return json({ error: "Unknown Major admin action." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Major admin change could not be saved." }, 503)
  }
}
