import { getAceStage, getCourseChallenge, getPrestigeStage, getPublicCourseChallenges } from "@/lib/courseChallenges/catalog"
import { loadCourseChallengeProfile } from "@/lib/courseChallenges/profile"
import { createCourseChallengesServiceClient, requireCourseChallengeAdmin } from "@/lib/courseChallenges/server"
import { loadAdminGlobalPlayerDirectory } from "@/lib/identity/adminGlobalPlayerLookup"
import { historyStage, historyStageLabel, normalizeAdminHistoryFilters, recentSubmissionWindow, RECENT_SUBMISSION_DAY_COUNT } from "@/lib/courseChallenges/adminHistory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SUBMISSION_FIELDS = "id,player_id,course_slug,challenge_key,level_number,ace_stage_number,prestige_stage_number,difficulty,proof_photo_path,proof_image_sha256,hole_scores,reviewed_hole_scores,calculated_total,relative_to_par,reviewed_calculated_total,reviewed_relative_to_par,status,review_reason,review_notes,round_date,round_time,game_mode,admin_verified_game_mode,created_at,reviewed_at,reviewed_by,requirements_evaluation,reviewed_requirements_evaluation,submission_source,source_metadata"

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

function progressStatus(progress: { completedAt: string | null; easyStatus: string; hardStatus: string } | undefined) {
  if (progress?.completedAt) return "earned"
  if (progress && (progress.easyStatus || progress.hardStatus)) return "pending"
  return "not_earned"
}

type HistoryProfileCourse = {
  slug: string
  levelProgress: Array<{ level: number; easyStatus: string; hardStatus: string; completedAt: string | null }>
  prestigeProgress: Array<{ stage: number; easyStatus: string; hardStatus: string; completedAt: string | null }>
  stickers: Array<{ rewardKey: string; earnedAt: string | null }>
  prestigeRewards: Array<{ rewardKey: string; earnedAt: string | null }>
  completedPrestigeStages: number[]
  completedAceStages: number[]
}

function buildBooks(profile: Awaited<ReturnType<typeof loadCourseChallengeProfile>>) {
  return getPublicCourseChallenges().map((course) => {
    const stored = (profile.courses as HistoryProfileCourse[]).find((item) => item.slug === course.slug)
    const levelProgress = new Map((stored?.levelProgress || []).map((item) => [item.level, item]))
    const prestigeProgress = new Map((stored?.prestigeProgress || []).map((item) => [item.stage, item]))
    const earnedRewardKeys = new Set((stored?.stickers || []).concat(stored?.prestigeRewards || []).map((reward) => reward.rewardKey))
    const rewardDates = new Map((stored?.stickers || []).concat(stored?.prestigeRewards || []).map((reward) => [reward.rewardKey, reward.earnedAt]))
    return {
      slug: course.slug,
      name: course.name,
      levels: course.levels.map((level) => {
        const progress = levelProgress.get(level.level)
        return {
          level: level.level,
          status: progressStatus(progress),
          completedAt: progress?.completedAt || null,
          earnedAt: rewardDates.get(level.stickerKey) || (level.badgeKey ? rewardDates.get(level.badgeKey) || null : null),
          easyRequirements: level.easyRequirements.map((item) => item.label),
          hardRequirements: level.hardRequirements.map((item) => item.label),
          rewardKeys: [level.stickerKey, level.badgeKey].filter(Boolean),
          earned: earnedRewardKeys.has(level.stickerKey) || Boolean(level.badgeKey && earnedRewardKeys.has(level.badgeKey)),
        }
      }),
      prestige: (course.prestigeStages || []).map((stage) => {
        const progress = prestigeProgress.get(stage.stage)
        return {
          stage: stage.stage,
          label: stage.label,
          status: progressStatus(progress),
          completedAt: progress?.completedAt || null,
          earnedAt: rewardDates.get(stage.rewardKey) || null,
          easyRequirements: stage.easyRequirements.map((item) => item.label),
          hardRequirements: stage.hardRequirements.map((item) => item.label),
          earned: Boolean(stored?.completedPrestigeStages.includes(stage.stage)),
        }
      }),
      ace: (course.aceStages || []).map((stage) => ({
        stage: stage.stage,
        label: stage.label,
        status: stored?.completedAceStages.includes(stage.stage) ? "earned" : "not_earned",
        earned: stored?.completedAceStages.includes(stage.stage),
        earnedAt: profile.rewards.find((reward) => reward.rewardKey === stage.rewardKey)?.earnedAt || null,
        easyRequirements: stage.easyRequirements.map((item) => item.label),
        hardRequirements: stage.hardRequirements.map((item) => item.label),
      })),
    }
  })
}

function mapSubmission(row: Record<string, unknown>, courseName: string, reviewEvents: unknown[]) {
  const challengeKey = historyStage(row.challenge_key)
  const course = getCourseChallenge(String(row.course_slug))
  const ace = challengeKey === "ace" && course ? getAceStage(course, Number(row.ace_stage_number || row.level_number)) : null
  const prestige = challengeKey === "prestige" && course ? getPrestigeStage(course, Number(row.prestige_stage_number || row.level_number)) : null
  const scores = Array.isArray(row.reviewed_hole_scores) ? row.reviewed_hole_scores : Array.isArray(row.hole_scores) ? row.hole_scores : []
  return {
    id: String(row.id),
    courseSlug: String(row.course_slug),
    courseName,
    difficulty: String(row.difficulty),
    stage: challengeKey,
    stageLabel: historyStageLabel(row.challenge_key, row.level_number, row.ace_stage_number, row.prestige_stage_number),
    level: row.level_number === null || row.level_number === undefined ? null : Number(row.level_number),
    aceStage: ace?.stage || null,
    prestigeStage: prestige?.stage || null,
    status: String(row.status),
    statuses: [String(row.status)],
    grossScores: scores,
    grossTotal: row.reviewed_calculated_total ?? row.calculated_total ?? null,
    relativeToPar: row.reviewed_relative_to_par ?? row.relative_to_par ?? null,
    gameMode: row.admin_verified_game_mode || row.game_mode || null,
    roundDate: row.round_date || null,
    roundTime: row.round_time || null,
    createdAt: row.created_at || null,
    reviewedAt: row.reviewed_at || null,
    reviewReason: row.review_reason || null,
    reviewNotes: row.review_notes || null,
    reviewEvents,
    proofAvailable: Boolean(row.proof_photo_path),
    submissionSource: row.submission_source || "player_submission",
    sourceMetadata: row.source_metadata || {},
    submissionIds: [String(row.id)],
    achievementUses: [historyStageLabel(row.challenge_key, row.level_number, row.ace_stage_number, row.prestige_stage_number)],
  }
}

function deduplicateScorecards(rows: Array<ReturnType<typeof mapSubmission>>, rawRows: Array<Record<string, unknown>>) {
  const groups = new Map<string, ReturnType<typeof mapSubmission>>()
  rows.forEach((row, index) => {
    const sourceHash = String(rawRows[index].proof_image_sha256 || "").trim()
    const key = sourceHash || row.id
    const existing = groups.get(key)
    if (!existing) { groups.set(key, row); return }
    existing.submissionIds.push(...row.submissionIds)
    existing.achievementUses.push(...row.achievementUses)
    existing.statuses = [...new Set([...existing.statuses, ...row.statuses])]
    existing.reviewEvents = [...existing.reviewEvents, ...row.reviewEvents]
  })
  return [...groups.values()]
}

function mapRecentSubmission(row: Record<string, unknown>, playerName: string) {
  const challengeKey = historyStage(row.challenge_key)
  const course = getCourseChallenge(String(row.course_slug))
  const ace = challengeKey === "ace" && course ? getAceStage(course, Number(row.ace_stage_number || row.level_number)) : null
  const prestige = challengeKey === "prestige" && course ? getPrestigeStage(course, Number(row.prestige_stage_number || row.level_number)) : null
  const challenge = challengeKey === "ace"
    ? ace?.label || historyStageLabel(row.challenge_key, row.level_number, row.ace_stage_number, row.prestige_stage_number)
    : challengeKey === "prestige"
      ? prestige?.label || historyStageLabel(row.challenge_key, row.level_number, row.ace_stage_number, row.prestige_stage_number)
      : historyStageLabel(row.challenge_key, row.level_number, row.ace_stage_number, row.prestige_stage_number)
  return {
    key: `${String(row.player_id)}:${String(row.proof_image_sha256 || row.id)}`,
    playerId: String(row.player_id),
    playerName,
    challenge,
    status: String(row.status),
    courseName: course?.name || String(row.course_slug),
    difficulty: String(row.difficulty),
    createdAt: String(row.created_at),
    proofAvailable: Boolean(row.proof_photo_path),
    submissionIds: [String(row.id)],
    challengeLabels: [challenge],
  }
}

function deduplicateRecentSubmissions(rows: Array<ReturnType<typeof mapRecentSubmission>>) {
  const grouped = new Map<string, ReturnType<typeof mapRecentSubmission>>()
  for (const row of rows) {
    const existing = grouped.get(row.key)
    if (!existing) { grouped.set(row.key, row); continue }
    existing.submissionIds.push(...row.submissionIds)
    existing.challengeLabels = [...new Set([...existing.challengeLabels, ...row.challengeLabels])]
    existing.proofAvailable = existing.proofAvailable || row.proofAvailable
  }
  return [...grouped.values()].map((row) => ({ ...row, challenge: row.challengeLabels.join(" · ") }))
}

export async function GET(request: Request) {
  const authorization = await requireCourseChallengeAdmin()
  if (authorization.response) return authorization.response
  const params = new URL(request.url).searchParams
  const search = (params.get("search") || "").trim()
  const requestedPlayerId = (params.get("playerId") || "").trim()
  const recent = params.get("recent") === "1"
  if (!requestedPlayerId && !recent && search.length < 2) return jsonError("Search for at least two characters, or select a canonical player.", 400)

  try {
    const directory = await loadAdminGlobalPlayerDirectory(recent ? "" : search)
    if (recent) {
      const requestedDayOffset = Number(params.get("dayOffset") || "0")
      const safeDayOffset = Number.isInteger(requestedDayOffset) ? Math.min(Math.max(requestedDayOffset, 0), RECENT_SUBMISSION_DAY_COUNT - 1) : 0
      const day = recentSubmissionWindow(new Date(), safeDayOffset)
      const service = createCourseChallengesServiceClient()
      const result = await service
        .from("course_challenge_submissions")
        .select("id,player_id,course_slug,challenge_key,level_number,ace_stage_number,prestige_stage_number,difficulty,proof_photo_path,proof_image_sha256,status,created_at")
        .gte("created_at", day.startIso)
        .lt("created_at", day.endIso)
        .order("created_at", { ascending: false })
        .limit(500)
      if (result.error) throw result.error
      const names = new Map(directory.map((player) => [player.id, player.screenName]))
      const mapped = (result.data || []).map((row) => mapRecentSubmission(row as Record<string, unknown>, names.get(String(row.player_id)) || "Unknown player"))
      return Response.json({
        timeZone: day.timeZone,
        dayOffset: day.dayOffset,
        dayLabel: day.dayLabel,
        dateKey: day.dateKey,
        dateLabel: day.dateLabel,
        submissions: deduplicateRecentSubmissions(mapped),
      }, { headers: { "Cache-Control": "no-store" } })
    }
    const selected = requestedPlayerId ? directory.find((player) => player.id === requestedPlayerId) : null
    if (requestedPlayerId && !selected) return jsonError("Select an existing canonical player from the identity results.", 404)
    if (!requestedPlayerId) return Response.json({ players: directory.slice(0, 50) }, { headers: { "Cache-Control": "no-store" } })

    const filters = normalizeAdminHistoryFilters(params)
    const service = createCourseChallengesServiceClient()
    let query = service.from("course_challenge_submissions").select(SUBMISSION_FIELDS, { count: "exact" }).eq("player_id", requestedPlayerId).order("created_at", { ascending: false })
    if (filters.courseSlug) query = query.eq("course_slug", filters.courseSlug)
    if (filters.difficulty !== "all") query = query.eq("difficulty", filters.difficulty)
    if (filters.status !== "all") query = query.eq("status", filters.status)
    if (filters.stage !== "all") query = query.eq("challenge_key", filters.stage)
    if (filters.from) query = query.gte("round_date", filters.from)
    if (filters.to) query = query.lte("round_date", filters.to)
    const from = (filters.page - 1) * filters.pageSize
    const result = await query.range(from, from + filters.pageSize - 1)
    if (result.error) throw result.error
    const rawRows = (result.data || []) as Array<Record<string, unknown>>
    const submissionIds = rawRows.map((row) => String(row.id))
    const eventsResult = submissionIds.length
      ? await service.from("course_challenge_submission_review_events").select("id,submission_id,action,from_status,to_status,reviewer_id,notes,metadata,created_at").in("submission_id", submissionIds).order("created_at", { ascending: true })
      : { data: [], error: null }
    if (eventsResult.error) throw eventsResult.error
    const eventsBySubmission = new Map<string, unknown[]>()
    for (const event of eventsResult.data || []) {
      const id = String(event.submission_id)
      eventsBySubmission.set(id, [...(eventsBySubmission.get(id) || []), event])
    }
    const mapped = rawRows.map((row) => mapSubmission(row, getCourseChallenge(String(row.course_slug))?.name || String(row.course_slug), eventsBySubmission.get(String(row.id)) || []))
    const profile = await loadCourseChallengeProfile(service, requestedPlayerId)
    const submissions = deduplicateScorecards(mapped, rawRows)
    const statuses = rawRows.reduce<Record<string, number>>((counts, row) => { const status = String(row.status); counts[status] = (counts[status] || 0) + 1; return counts }, {})
    return Response.json({
      player: selected,
      overview: { totalSubmissions: result.count || 0, pageScorecards: submissions.length, pending: statuses.pending || 0, needsReview: statuses.needs_review || 0, approved: statuses.approved || 0, rejected: statuses.rejected || 0, earnedRewards: profile.rewards.length },
      books: buildBooks(profile),
      submissions,
      pagination: { page: filters.page, pageSize: filters.pageSize, totalSubmissions: result.count || 0, hasPrevious: filters.page > 1, hasNext: from + rawRows.length < (result.count || 0) },
      filters,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Player Course Challenge history is unavailable.", 503)
  }
}
