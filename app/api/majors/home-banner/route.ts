import "server-only"

import { createClient } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type EventRow = {
  id: string
  signup_open: boolean
  signup_capacity: number | null
  public_signup_opens_at: string | null
  priority_signup_enabled: boolean
  priority_signup_opens_at: string | null
  priority_source_event_id: string | null
  schedule_timezone: string | null
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Major homepage status is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function isEligiblePlacement(row: { weekend_field: string | null; field_placement: number | null; result_status: string; is_finalized: boolean }) {
  return row.weekend_field === "main"
    && Number.isInteger(row.field_placement)
    && Number(row.field_placement) >= 1
    && Number(row.field_placement) <= 10
    && row.result_status === "completed"
    && row.is_finalized
}

export async function GET(request: Request) {
  try {
    const supabase = publicClient()
    const eventResult = await supabase
      .from("major_events")
      .select("id,signup_open,signup_capacity,public_signup_opens_at,priority_signup_enabled,priority_signup_opens_at,priority_source_event_id,schedule_timezone")
      .eq("slug", "major-2")
      .maybeSingle()

    if (eventResult.error) return json({ error: eventResult.error.message }, 503)
    const event = eventResult.data as EventRow | null
    if (!event) return json({ state: "closed", publicSignupOpensAt: null, scheduleTimeZone: "America/New_York" })

    const claimedResult = await supabase
      .from("major_entries")
      .select("id", { count: "exact", head: true })
      .eq("major_event_id", event.id)
      .in("status", ["registered", "confirmed"])
    if (claimedResult.error) return json({ error: claimedResult.error.message }, 503)

    const now = Date.now()
    const publicOpening = event.public_signup_opens_at ? new Date(event.public_signup_opens_at).getTime() : null
    const priorityOpening = event.priority_signup_opens_at ? new Date(event.priority_signup_opens_at).getTime() : null
    let eligibleForPriority = false

    if (
      event.priority_signup_enabled
      && event.priority_source_event_id
      && priorityOpening !== null
      && publicOpening !== null
      && now >= priorityOpening
      && now < publicOpening
    ) {
      const authClient = await createServerSupabaseClient()
      const authorization = request.headers.get("authorization")
      const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || null
      const userResult = accessToken
        ? await authClient.auth.getUser(accessToken)
        : await authClient.auth.getUser()
      if (userResult.data.user) {
        const canonicalResult = await authClient.rpc("current_user_canonical_player_id")
        const canonicalPlayerId = typeof canonicalResult.data === "string" ? canonicalResult.data : null
        if (canonicalPlayerId) {
          const placementResult = await supabase
            .from("major_final_placements")
            .select("weekend_field,field_placement,result_status,is_finalized")
            .eq("major_event_id", event.priority_source_event_id)
            .eq("player_id", canonicalPlayerId)
            .maybeSingle()
          eligibleForPriority = !placementResult.error && Boolean(placementResult.data && isEligiblePlacement(placementResult.data))
        }
      }
    }

    let state: "upcoming" | "priority" | "open" | "full" | "closed" = "closed"
    if (event.signup_open) {
      if (publicOpening !== null && now < publicOpening) state = eligibleForPriority ? "priority" : "upcoming"
      else if (event.signup_capacity !== null && (claimedResult.count || 0) >= event.signup_capacity) state = "full"
      else state = "open"
    }

    return json({
      state,
      publicSignupOpensAt: event.public_signup_opens_at,
      scheduleTimeZone: event.schedule_timezone || "America/New_York",
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Major homepage status could not be loaded." }, 503)
  }
}
