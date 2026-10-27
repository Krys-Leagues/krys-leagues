import { NextResponse } from "next/server"

import { buildRequirementSnapshot, type CourseDifficulty, type SharedGameStatus } from "@/lib/courseChallenges/sharedGames"
import { parseVerifiedScorecardJson, verifyScorecardBridgeRequest } from "@/lib/scorecards/bridge"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"

const MAX_BODY_BYTES = 128_000
const ACTIVE_STATUSES = ["forming", "started", "game_ended"] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type JsonObject = Record<string, unknown>
type BridgeBody = {
  action?: string
  snapshot?: { game?: { id?: unknown; revision?: unknown }; [key: string]: unknown }
  gameId?: string
  discordUserId?: string
  courseCode?: string
  lobbyMinutes?: number
  maxPlayers?: number
  channelId?: string
  threadId?: string
  messageId?: string
  roomName?: string
  playerId?: string
  attachmentRef?: string
  fileName?: string
  contentType?: string
  scorecardId?: string
}

function rows(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((row): row is JsonObject => Boolean(row && typeof row === "object"))
    : []
}

function canonicalGameRow(row: JsonObject): JsonObject {
  const status = String(row.status || "")
  return {
    ...row,
    book_key: row.book_key ?? row.course_slug,
    lobby_duration_seconds: row.lobby_duration_seconds ?? Number(row.lobby_minutes || 0) * 60,
    original_creator_discord_user_id: row.original_creator_discord_user_id ?? row.created_by_discord_user_id,
    current_owner_discord_user_id: row.current_owner_discord_user_id ?? row.created_by_discord_user_id,
    post_game_started_at: row.post_game_started_at ?? row.game_ended_at,
    status: status === "game_ended" ? "post_game" : status,
  }
}

function canonicalParticipantRow(row: JsonObject, game: JsonObject): JsonObject {
  const playerId = row.player_id
  return {
    ...row,
    participant_id: row.participant_id ?? `${String(row.game_id)}:${String(playerId)}`,
    screen_name: row.screen_name ?? row.screen_name_snapshot,
    participation_source: row.participation_source ?? row.platform ?? "website",
    participant_status: row.participant_status ?? (row.left_at ? "left" : "active"),
    original_creator: row.original_creator ?? playerId === game.created_by_player_id,
    played: row.played ?? false,
    confirmed_scorecard: row.confirmed_scorecard ?? false,
  }
}

function canonicalScorecardRow(row: JsonObject, participants: JsonObject[]): JsonObject {
  const participant = participants.find((item) => item.game_id === row.game_id && item.player_id === row.player_id)
  return {
    ...row,
    evidence_reference: row.evidence_reference ?? row.attachment_ref,
    evidence_filename: row.evidence_filename ?? row.file_name,
    evidence_content_type: row.evidence_content_type ?? row.content_type,
    uploaded_at: row.uploaded_at ?? row.submitted_at,
    uploader_player_id: row.uploader_player_id ?? row.player_id,
    uploader_discord_user_id: row.uploader_discord_user_id ?? participant?.discord_user_id,
  }
}

async function readSharedGames(
  service: ReturnType<typeof createScorecardServiceClient>,
  gameId?: string,
) {
  let gamesQuery = service
    .from("course_challenge_shared_games")
    .select("*")
    .in("status", [...ACTIVE_STATUSES])
    .order("created_at", { ascending: false })
    .limit(100)
  if (gameId) gamesQuery = gamesQuery.eq("game_id", gameId)
  const games = await gamesQuery
  if (games.error) throw games.error
  const gameRows = rows(games.data)
  if (gameId && gameRows.length === 0) return null
  const ids = gameRows.map((row) => String(row.game_id)).filter(Boolean)
  if (ids.length === 0) {
    return { games: [], participants: [], scorecards: [], confirmations: [], voidVotes: [], playerDecisions: [], deliveries: [], events: [], catalog: [] }
  }

  const [participants, scorecards, confirmations, voidVotes, deliveries, events, catalog] = await Promise.all([
    service.from("course_challenge_shared_game_participants").select("*").in("game_id", ids),
    service.from("course_challenge_shared_game_scorecards").select("*").in("game_id", ids),
    service.from("course_challenge_shared_game_confirmations").select("*").in("game_id", ids),
    service.from("course_challenge_shared_game_void_votes").select("*").in("game_id", ids),
    service.from("course_challenge_shared_game_deliveries").select("*").in("game_id", ids),
    service.from("course_challenge_shared_game_events").select("*").in("game_id", ids).order("occurred_at", { ascending: true }),
    service.from("course_challenge_game_catalog").select("course_code,course_slug,display_name,difficulty,display_order").eq("active", true).order("display_order"),
  ])
  const childError = participants.error || scorecards.error || confirmations.error || voidVotes.error || deliveries.error || events.error || catalog.error
  if (childError) throw childError

  const participantRows = rows(participants.data)
  const decisionRows = participantRows
    .filter((row) => row.score_disposition)
    .map((row) => ({
      game_id: row.game_id,
      player_id: row.player_id,
      discord_user_id: row.discord_user_id,
      decision: row.score_disposition,
      scorecard_id: row.scorecard_id ?? null,
      decided_at: row.score_decided_at ?? row.updated_at ?? row.joined_at,
    }))

  return {
    games: gameRows.map(canonicalGameRow),
    participants: participantRows.map((row) => canonicalParticipantRow(row, gameRows.find((game) => game.game_id === row.game_id) || {})),
    scorecards: rows(scorecards.data).map((row) => canonicalScorecardRow(row, participantRows)),
    confirmations: rows(confirmations.data),
    voidVotes: rows(voidVotes.data).map((row) => ({
      ...row,
      voter_player_id: row.voter_player_id ?? row.player_id,
      voter_discord_user_id: row.voter_discord_user_id ?? row.discord_user_id,
      voted_at: row.voted_at ?? row.created_at,
    })),
    playerDecisions: decisionRows,
    deliveries: rows(deliveries.data).map((row) => {
      const participant = participantRows.find((item) => item.game_id === row.game_id && item.player_id === row.player_id)
      return {
        ...row,
        delivery_status: row.delivery_status ?? (row.status === "delivered" ? "succeeded" : row.status),
        display_name: row.display_name ?? participant?.screen_name_snapshot,
        discord_user_id: row.discord_user_id ?? participant?.discord_user_id,
      }
    }),
    events: rows(events.data),
    catalog: rows(catalog.data),
  }
}

export async function POST(request: Request) {
  const verification = await verifyScorecardBridgeRequest(request)
  if (!verification.verified) return verification.response
  if (verification.body.byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Course Challenge bridge payload is too large." }, { status: 413 })

  let body: BridgeBody
  try {
    body = parseVerifiedScorecardJson<BridgeBody>(verification.body)
  } catch {
    return NextResponse.json({ error: "Invalid Course Challenge bridge payload." }, { status: 400 })
  }

  const service = createScorecardServiceClient()
  try {
    let result: unknown
    const action = body.action
    if (action === "history") {
      if (!body.snapshot?.game?.id || !Number.isSafeInteger(Number(body.snapshot.game.revision))) return NextResponse.json({ error: "Invalid legacy Course Challenge history snapshot." }, { status: 400 })
      const legacy = await service.rpc("sync_course_challenge_discord_game", { p_snapshot: body.snapshot })
      if (legacy.error) throw legacy.error
      const canonical = await service.rpc("sync_course_challenge_canonical_game", { p_snapshot: body.snapshot })
      if (canonical.error) throw canonical.error
      result = canonical.data
    } else if (action === "list" || action === "get") {
      const requestedGameId = action === "get" ? String(body.gameId || "") : undefined
      if (action === "get" && !UUID.test(requestedGameId || "")) return NextResponse.json({ error: "Invalid game ID." }, { status: 400 })
      const snapshot = await readSharedGames(service, requestedGameId)
      if (action === "get" && !snapshot) return NextResponse.json({ error: "Active Course Challenge game not found." }, { status: 404 })
      result = snapshot || { games: [], participants: [], scorecards: [], confirmations: [], voidVotes: [], playerDecisions: [], deliveries: [], events: [], catalog: [] }
    } else if (action === "create") result = await service.rpc("course_challenge_shared_game_create_discord", { p_discord_user_id: body.discordUserId, p_course_code: body.courseCode, p_lobby_minutes: body.lobbyMinutes, p_max_players: body.maxPlayers }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "join") result = await service.rpc("course_challenge_shared_game_join_discord", { p_game_id: body.gameId, p_discord_user_id: body.discordUserId }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "leave") result = await service.rpc("course_challenge_shared_game_leave_discord", { p_game_id: body.gameId, p_discord_user_id: body.discordUserId }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "void") result = await service.rpc("course_challenge_shared_game_void_vote_discord", { p_game_id: body.gameId, p_discord_user_id: body.discordUserId }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "no-score") result = await service.rpc("course_challenge_shared_game_no_score_discord", { p_game_id: body.gameId, p_discord_user_id: body.discordUserId }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "start") result = await service.rpc("course_challenge_shared_game_start", { p_game_id: body.gameId }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "game-ended") result = await service.rpc("course_challenge_shared_game_ended", { p_game_id: body.gameId }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "archive") result = await service.rpc("course_challenge_shared_game_archive", { p_game_id: body.gameId }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "set-refs") result = await service.rpc("course_challenge_shared_game_set_discord_refs", { p_game_id: body.gameId, p_channel_id: body.channelId, p_thread_id: body.threadId, p_message_id: body.messageId, p_room_name: body.roomName }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "add-scorecard") {
      result = body.discordUserId
        ? await service.rpc("course_challenge_shared_game_add_scorecard_discord", { p_game_id: body.gameId, p_discord_user_id: body.discordUserId, p_attachment_ref: body.attachmentRef, p_file_name: body.fileName, p_content_type: body.contentType }).then(({ data, error }) => { if (error) throw error; return data })
        : await service.rpc("course_challenge_shared_game_add_scorecard", { p_game_id: body.gameId, p_player_id: body.playerId, p_attachment_ref: body.attachmentRef, p_file_name: body.fileName, p_content_type: body.contentType }).then(({ data, error }) => { if (error) throw error; return data })
    } else if (action === "use-score") {
      result = body.discordUserId
        ? await service.rpc("course_challenge_shared_game_use_score_discord", { p_game_id: body.gameId, p_discord_user_id: body.discordUserId, p_scorecard_id: body.scorecardId || null }).then(({ data, error }) => { if (error) throw error; return data })
        : await service.rpc("course_challenge_shared_game_use_score", { p_game_id: body.gameId, p_player_id: body.playerId, p_scorecard_id: body.scorecardId }).then(({ data, error }) => { if (error) throw error; return data })
    } else if (action === "requirements") {
      const game = await service.from("course_challenge_shared_games").select("course_slug,course_code,difficulty,status").eq("game_id", body.gameId).maybeSingle()
      const participants = await service.from("course_challenge_shared_game_participants").select("player_id,screen_name_snapshot").eq("game_id", body.gameId).is("left_at", null)
      if (game.error) throw game.error
      if (participants.error) throw participants.error
      if (!game.data) throw new Error("Shared game not found.")
      const requirements = []
      for (const participant of participants.data || []) {
        const progress = await service.from("course_challenge_progress").select("level_number,easy_status,hard_status,completed_at").eq("player_id", participant.player_id).eq("course_slug", game.data.course_slug)
        if (progress.error) throw progress.error
        requirements.push({ playerId: participant.player_id, screenName: participant.screen_name_snapshot, snapshot: buildRequirementSnapshot(game.data.course_slug, game.data.course_code, game.data.difficulty as CourseDifficulty, game.data.status as SharedGameStatus, progress.data || []) })
      }
      result = { requirements }
    } else return NextResponse.json({ error: "Unknown Course Challenge bridge action." }, { status: 400 })
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Course Challenge bridge action failed." }, { status: 400 })
  }
}
