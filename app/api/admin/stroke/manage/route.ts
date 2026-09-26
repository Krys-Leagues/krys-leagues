import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { enqueueStrokeBoardSync, loadAuthoritativeStrokeBoards } from "@/lib/scorecards/strokeBoardServer"

export const runtime = "nodejs"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  try {
    const service = createScorecardServiceClient()
    const boards = await loadAuthoritativeStrokeBoards(service)
    const [mappingResponse, outboxResponse] = await Promise.all([
      service.from("stroke_discord_boards").select("season_id,division_number,discord_channel_id,discord_message_id,last_synced_at,last_error,updated_at"),
      service.from("stroke_discord_board_sync_outbox").select("season_id,division_number,sync_state,attempt_count,claimed_at,next_attempt_at,last_error,updated_at"),
    ])
    if (mappingResponse.error || outboxResponse.error) throw new Error("STROKE_BOARD_STATE_UNAVAILABLE")
    const mappings = Object.fromEntries((mappingResponse.data || []).map((row) => [
      `${row.season_id}:${row.division_number}`,
      {
        channelId: row.discord_channel_id,
        messageId: row.discord_message_id,
        lastSyncedAt: row.last_synced_at,
        lastError: row.last_error,
        updatedAt: row.updated_at,
        outbox: null as unknown,
      },
    ]))
    for (const row of outboxResponse.data || []) {
      const key = `${row.season_id}:${row.division_number}`
      if (mappings[key]) mappings[key].outbox = {
        syncState: row.sync_state,
        attemptCount: row.attempt_count,
        claimedAt: row.claimed_at,
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
        updatedAt: row.updated_at,
      }
    }
    return NextResponse.json({ boards, mappings }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "The current Stroke workspace is unavailable." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { action?: unknown; seasonId?: unknown; division?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid Stroke admin operation." }, { status: 400 }) }
  const action = String(body.action || "retry_sync")
  const seasonId = String(body.seasonId || "")
  const division = Number(body.division)
  if (!seasonId || !Number.isInteger(division) || division < 1 || division > 5) {
    return NextResponse.json({ error: "A valid Stroke season and division are required." }, { status: 400 })
  }
  if (!new Set(["rebuild_standings", "retry_sync", "create_board", "rebind_board"]).has(action)) {
    return NextResponse.json({ error: "Unsupported Stroke admin operation." }, { status: 400 })
  }
  const service = createScorecardServiceClient()
  const boards = await loadAuthoritativeStrokeBoards(service)
  const board = boards.find((candidate) => candidate.seasonId === seasonId && candidate.division === division)
  if (!board) return NextResponse.json({ error: "That current Stroke division is unavailable." }, { status: 409 })
  try {
    if (action === "rebuild_standings") {
      const rebuilt = await authorization.supabase.rpc("rebuild_stroke_standings", {
        p_season_id: board.seasonId,
        p_division_number: board.division,
      })
      if (rebuilt.error) throw rebuilt.error
      return NextResponse.json({ rebuilt: true, seasonId: board.seasonId, division: board.division })
    }

    if (action === "retry_sync") {
      await enqueueStrokeBoardSync(service, board.seasonId, board.division, "admin_retry")
      return NextResponse.json({ queued: true })
    }

    const channelKey = `DISCORD_STROKE_D${board.division}_CHANNEL_ID`
    const channelId = process.env[channelKey]?.trim()
    if (!channelId || !/^\d+$/.test(channelId)) {
      return NextResponse.json({ error: `The configured ${channelKey} is missing or invalid.` }, { status: 503 })
    }

    const existing = await service.from("stroke_discord_boards")
      .select("discord_channel_id,discord_message_id")
      .eq("season_id", board.seasonId)
      .eq("division_number", board.division)
      .maybeSingle()
    if (existing.error) throw existing.error
    if (action === "create_board" && existing.data?.discord_message_id) {
      return NextResponse.json({ error: "This division already has a bound board. Use rebind instead." }, { status: 409 })
    }

    const now = new Date().toISOString()
    const mapping = await service.from("stroke_discord_boards").upsert({
      season_id: board.seasonId,
      division_number: board.division,
      discord_channel_id: channelId,
      discord_message_id: null,
      last_payload_hash: null,
      last_synced_at: null,
      last_error: null,
      updated_at: now,
    }, { onConflict: "season_id,division_number" }).select("discord_channel_id,discord_message_id").single()
    if (mapping.error) throw mapping.error

    const queued = await service.from("stroke_discord_board_sync_outbox").upsert({
      season_id: board.seasonId,
      division_number: board.division,
      reason: action === "rebind_board" ? "admin_rebind" : "admin_create",
      sync_state: "pending",
      attempt_count: 0,
      claim_token: null,
      claimed_at: null,
      next_attempt_at: now,
      last_error: null,
      updated_at: now,
    }, { onConflict: "season_id,division_number" })
    if (queued.error) throw queued.error
    return NextResponse.json({ queued: true, bound: true, channelId, mapping: mapping.data })
  } catch {
    return NextResponse.json({ error: "The Stroke admin operation could not be completed." }, { status: 503 })
  }
}
