import { NextResponse } from "next/server"

import {
  deliverMastersAdminDms,
  formatMastersAdminDm,
  type MastersAdminHelpContext,
} from "@/lib/mastersDiscord"
import { loadMastersAdminDmRecipients } from "@/lib/mastersDiscordServer"
import { getDiscordBotToken } from "@/lib/matchDiscordServer"
import { isMastersHelpCategory } from "@/lib/mastersRules"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return response({ error: "Sign in to contact the Masters admins." }, 401)

  const body = await request.json().catch(() => null) as null | Record<string, unknown>
  const eventId = typeof body?.eventId === "string" ? body.eventId : ""
  const playDayId = typeof body?.playDayId === "string" ? body.playDayId : ""
  const category = body?.category
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  const localDisplayTime = typeof body?.localDisplayTime === "string" ? body.localDisplayTime.trim() : ""
  if (!UUID.test(eventId) || !UUID.test(playDayId) || !isMastersHelpCategory(category) || message.length < 2 || message.length > 800 || localDisplayTime.length > 200) {
    return response({ error: "Complete the Masters help form before sending." }, 400)
  }

  const created = await supabase.rpc("create_my_masters_admin_help_request", {
    p_major_event_id: eventId,
    p_play_day_id: playDayId,
    p_category: category,
    p_message: message,
    p_local_display_time: localDisplayTime || null,
  })
  if (created.error || !created.data) return response({ error: created.error?.message || "The Masters alert could not be recorded." }, 403)

  const context = created.data as MastersAdminHelpContext
  const token = getDiscordBotToken()
  const service = createScorecardServiceClient()
  if (!token) {
    await service.from("major_admin_help_requests").update({
      delivery_status: "failed",
      delivery_attempted_at: new Date().toISOString(),
      delivery_error: "Masters Discord delivery is not configured.",
    }).eq("id", context.request_id)
    return response({ error: "WE COULD NOT SEND YOUR ALERT. Please try again or contact an admin directly." }, 503)
  }

  try {
    const recipients = await loadMastersAdminDmRecipients(service)
    const deliveries = await deliverMastersAdminDms({
      botToken: token,
      recipients,
      content: formatMastersAdminDm(context),
    })
    const attemptedAt = new Date().toISOString()
    const persisted = await service.from("major_admin_help_deliveries").upsert(deliveries.map((delivery) => ({
      request_id: context.request_id,
      admin_player_id: delivery.canonical_player_id,
      admin_label_snapshot: delivery.label,
      admin_screen_name_snapshot: delivery.canonical_screen_name,
      discord_user_id_snapshot: delivery.discord_user_id,
      delivery_status: delivery.status,
      delivery_attempted_at: attemptedAt,
      discord_channel_id: delivery.discord_channel_id,
      discord_message_id: delivery.discord_message_id,
      delivery_error: delivery.error,
    })), { onConflict: "request_id,admin_player_id" })
    if (persisted.error) throw new Error(persisted.error.message)

    const successful = deliveries.filter((delivery) => delivery.status === "sent")
    const failedLabels = deliveries.filter((delivery) => delivery.status === "failed").map((delivery) => delivery.label)
    const overall = await service.from("major_admin_help_requests").update({
      delivery_status: successful.length > 0 ? "sent" : "failed",
      delivery_attempted_at: attemptedAt,
      discord_message_id: successful[0]?.discord_message_id || null,
      delivery_error: failedLabels.length > 0 ? `DM failed for: ${failedLabels.join(", ")}.` : null,
    }).eq("id", context.request_id)
    if (overall.error) throw new Error(overall.error.message)
    if (successful.length > 0) return response({ sent: true, delivered: successful.length, attempted: deliveries.length })
    return response({ error: "WE COULD NOT SEND YOUR ALERT. Please try again or contact an admin directly." }, 503)
  } catch (caught) {
    await service.from("major_admin_help_requests").update({
      delivery_status: "failed",
      delivery_attempted_at: new Date().toISOString(),
      delivery_error: caught instanceof Error ? caught.message.slice(0, 500) : "Discord delivery failed.",
    }).eq("id", context.request_id)
    return response({ error: "WE COULD NOT SEND YOUR ALERT. Please try again or contact an admin directly." }, 503)
  }
}
