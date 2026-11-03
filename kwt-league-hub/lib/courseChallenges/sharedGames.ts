import "server-only"

import { getCourseChallenge, getPublicCourseChallenges } from "./catalog"
import type { CourseChallengeRequirement } from "./types"

export type SharedGameStatus = "forming" | "started" | "game_ended" | "completed" | "voided"
export type CourseDifficulty = "Easy" | "Hard"

export type SharedGame = {
  gameId: string
  courseCode: string
  courseSlug: string
  courseName: string
  difficulty: CourseDifficulty
  status: SharedGameStatus
  source: "website" | "discord"
  lobbyMinutes: number
  maxPlayers: number
  createdAt: string
  lobbyExpiresAt: string
  startedAt: string | null
  gameEndedAt: string | null
  postGameExpiresAt: string | null
  roomName: string | null
  discordThreadId: string | null
  participants: SharedGameParticipant[]
}

export type SharedGameParticipant = {
  playerId: string
  discordUserId: string | null
  screenName: string
  platform: "website" | "discord" | "both"
  joinedAt: string
  leftAt: string | null
  requirementSnapshot: RequirementSnapshot
  scoreDisposition: "pending" | "used_cc_score" | "no_cc_score" | null
}

export type RequirementSnapshot = {
  courseSlug: string
  courseCode: string
  difficulty: CourseDifficulty
  currentLevel: number | null
  status: SharedGameStatus
  nextRequirement: string | null
  actionableTargets: string[]
  aceTarget: string | null
  proMasterTarget: string | null
  courseComplete: boolean
  updatedAt: string
}

type ProgressRow = { level_number: number; easy_status: string; hard_status: string; completed_at: string | null }

function selectedRequirements(courseSlug: string, courseCode: string, difficulty: CourseDifficulty, progress: ProgressRow[]) {
  const course = getCourseChallenge(courseSlug)
  if (!course) return { level: null, requirements: [] as CourseChallengeRequirement[], progressRow: null, ace: null, prestige: null, complete: false }
  const levels = course.levels.filter((level) => level[difficulty === "Easy" ? "easyCode" : "hardCode"] === courseCode)
  const nextLevel = levels.find((level) => !progress.some((row) => row.level_number === level.level && Boolean(row.completed_at))) || null
  const progressRow = nextLevel ? progress.find((row) => row.level_number === nextLevel.level) : null
  const requirements = nextLevel ? (difficulty === "Easy" ? nextLevel.easyRequirements : nextLevel.hardRequirements) : []
  const completedLevels = progress.filter((row) => row.completed_at).map((row) => row.level_number)
  const ace = course.aceStages?.find((stage) => !completedLevels.includes(stage.stage))
  const prestige = course.prestigeStages?.find((stage) => !completedLevels.includes(stage.stage))
  return { level: nextLevel?.level || null, requirements, progressRow, ace, prestige, complete: levels.length > 0 && !nextLevel }
}

export function buildRequirementSnapshot(courseSlug: string, courseCode: string, difficulty: CourseDifficulty, status: SharedGameStatus, progress: ProgressRow[]): RequirementSnapshot {
  const selected = selectedRequirements(courseSlug, courseCode, difficulty, progress)
  const approved = difficulty === "Easy" ? selected.progressRow?.easy_status === "approved" : selected.progressRow?.hard_status === "approved"
  const requirements = selected.requirements
  return {
    courseSlug, courseCode, difficulty, currentLevel: selected.level, status,
    nextRequirement: selected.complete ? null : requirements.find((requirement) => requirement.label && !approved)?.label || requirements[0]?.label || null,
    actionableTargets: requirements.map((requirement) => requirement.label),
    aceTarget: selected.ace?.[difficulty === "Easy" ? "easyRequirements" : "hardRequirements"]?.map((requirement) => requirement.label).join("; ") || null,
    proMasterTarget: selected.prestige?.[difficulty === "Easy" ? "easyRequirements" : "hardRequirements"]?.map((requirement) => requirement.label).join("; ") || null,
    courseComplete: selected.complete,
    updatedAt: new Date().toISOString(),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadSharedGames(client: { from: (table: string) => any }, playerId: string) {
  const [gamesResult, participantsResult, catalogResult, progressResult] = await Promise.all([
    client.from("course_challenge_shared_games").select("*").in("status", ["forming", "started", "game_ended"]).order("created_at", { ascending: false }).limit(100),
    client.from("course_challenge_shared_game_participants").select("*").is("left_at", null),
    client.from("course_challenge_game_catalog").select("course_code,course_slug,display_name,difficulty,display_order").eq("active", true).order("display_order"),
    client.from("course_challenge_progress").select("level_number,easy_status,hard_status,completed_at").eq("player_id", playerId),
  ])
  if (gamesResult.error) throw gamesResult.error
  if (participantsResult.error) throw participantsResult.error
  if (catalogResult.error) throw catalogResult.error
  if (progressResult.error) throw progressResult.error
  const catalog = new Map<string, { course_slug: string; display_name: string; difficulty: CourseDifficulty }>((catalogResult.data || []).map((row: { course_code: string; course_slug: string; display_name: string; difficulty: CourseDifficulty }) => [row.course_code, row]))
  const progress = (progressResult.data || []) as ProgressRow[]
  const participantIds = [...new Set((participantsResult.data || []).map((row: { player_id: string }) => row.player_id))]
  const allProgressResult = participantIds.length ? await client.from("course_challenge_progress").select("player_id,course_slug,level_number,easy_status,hard_status,completed_at").in("player_id", participantIds) : { data: [], error: null }
  if (allProgressResult.error) throw allProgressResult.error
  const progressByPlayerCourse = new Map<string, ProgressRow[]>()
  for (const row of allProgressResult.data || []) { const key = `${row.player_id}:${row.course_slug}`; progressByPlayerCourse.set(key, [...(progressByPlayerCourse.get(key) || []), row]) }
  const gamesRows = gamesResult.data || []
  const participantsByGame = new Map<string, SharedGameParticipant[]>()
  for (const row of participantsResult.data || []) {
    const game = gamesRows.find((item: { game_id: string }) => item.game_id === row.game_id)
    if (!game) continue
    const code = String(game.course_code)
    const catalogRow = catalog.get(code)
    const status = String(game.status) as SharedGameStatus
    const snapshot = row.requirement_snapshot && Object.keys(row.requirement_snapshot).length > 0 ? row.requirement_snapshot : buildRequirementSnapshot(String(game.course_slug), code, String(game.difficulty) as CourseDifficulty, status, progressByPlayerCourse.get(`${row.player_id}:${game.course_slug}`) || progress)
    const list = participantsByGame.get(row.game_id) || []
    list.push({ playerId: row.player_id, discordUserId: row.discord_user_id, screenName: row.screen_name_snapshot, platform: row.platform, joinedAt: row.joined_at, leftAt: row.left_at, requirementSnapshot: snapshot, scoreDisposition: row.score_disposition })
    participantsByGame.set(row.game_id, list)
    void catalogRow
  }
  const games = gamesRows.map((row: Record<string, unknown>) => {
    const code = String(row.course_code); const catalogRow = catalog.get(code)
    return { gameId: String(row.game_id), courseCode: code, courseSlug: String(row.course_slug), courseName: String(row.course_name_snapshot || catalogRow?.display_name || row.course_slug), difficulty: String(row.difficulty) as CourseDifficulty, status: row.status as SharedGameStatus, source: row.source as "website" | "discord", lobbyMinutes: Number(row.lobby_minutes), maxPlayers: Number(row.max_players), createdAt: String(row.created_at), lobbyExpiresAt: String(row.lobby_expires_at), startedAt: row.started_at ? String(row.started_at) : null, gameEndedAt: row.game_ended_at ? String(row.game_ended_at) : null, postGameExpiresAt: row.post_game_expires_at ? String(row.post_game_expires_at) : null, roomName: row.room_name ? String(row.room_name) : null, discordThreadId: row.discord_thread_id ? String(row.discord_thread_id) : null, participants: participantsByGame.get(String(row.game_id)) || [] }
  })
  return { games, courses: [...catalog.entries()].map(([code, row]) => ({ code, slug: row.course_slug, name: row.display_name, difficulty: row.difficulty })) || getPublicCourseChallenges().map((course) => ({ code: course.easyCode, slug: course.slug, name: course.name, difficulty: "Easy" as const })) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function refreshParticipantRequirementSnapshot(client: { from: (table: string) => any }, gameId: string, playerId: string, courseSlug: string, courseCode: string, difficulty: CourseDifficulty, status: SharedGameStatus) {
  const { data, error } = await client.from("course_challenge_progress").select("level_number,easy_status,hard_status,completed_at").eq("player_id", playerId).eq("course_slug", courseSlug)
  if (error) throw error
  const snapshot = buildRequirementSnapshot(courseSlug, courseCode, difficulty, status, (data || []) as ProgressRow[])
  const update = await client.from("course_challenge_shared_game_participants").update({ requirement_snapshot: snapshot }).eq("game_id", gameId).eq("player_id", playerId)
  if (update.error) throw update.error
  return snapshot
}
