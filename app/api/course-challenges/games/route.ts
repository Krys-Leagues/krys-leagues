import { createServerSupabaseClient } from "@/lib/supabase/server"
import { loadSharedGames, refreshParticipantRequirementSnapshot, type SharedGameStatus, type CourseDifficulty } from "@/lib/courseChallenges/sharedGames"
import { createCourseChallengesServiceClient, getCourseChallengeIdentity } from "@/lib/courseChallenges/server"

export const runtime = "nodejs"
function noStore(payload: unknown, init?: ResponseInit) { return Response.json(payload, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers || {}) } }) }

export async function GET() {
  try {
    const identity = await getCourseChallengeIdentity()
    if (!identity) return noStore({ error: "Sign in with Discord to join a Course Challenge game." }, { status: 401 })
    return noStore(await loadSharedGames(createCourseChallengesServiceClient(), identity.playerId))
  } catch (caught) { return noStore({ error: caught instanceof Error ? caught.message : "Course Challenge games are temporarily unavailable." }, { status: 503 }) }
}

export async function POST(request: Request) {
  try {
    const identity = await getCourseChallengeIdentity()
    if (!identity) return noStore({ error: "Sign in with Discord to join a Course Challenge game." }, { status: 401 })
    const body = await request.json() as { action?: string; gameId?: string; courseCode?: string; lobbyMinutes?: number; maxPlayers?: number }
    const action = body.action; const session = await createServerSupabaseClient(); const service = createCourseChallengesServiceClient()
    let result: unknown
    if (action === "create") result = await session.rpc("course_challenge_shared_game_create", { p_course_code: String(body.courseCode || ""), p_lobby_minutes: Number(body.lobbyMinutes), p_max_players: Number(body.maxPlayers), p_source: "website" }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "join") result = await session.rpc("course_challenge_shared_game_join", { p_game_id: String(body.gameId || "") }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "leave") result = await session.rpc("course_challenge_shared_game_leave", { p_game_id: String(body.gameId || "") }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "void") result = await session.rpc("course_challenge_shared_game_void_vote", { p_game_id: String(body.gameId || "") }).then(({ data, error }) => { if (error) throw error; return data })
    else if (action === "no-score") result = await session.rpc("course_challenge_shared_game_no_score", { p_game_id: String(body.gameId || "") }).then(({ data, error }) => { if (error) throw error; return data })
    else return noStore({ error: "Unknown Course Challenge game action." }, { status: 400 })
    const resultRecord = result && typeof result === "object" ? result as Record<string, unknown> : {}
    const gameId = String(resultRecord.gameId || body.gameId || "")
    if (gameId) {
      const game = await service.from("course_challenge_shared_games").select("course_slug,course_code,difficulty,status").eq("game_id", gameId).maybeSingle()
      if (game.error) throw game.error
      if (game.data) await refreshParticipantRequirementSnapshot(service, gameId, identity.playerId, game.data.course_slug, game.data.course_code, game.data.difficulty as CourseDifficulty, game.data.status as SharedGameStatus)
    }
    return noStore({ result, ...(await loadSharedGames(service, identity.playerId)) })
  } catch (caught) { return noStore({ error: caught instanceof Error ? caught.message : "Course Challenge game action failed." }, { status: 400 }) }
}
