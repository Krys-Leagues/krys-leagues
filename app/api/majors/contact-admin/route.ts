import { NextResponse } from "next/server"

import { getDiscordBotToken } from "@/lib/matchDiscordServer"
import { isMastersHelpCategory } from "@/lib/mastersRules"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MASTERS_ADMIN_DISCORD_IDS = [
  "925865346802524180",
  "839633843804045344",
  "1020077950676250654",
  "1026481358522023957",
] as const

type HelpContext = {
  request_id: string
  player_id: string
  player_screen_name: string
  event_name: string
  round_number: number
  room_label: string
  scheduled_start: string
  local_display_time: string | null
  category: string
  message: string
  submitted_at: string
  other_room: null | { room_label: string; players: string[] }
}

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

  const context = created.data as HelpContext
  const token = getDiscordBotToken()
  const channelId = process.env.DISCORD_MASTERS_ADMIN_CHANNEL_ID?.trim()
  const service = createScorecardServiceClient()
  if (!token || !channelId || !/^\d+$/.test(channelId)) {
    await service.from("major_admin_help_requests").update({
      delivery_status: "failed",
      delivery_attempted_at: new Date().toISOString(),
      delivery_error: "Masters Discord delivery is not configured.",
    }).eq("id", context.request_id)
    return response({ error: "WE COULD NOT SEND YOUR ALERT. Please try again or contact an admin directly." }, 503)
  }

  const otherRoom = context.other_room
    ? `\n\n**ANOTHER ROOM IS RUNNING**\nRoom: ${context.other_room.room_label}\nPlayers:\n${context.other_room.players.map((name) => `• ${name}`).join("\n")}`
    : "\n\n**NO OTHER MASTERS ROOM RUNNING AT THIS TIME**"
  const noShowContext = context.category === "PLAYER NO-SHOW" ? otherRoom : ""
  const mentions = MASTERS_ADMIN_DISCORD_IDS.map((id) => `<@${id}>`).join(" ")
  const localTime = context.local_display_time ? `\nPlayer local display: ${context.local_display_time}` : ""
  const content = `${mentions}\n\n**MASTERS ADMIN ALERT**\n**NEEDS ADMIN DECISION**\n\nPlayer: ${context.player_screen_name}\nPlayer ID: ${context.player_id}\nRoom: ${context.room_label}\nRound: ${context.round_number}\nScheduled time: ${context.scheduled_start}${localTime}\nCategory: ${context.category}\nPlayer message: ${context.message}\nSubmitted: ${context.submitted_at}${noShowContext}`

  try {
    const discord = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: [], users: [...MASTERS_ADMIN_DISCORD_IDS] },
      }),
    })
    if (!discord.ok) throw new Error(`Discord returned status ${discord.status}.`)
    const discordBody = await discord.json() as { id?: string }
    await service.from("major_admin_help_requests").update({
      delivery_status: "sent",
      delivery_attempted_at: new Date().toISOString(),
      discord_message_id: discordBody.id || null,
      delivery_error: null,
    }).eq("id", context.request_id)
    return response({ sent: true })
  } catch (caught) {
    await service.from("major_admin_help_requests").update({
      delivery_status: "failed",
      delivery_attempted_at: new Date().toISOString(),
      delivery_error: caught instanceof Error ? caught.message.slice(0, 500) : "Discord delivery failed.",
    }).eq("id", context.request_id)
    return response({ error: "WE COULD NOT SEND YOUR ALERT. Please try again or contact an admin directly." }, 503)
  }
}
