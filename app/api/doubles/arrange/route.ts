import { NextResponse } from "next/server"
import { authorizeDoublesParticipant } from "@/lib/doublesParticipantServer"
import { applyDoublesArrangeMutation } from "@/lib/doublesArrangeRuntime"

// Shared mutation helper preserves the durable reminder uniqueness contract:
// onConflict: "fixture_id,recipient_player_id,reminder_key".

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
  const fixtureId = new URL(request.url).searchParams.get("fixture_id")
  if (!fixtureId) return jsonError("fixture_id is required")
  const authorization = await authorizeDoublesParticipant(fixtureId)
  if (!authorization.authorized) return jsonError(authorization.message, authorization.status)

  const [arrangement, proposals, chat, availability] = await Promise.all([
    authorization.client.from("doubles_arrangements").select("*").eq("fixture_id", fixtureId).maybeSingle(),
    authorization.client.from("doubles_arrangement_proposals").select("*").eq("fixture_id", fixtureId).order("created_at", { ascending: true }),
    authorization.client.from("doubles_fixture_chat").select("id,player_id,body,created_at").eq("fixture_id", fixtureId).order("created_at", { ascending: true }),
    authorization.client.from("player_master_availability").select("player_id,timezone,windows,updated_at").in("player_id", authorization.participantIds),
  ])
  if (arrangement.error || proposals.error || chat.error || availability.error) return jsonError("Doubles Arrange state is temporarily unavailable.", 503)
  return NextResponse.json({ fixture: authorization.fixture, participant_id: authorization.participantId, arrangement: arrangement.data, proposals: proposals.data ?? [], chat: chat.data ?? [], availability: availability.data ?? [] })
}

export async function POST(request: Request) {
  let body: { fixture_id?: string; action?: string; timezone?: string; windows?: unknown; proposed_for?: string; message?: string }
  try { body = await request.json() } catch { return jsonError("Invalid Arrange request") }
  if (!body.fixture_id || !body.action) return jsonError("fixture_id and action are required")
  const authorization = await authorizeDoublesParticipant(body.fixture_id)
  if (!authorization.authorized) return jsonError(authorization.message, authorization.status)
  const { client, participantId, participantIds } = authorization

  if (body.action === "save_availability") {
    if (!body.timezone || !Array.isArray(body.windows)) return jsonError("timezone and availability windows are required")
    const result = await client.from("player_master_availability").upsert({ player_id: participantId, timezone: body.timezone, windows: body.windows, updated_at: new Date().toISOString() })
    if (result.error) return jsonError(result.error.message, 400)
    return NextResponse.json({ saved: true })
  }

  if (body.action === "message") {
    if (!body.message?.trim() || body.message.trim().length > 2000) return jsonError("Message must be between 1 and 2000 characters")
    const result = await client.from("doubles_fixture_chat").insert({ fixture_id: body.fixture_id, player_id: participantId, body: body.message.trim() }).select("id,player_id,body,created_at").single()
    if (result.error) return jsonError(result.error.message, 400)
    return NextResponse.json({ message: result.data })
  }

  if (["propose", "counter", "accept"].includes(body.action)) {
    if (!body.proposed_for || Number.isNaN(Date.parse(body.proposed_for))) return jsonError("A valid proposed game time is required")
    try {
      const result = await applyDoublesArrangeMutation({ client, fixtureId: body.fixture_id, participantId, participantIds, action: body.action as "propose" | "counter" | "accept", proposedFor: body.proposed_for })
      return NextResponse.json(result)
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Arrange mutation failed", 400)
    }
  }

  return jsonError("Unsupported Doubles Arrange action")
}
