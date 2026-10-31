import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"
import { roleSyncKey } from "@/lib/doublesSystems"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { season_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid role-sync request" }, { status: 400 }) }
  if (!body.season_id) return NextResponse.json({ error: "season_id is required" }, { status: 400 })
  const client = createDoublesRuntimeClient()
  const members = await client.from("doubles_season_team_members").select("player_id,effective_to").eq("season_id", body.season_id)
  if (members.error) return NextResponse.json({ error: "Doubles membership is unavailable" }, { status: 503 })
  const playerIds = Array.from(new Set((members.data || []).map((row) => row.player_id)))
  const players = await client.from("players").select("id,discord_id").in("id", playerIds)
  if (players.error) return NextResponse.json({ error: "Canonical Discord identity state is unavailable" }, { status: 503 })
  const activeIds = new Set((members.data || []).filter((row) => !row.effective_to).map((row) => row.player_id))
  const payload = playerIds.map((playerId) => {
    const player = players.data?.find((row) => row.id === playerId)
    const resolved = typeof player?.discord_id === "string" && player.discord_id.trim() !== ""
    const desiredState = activeIds.has(playerId) ? "GRANTED" as const : "REVOKED" as const
    return { player_id: playerId, league_key: "doubles", desired_state: desiredState, identity_state: resolved ? "RESOLVED" as const : "UNRESOLVED" as const, idempotency_key: roleSyncKey(playerId, "doubles", desiredState) }
  })
  if (!payload.length) return NextResponse.json({ queued: 0 })
  const result = await client.from("league_discord_role_sync_outbox").upsert(payload, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id,player_id,desired_state,identity_state,idempotency_key")
  if (result.error) return NextResponse.json({ error: "Role-sync tasks could not be queued" }, { status: 503 })
  return NextResponse.json({ queued: result.data?.length ?? 0, unresolved: payload.filter((row) => row.identity_state === "UNRESOLVED").length })
}
