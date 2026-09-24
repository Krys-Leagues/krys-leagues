import { NextResponse } from "next/server"
import { authorizeDoublesParticipant } from "@/lib/doublesParticipantServer"

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
    const current = await client.from("doubles_arrangements").select("state").eq("fixture_id", body.fixture_id).maybeSingle()
    if (current.error) return jsonError(current.error.message, 400)
    const state = current.data?.state ?? "NOT ARRANGED"
    const nextState = body.action === "propose" && state === "NOT ARRANGED" ? "PROPOSED" : body.action === "counter" && ["PROPOSED", "COUNTERED"].includes(state) ? "COUNTERED" : body.action === "accept" && ["PROPOSED", "COUNTERED"].includes(state) ? "ACCEPTED" : null
    if (!nextState) return jsonError("Arrange action is not valid for the current state")
    await client.from("doubles_arrangement_proposals").update({ state: "OBSOLETE" }).eq("fixture_id", body.fixture_id).in("state", ["PROPOSED", "COUNTERED"])
    const proposal = await client.from("doubles_arrangement_proposals").insert({ fixture_id: body.fixture_id, proposed_for: body.proposed_for, proposed_by: participantId, state: nextState }).select("*").single()
    if (proposal.error) return jsonError(proposal.error.message, 400)
    const arrangement = await client.from("doubles_arrangements").upsert({ fixture_id: body.fixture_id, state: nextState, proposed_at: new Date().toISOString(), accepted_at: nextState === "ACCEPTED" ? new Date().toISOString() : null, accepted_for: nextState === "ACCEPTED" ? body.proposed_for : null, last_actor_player_id: participantId }).select("*").single()
    if (arrangement.error) return jsonError(arrangement.error.message, 400)
    if (nextState === "ACCEPTED") {
      const eligibleAt = new Date(Date.parse(body.proposed_for) - 20 * 60 * 1000).toISOString()
      await client.from("doubles_arrangement_reminders").upsert(participantIds.map((recipientPlayerId) => ({ fixture_id: body.fixture_id, recipient_player_id: recipientPlayerId, reminder_key: body.proposed_for!, eligible_at: eligibleAt })), { onConflict: "fixture_id,recipient_player_id,reminder_key", ignoreDuplicates: true })
    }
    return NextResponse.json({ arrangement: arrangement.data, proposal: proposal.data })
  }

  return jsonError("Unsupported Doubles Arrange action")
}
