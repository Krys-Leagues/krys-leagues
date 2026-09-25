import { NextResponse } from "next/server"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"
import { applyDoublesArrangeMutation } from "@/lib/doublesArrangeRuntime"
import { previewInteractionResponse, verifyInteractionSignature, verifySignedInteractionId } from "@/lib/doublesDiscordRuntime"

type Interaction = { data?: { custom_id?: string }; user?: { id?: string }; member?: { user?: { id?: string } }; message?: { channel_id?: string } }

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyInteractionSignature(raw, request.headers.get("x-krys-discord-signature"), process.env.DISCORD_INTERACTION_HMAC_SECRET || "")) return NextResponse.json({ error: "Invalid Discord interaction signature" }, { status: 401 })
  let body: Interaction
  try { body = JSON.parse(raw) as Interaction } catch { return NextResponse.json({ error: "Invalid interaction payload" }, { status: 400 }) }
  const customId = body.data?.custom_id || ""
  const preview = previewInteractionResponse(customId)
  if (preview) return NextResponse.json(preview)
  if (process.env.NEXT_SEASON_DOUBLES_DISCORD_ENABLED !== "true") return NextResponse.json({ error: "Next-season Doubles Discord runtime is disabled" }, { status: 403 })
  const signed = verifySignedInteractionId(customId, process.env.DISCORD_INTERACTION_HMAC_SECRET || "")
  if (!signed) return NextResponse.json({ error: "Invalid or expired interaction state" }, { status: 403 })
  const discordId = body.user?.id || body.member?.user?.id
  if (!discordId) return NextResponse.json({ error: "Discord identity is required" }, { status: 403 })
  const client = createDoublesRuntimeClient()
  const player = await client.from("players").select("id").eq("discord_id", discordId).maybeSingle()
  if (player.error || !player.data?.id) return NextResponse.json({ error: "Canonical Discord player identity could not be resolved" }, { status: 403 })
  const fixture = await client.from("doubles_managed_fixtures").select("id,home_season_team_id,away_season_team_id,season_id").eq("id", signed.fixtureId).maybeSingle()
  if (fixture.error || !fixture.data) return NextResponse.json({ error: "Doubles fixture not found" }, { status: 404 })
  const members = await client.from("doubles_season_team_members").select("player_id").eq("season_id", fixture.data.season_id).in("season_team_id", [fixture.data.home_season_team_id, fixture.data.away_season_team_id]).eq("role", "member").is("effective_to", null)
  const participantIds = [...new Set((members.data || []).map((row) => row.player_id as string))]
  if (members.error || participantIds.length !== 4 || !participantIds.includes(player.data.id)) return NextResponse.json({ error: "Only the four scheduled Doubles players may interact" }, { status: 403 })
  if (signed.action === "scorecard") return NextResponse.json({ type: 4, data: { content: "Open the secure fixture scorecard upload page to submit privately.", flags: 64 } })
  const proposedFor = signed.proposedFor || new URL(request.url).searchParams.get("proposed_for")
  if (!proposedFor) return NextResponse.json({ error: "A signed proposed time is required" }, { status: 400 })
  try {
    await applyDoublesArrangeMutation({ client, fixtureId: signed.fixtureId, participantId: player.data.id, participantIds, action: signed.action, proposedFor })
    return NextResponse.json({ type: 4, data: { content: "Arrange updated. The canonical fixture state remains authoritative.", flags: 64 } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Arrange interaction failed" }, { status: 400 })
  }
}
