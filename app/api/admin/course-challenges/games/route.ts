import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import {
  buildCourseChallengeGameSummary,
  type CourseChallengeDiscordGameRow,
  type CourseChallengeDiscordParticipantRow,
} from "@/lib/courseChallenges/gameHistory"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const service = createScorecardServiceClient()
    const gameId = new URL(request.url).searchParams.get("id")?.trim() || ""
    if (gameId && !UUID.test(gameId)) {
      return NextResponse.json({ error: "Invalid game ID." }, { status: 400 })
    }

    if (gameId) {
      const [game, participants, scorecards, confirmations, events] = await Promise.all([
        service.from("course_challenge_discord_games").select("*").eq("game_id", gameId).maybeSingle(),
        service.from("course_challenge_discord_game_participants").select("*").eq("game_id", gameId).order("first_joined_at"),
        service.from("course_challenge_discord_game_scorecards").select("*").eq("game_id", gameId).order("submitted_at"),
        service.from("course_challenge_discord_game_confirmations").select("*").eq("game_id", gameId).order("confirmed_at"),
        service.from("course_challenge_discord_game_events").select("*").eq("game_id", gameId).order("occurred_at"),
      ])
      const error = game.error || participants.error || scorecards.error || confirmations.error || events.error
      if (error) throw error
      if (!game.data) return NextResponse.json({ error: "Game not found." }, { status: 404 })
      return NextResponse.json({
        game: game.data,
        participants: participants.data || [],
        scorecards: scorecards.data || [],
        confirmations: confirmations.data || [],
        events: events.data || [],
      }, { headers: { "Cache-Control": "no-store" } })
    }

    const [gamesResult, participantsResult] = await Promise.all([
      service.from("course_challenge_discord_games").select("*").order("created_at", { ascending: false }).limit(500),
      service.from("course_challenge_discord_game_participants").select("*").order("first_joined_at", { ascending: true }),
    ])
    if (gamesResult.error || participantsResult.error) {
      throw gamesResult.error || participantsResult.error
    }
    const games = (gamesResult.data || []) as CourseChallengeDiscordGameRow[]
    const participants = (participantsResult.data || []) as CourseChallengeDiscordParticipantRow[]
    const participantsByGame = new Map<string, CourseChallengeDiscordParticipantRow[]>()
    for (const participant of participants) {
      const rows = participantsByGame.get(participant.game_id) || []
      rows.push(participant)
      participantsByGame.set(participant.game_id, rows)
    }
    return NextResponse.json({
      summary: buildCourseChallengeGameSummary(games, participants),
      games: games.map((game) => ({
        ...game,
        participants: participantsByGame.get(game.game_id) || [],
      })),
    }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json(
      { error: "Course Challenge game history is temporarily unavailable." },
      { status: 503 },
    )
  }
}
