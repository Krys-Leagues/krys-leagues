import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"

import { parseVerifiedScorecardJson, verifyScorecardBridgeRequest } from "@/lib/scorecards/bridge"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { loadAuthoritativeStrokeBoards } from "@/lib/scorecards/strokeBoardServer"
import { filterStrokePilotBoards, parseStrokeScorecardPilotDivisions } from "@/lib/scorecards/strokePilot"

export const runtime = "nodejs"
const DISCORD_ID = /^\d+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AckBody = {
  action?: unknown
  seasonId?: unknown
  division?: unknown
  succeeded?: unknown
  channelId?: unknown
  messageId?: unknown
  error?: unknown
  claimToken?: unknown
}

export async function POST(request: Request) {
  const verification = await verifyScorecardBridgeRequest(request)
  if (!verification.verified) return verification.response
  let body: AckBody
  try { body = parseVerifiedScorecardJson<AckBody>(verification.body) } catch { return NextResponse.json({ error: "Invalid board request." }, { status: 400 }) }
  const service = createScorecardServiceClient()
  try {
    const boards = await loadAuthoritativeStrokeBoards(service)
    const pilotBoards = filterStrokePilotBoards(
      boards,
      parseStrokeScorecardPilotDivisions(process.env.STROKE_SCORECARD_PILOT_DIVISIONS),
    )
    if (body.action === "poll") {
      const mappings = await service.from("stroke_discord_boards").select("season_id,division_number,discord_channel_id,discord_message_id,last_payload_hash")
      if (mappings.error) throw new Error("STROKE_BOARD_STATE_UNAVAILABLE")
      const mappingByKey = new Map((mappings.data || []).map((row) => [`${row.season_id}:${row.division_number}`, row]))
      for (const board of pilotBoards) {
        const key = `${board.seasonId}:${board.division}`
        const mapping = mappingByKey.get(key)
        if (!mapping?.discord_message_id) {
          const initial = await service.from("stroke_discord_board_sync_outbox").upsert({
            season_id: board.seasonId, division_number: board.division, reason: "initial_board",
            sync_state: "pending", next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }, { onConflict: "season_id,division_number", ignoreDuplicates: true })
          if (initial.error) throw initial.error
        }
      }
      const claimToken = randomUUID()
      const claimed = await service.rpc("claim_stroke_discord_board_sync_tasks_service", { p_claim_token: claimToken, p_limit: 5 })
      if (claimed.error) throw claimed.error
      const claimedKeys = new Set((claimed.data || []).map((row: { season_id: string; division_number: number }) => `${row.season_id}:${row.division_number}`))
      const tasks = pilotBoards.filter((board) => claimedKeys.has(`${board.seasonId}:${board.division}`)).map((board) => ({
        seasonId: board.seasonId, seasonNumber: board.seasonNumber, division: board.division,
        games: board.games.map((game) => ({
          sourceKey: game.sourceKey, gameNumber: game.gameNumber, playerOne: game.playerOne,
          playerTwo: game.playerTwo, course: game.course, state: game.state,
          playerOneScore: game.playerOneScore, playerTwoScore: game.playerTwoScore,
        })),
        standings: board.standings,
        messageId: mappingByKey.get(`${board.seasonId}:${board.division}`)?.discord_message_id || null,
        claimToken,
      }))
      return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store" } })
    }
    if (body.action !== "ack") return NextResponse.json({ error: "Invalid board action." }, { status: 400 })
    const seasonId = String(body.seasonId || "")
    const division = Number(body.division)
    const board = pilotBoards.find((candidate) => candidate.seasonId === seasonId && candidate.division === division)
    if (!board) return NextResponse.json({ error: "Board is not enabled for the current Stroke pilot." }, { status: 409 })
    const succeeded = body.succeeded === true
    const channelId = String(body.channelId || "")
    const messageId = String(body.messageId || "")
    const claimToken = String(body.claimToken || "")
    if (!UUID.test(claimToken)) return NextResponse.json({ error: "Invalid board claim." }, { status: 409 })
    if (succeeded && (!DISCORD_ID.test(channelId) || !DISCORD_ID.test(messageId))) {
      return NextResponse.json({ error: "Invalid Discord board acknowledgement." }, { status: 400 })
    }
    const activeClaim = await service.from("stroke_discord_board_sync_outbox").select("id")
      .eq("season_id", seasonId).eq("division_number", division).eq("claim_token", claimToken).eq("sync_state", "claimed").maybeSingle()
    if (activeClaim.error) throw activeClaim.error
    if (!activeClaim.data) return NextResponse.json({ error: "Board claim is no longer active." }, { status: 409 })
    if (succeeded) {
      const mapping = await service.from("stroke_discord_boards").upsert({
        season_id: seasonId, division_number: division, discord_channel_id: channelId,
        discord_message_id: messageId, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: "season_id,division_number" })
      if (mapping.error) throw mapping.error
    }
    const outboxUpdate = await service.from("stroke_discord_board_sync_outbox").update({
      reason: succeeded ? "board_synced" : "board_sync_retry", sync_state: succeeded ? "succeeded" : "failed",
      claim_token: null, claimed_at: null,
      last_error: succeeded ? null : String(body.error || "Discord board sync failed.").slice(0, 500),
      next_attempt_at: succeeded ? new Date().toISOString() : new Date(Date.now() + 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("season_id", seasonId).eq("division_number", division).eq("claim_token", claimToken).eq("sync_state", "claimed").select("id").maybeSingle()
    if (outboxUpdate.error) throw outboxUpdate.error
    if (!outboxUpdate.data) return NextResponse.json({ error: "Board claim is no longer active." }, { status: 409 })
    return NextResponse.json({ acknowledged: true })
  } catch {
    return NextResponse.json({ error: "Stroke board coordination is temporarily unavailable." }, { status: 503 })
  }
}
