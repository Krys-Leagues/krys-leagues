import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import {
  prepareStrokeDiscordSnapshot,
  runStrokeDiscordSendExclusive,
  type StrokeDiscordMode,
  type StrokeDiscordSnapshot,
} from "@/lib/strokeDiscord"
import {
  getStrokeDiscordBotToken,
  getStrokeDiscordChannelId,
  isStrokeDiscordDivision,
  loadCurrentStrokeDiscordSource,
  postStrokeDivisionImage,
} from "@/lib/strokeDiscordServer"
import { createStrokeDivisionImage } from "@/lib/strokeDiscordSnapshot"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Choose a valid Stroke division and send type." }, { status: 400 })
  }

  const divisionNumber = typeof body === "object" && body !== null && "divisionNumber" in body
    ? (body as { divisionNumber?: unknown }).divisionNumber
    : null
  const mode = typeof body === "object" && body !== null && "mode" in body
    ? (body as { mode?: unknown }).mode
    : null

  if (!isStrokeDiscordDivision(divisionNumber) || (mode !== "division" && mode !== "reminder")) {
    return NextResponse.json({ error: "Choose a valid Stroke division and send type." }, { status: 400 })
  }

  const botToken = getStrokeDiscordBotToken()
  if (!botToken) {
    return NextResponse.json({ error: "The Discord bot is not configured for Stroke posting." }, { status: 503 })
  }

  const channelId = getStrokeDiscordChannelId(divisionNumber)
  if (!channelId) {
    return NextResponse.json({ error: "Discord is not configured for this Stroke division." }, { status: 503 })
  }

  const key = `stroke-current-division-${divisionNumber}-${mode}`
  const result = await runStrokeDiscordSendExclusive(key, async () => {
    const source = await loadCurrentStrokeDiscordSource(authorization.supabase)
    const snapshot = prepareStrokeDiscordSnapshot(source, divisionNumber, mode as StrokeDiscordMode)
    const image = createStrokeDivisionImage(snapshot)
    const png = await image.arrayBuffer()
    const messageId = await postStrokeDivisionImage({ botToken, channelId, snapshot, png })
    logSendResult("success", authorization.user.id, snapshot, messageId)
    return snapshot
  }).catch((sendError: unknown) => {
    console.error("STROKE_DISCORD_SEND_FAILED", {
      division_number: divisionNumber,
      mode,
      admin_user_id: authorization.user.id,
      occurred_at: new Date().toISOString(),
      error: sendError instanceof Error ? sendError.message : "Unknown failure",
    })
    return null
  })

  if (result === null) {
    return NextResponse.json({ error: mode === "reminder" ? "The Stroke reminder could not be sent. Confirm unplayed assignments remain." : "The Stroke division image could not be sent. Please try again." }, { status: 502 })
  }
  if (result.status === "in-flight") {
    return NextResponse.json({ error: "That Stroke division send is already in progress." }, { status: 409 })
  }

  return NextResponse.json({
    success: true,
    seasonNumber: result.value.season_number,
    divisionNumber: result.value.division_number,
    mode: result.value.mode,
  })
}

function logSendResult(
  status: "success",
  adminUserId: string,
  snapshot: StrokeDiscordSnapshot,
  discordMessageId: string | null,
) {
  console.info("STROKE_DISCORD_SEND", {
    status,
    admin_user_id: adminUserId,
    season_number: snapshot.season_number,
    division_number: snapshot.division_number,
    mode: snapshot.mode,
    discord_message_id: discordMessageId,
    occurred_at: new Date().toISOString(),
  })
}
