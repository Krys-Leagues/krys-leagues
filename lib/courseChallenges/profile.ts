import { getPublicCourseChallenges } from "./catalog"
import { aceProgress, type AceSubmissionRecord } from "./ace"
import type { CourseChallengeProfileReward } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCourseChallengeProfile(client: { from: (table: string) => any }, playerId: string, courseSlug?: string) {
  const progressQuery = client.from("course_challenge_progress").select("course_slug,level_number,easy_status,hard_status,completed_at,updated_at").eq("player_id", playerId)
  const rewardQuery = client.from("course_challenge_rewards").select("reward_key,label,kind,course_slug,level,earned_at").eq("player_id", playerId)
  const selectionQuery = client.from("course_challenge_profile_selections").select("selected_reward_key").eq("player_id", playerId).maybeSingle()
  const prestigeQuery = client.from("course_challenge_prestige_progress").select("course_slug,stage_number,easy_status,hard_status,completed_at,updated_at").eq("player_id", playerId)
  // Every approved Course Challenge card is also Ace evidence. Normal Level cards
  // must not be excluded from this read path.
  const aceQuery = client.from("course_challenge_submissions").select("course_slug,challenge_key,level_number,difficulty,hole_scores,requirements_evaluation,status").eq("player_id", playerId).eq("status", "approved")
  const [{ data: progress, error: progressError }, { data: rewards, error: rewardError }, { data: selection, error: selectionError }, { data: aceRows, error: aceError }, { data: prestige, error: prestigeError }] = await Promise.all([progressQuery, rewardQuery, selectionQuery, aceQuery, prestigeQuery])
  if (progressError) throw progressError
  if (rewardError) throw rewardError
  if (selectionError) throw selectionError
  if (aceError) throw aceError
  if (prestigeError) throw prestigeError

  const filteredProgress = (progress || []).filter((row: { course_slug: string }) => !courseSlug || row.course_slug === courseSlug)
  const filteredRewards = ((rewards || [])
    .filter((row: { course_slug: string }) => !courseSlug || row.course_slug === courseSlug)
    .map((row: { reward_key: string; label: string; kind: "sticker" | "badge"; course_slug: string; level: number | null; earned_at: string | null }) => ({ rewardKey: row.reward_key, label: row.label, kind: row.kind, courseSlug: row.course_slug, level: row.level, earnedAt: row.earned_at }))
    ) as CourseChallengeProfileReward[]
  const courses = getPublicCourseChallenges().map((course) => {
    const courseProgress = filteredProgress.filter((row: { course_slug: string }) => row.course_slug === course.slug)
    const courseRewards = filteredRewards.filter((row) => row.courseSlug === course.slug)
    const coursePrestige = (prestige || []).filter((row: { course_slug: string }) => row.course_slug === course.slug)
    const ace = aceProgress(course, (aceRows || []).filter((row: { course_slug: string }) => row.course_slug === course.slug) as AceSubmissionRecord[])
    return {
      slug: course.slug,
      name: course.name,
      completedLevels: courseProgress.filter((row: { completed_at: string | null }) => Boolean(row.completed_at)).map((row: { level_number: number }) => row.level_number),
      levelProgress: courseProgress.map((row: { level_number: number; easy_status: string; hard_status: string; completed_at: string | null; updated_at: string | null }) => ({ level: Number(row.level_number), easyStatus: row.easy_status, hardStatus: row.hard_status, completedAt: row.completed_at, updatedAt: row.updated_at })),
      stickers: courseRewards.filter((reward) => reward.kind === "sticker"),
      prestigeRewards: courseRewards.filter((reward) => reward.kind === "badge"),
      completedPrestigeStages: coursePrestige.filter((row: { completed_at: string | null }) => Boolean(row.completed_at)).map((row: { stage_number: number }) => Number(row.stage_number)),
      prestigeProgress: coursePrestige.map((row: { stage_number: number; easy_status: string; hard_status: string; completed_at: string | null; updated_at: string | null }) => ({ stage: Number(row.stage_number), easyStatus: row.easy_status, hardStatus: row.hard_status, completedAt: row.completed_at, updatedAt: row.updated_at })),
      uniqueAceHoles: ace.uniqueHoles,
      completedAceStages: ace.completedStages,
    }
  })
  // Every row in course_challenge_rewards is already an earned, persisted
  // reward. The server-side selection route verifies ownership again before
  // accepting a profile-display choice, so future reward metadata does not
  // need another hard-coded allow-list here.
  return { selectedRewardKey: selection?.selected_reward_key || null, courses, rewards: filteredRewards, profileRewards: filteredRewards, levelProgress: filteredProgress.map((row: { course_slug: string; level_number: number; easy_status: string; hard_status: string; completed_at: string | null; updated_at: string | null }) => ({ courseSlug: row.course_slug, level: Number(row.level_number), easyStatus: row.easy_status, hardStatus: row.hard_status, completedAt: row.completed_at, updatedAt: row.updated_at })), completedLevels: filteredProgress.filter((row: { completed_at: string | null }) => Boolean(row.completed_at)).map((row: { level_number: number }) => row.level_number) }
}
