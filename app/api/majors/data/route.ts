import "server-only"

import { createClient } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PUBLIC_EVENT_FIELDS = "id,slug,name,year,status,signup_open,starts_at,ends_at,is_public,is_test_event,test_event_listed,description,stream_url,stream_platform,stream_label,stream_scheduled_at,stream_is_live,schedule_timezone,signup_instructions,scheduling_instructions,qualifier_information,cut_information,weekend_information,room_rules,stream_information,weekend_status_published_at,secondary_trophy_display_name"

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Major public server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function allowedEvent(event: { id: string; is_public: boolean; is_test_event: boolean; test_event_listed: boolean }) {
  if (event.is_public || (event.is_test_event && event.test_event_listed)) return true
  if (!event.is_test_event) return false
  const client = await createServerSupabaseClient()
  const result = await client.rpc("is_current_user_major_test_tester", { p_major_event_id: event.id })
  return result.data === true && !result.error
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const resource = params.get("resource")
  const slug = params.get("slug")?.trim() || null

  try {
    const supabase = publicClient()

    if (resource === "events") {
      const result = await supabase.from("major_events").select(PUBLIC_EVENT_FIELDS).or("is_test_event.eq.false,test_event_listed.eq.true").order("starts_at", { ascending: true, nullsFirst: false })
      if (result.error) return json({ error: result.error.message }, 503)
      return json({ events: result.data || [] })
    }

    if (resource === "event") {
      if (!slug) return json({ error: "slug is required." }, 400)
      const result = await supabase.from("major_events").select(PUBLIC_EVENT_FIELDS).eq("slug", slug).maybeSingle()
      if (result.error) return json({ error: result.error.message }, 503)
      if (!result.data || !(await allowedEvent(result.data))) return json({ error: "Major not found." }, 404)
      return json({ event: result.data })
    }

    if (resource === "detail") {
      if (!slug) return json({ error: "slug is required." }, 400)
      const eventResult = await supabase.from("major_events").select(PUBLIC_EVENT_FIELDS).eq("slug", slug).maybeSingle()
      if (eventResult.error) return json({ error: eventResult.error.message }, 503)
      if (!eventResult.data || !(await allowedEvent(eventResult.data))) return json({ error: "Major not found." }, 404)
      const [entries, days] = await Promise.all([
        supabase.from("major_entries").select("id,major_event_id,player_screen_name_snapshot,status,registered_at,updated_at").eq("major_event_id", eventResult.data.id).order("registered_at"),
        supabase.from("major_play_days").select("id,major_event_id,day_number,label,play_date,choices_locked,selection_locks_at").eq("major_event_id", eventResult.data.id).order("day_number"),
      ])
      if (entries.error || days.error) return json({ error: entries.error?.message || days.error?.message }, 503)
      const dayIds = (days.data || []).map((day) => day.id)
      const slots = dayIds.length ? await supabase.from("major_time_slots").select("id,play_day_id,starts_at,label,is_available").in("play_day_id", dayIds).eq("is_available", true).order("starts_at") : { data: [], error: null }
      if (slots.error) return json({ error: slots.error.message }, 503)
      return json({ event: eventResult.data, entries: entries.data || [], days: days.data || [], slots: slots.data || [] })
    }

    return json({ error: "Unknown public Major data resource." }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Public Major data could not be loaded." }, 503)
  }
}
