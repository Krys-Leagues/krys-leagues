import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import {
  prepareMatchDiscordSnapshot,
  runMatchDiscordSendExclusive,
  type MatchDiscordSnapshot,
} from "@/lib/matchDiscord"
import {
  getDiscordBotToken,
  getMatchDiscordChannelId,
  isMatchDiscordDivision,
  loadMatchDiscordAssignmentResults,
  postMatchDivisionImage,
} from "@/lib/matchDiscordServer"
import { createMatchDivisionImage } from "@/lib/matchDiscordSnapshot"
import type { PublicMatchPayload } from "@/lib/publicMatch"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Choose a valid Match division." }, { status: 400 })
  }

  const divisionNumber = typeof body === "object" && body !== null && "divisionNumber" in body
    ? (body as { divisionNumber?: unknown }).divisionNumber
    : null

  if (!isMatchDiscordDivision(divisionNumber)) {
    return NextResponse.json({ error: "Choose a valid Match division." }, { status: 400 })
  }

  const botToken = getDiscordBotToken()
  if (!botToken) {
    return NextResponse.json(
      { error: "The Discord bot is not configured for Match posting." },
      { status: 503 },
    )
  }

  const channelId = getMatchDiscordChannelId(divisionNumber)
  if (!channelId) {
    return NextResponse.json(
      { error: "Discord is not configured for this Match division." },
      { status: 503 },
    )
  }

  const key = `match-current-division-${divisionNumber}`
  const result = await runMatchDiscordSendExclusive(key, async () => {
    const { data, error } = await authorization.supabase.rpc("get_public_match_play")
    if (error || !data) {
      throw new Error("MATCH_PUBLIC_READER_FAILED")
    }

    const publicMatch = data as PublicMatchPayload
    const seasonNumber = publicMatch.current.season_number
    if (seasonNumber === null) throw new Error("MATCH_CURRENT_SEASON_UNAVAILABLE")

    const assignmentResults = await loadMatchDiscordAssignmentResults({
      supabase: authorization.supabase,
      seasonNumber,
      divisionNumber,
    })
    const snapshot = prepareMatchDiscordSnapshot(publicMatch, divisionNumber, assignmentResults)
    const image = createMatchDivisionImage(snapshot)
    const png = await image.arrayBuffer()
    const messageId = await postMatchDivisionImage({ botToken, channelId, snapshot, png })
    logSendResult("success", authorization.user.id, snapshot, messageId)
    return snapshot
  }).catch((sendError: unknown) => {
    console.error("MATCH_DISCORD_SEND_FAILED", {
      division_number: divisionNumber,
      admin_user_id: authorization.user.id,
      occurred_at: new Date().toISOString(),
      error: sendError instanceof Error ? sendError.message : "Unknown failure",
    })
    return null
  })

  if (result === null) {
    return NextResponse.json(
      { error: "The Match division image could not be sent. Please try again." },
      { status: 502 },
    )
  }

  if (result.status === "in-flight") {
    return NextResponse.json(
      { error: "That Match division is already being sent." },
      { status: 409 },
    )
  }

  return NextResponse.json({
    success: true,
    seasonNumber: result.value.season_number,
    divisionNumber: result.value.division_number,
  })
}

function logSendResult(
  status: "success",
  adminUserId: string,
  snapshot: MatchDiscordSnapshot,
  discordMessageId: string | null,
) {
  console.info("MATCH_DISCORD_SEND", {
    status,
    admin_user_id: adminUserId,
    season_number: snapshot.season_number,
    division_number: snapshot.division_number,
    discord_message_id: discordMessageId,
    occurred_at: new Date().toISOString(),
  })
}
