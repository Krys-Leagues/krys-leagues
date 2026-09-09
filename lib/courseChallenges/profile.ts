import { getPublicCourseChallenges } from "./catalog"
import type { CourseChallengeProfileReward } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCourseChallengeProfile(client: { from: (table: string) => any }, playerId: string, courseSlug?: string) {
  const progressQuery = client.from("course_challenge_progress").select("course_slug,level_number,completed_at").eq("player_id", playerId)
  const rewardQuery = client.from("course_challenge_rewards").select("reward_key,label,kind,course_slug,level,earned_at").eq("player_id", playerId)
  const selectionQuery = client.from("course_challenge_profile_selections").select("selected_reward_key").eq("player_id", playerId).maybeSingle()
  const [{ data: progress, error: progressError }, { data: rewards, error: rewardError }, { data: selection, error: selectionError }] = await Promise.all([progressQuery, rewardQuery, selectionQuery])
  if (progressError) throw progressError
  if (rewardError) throw rewardError
  if (selectionError) throw selectionError

  const filteredProgress = (progress || []).filter((row: { course_slug: string }) => !courseSlug || row.course_slug === courseSlug)
  const filteredRewards = ((rewards || [])
    .filter((row: { course_slug: string }) => !courseSlug || row.course_slug === courseSlug)
    .map((row: { reward_key: string; label: string; kind: "sticker" | "badge"; course_slug: string; level: number | null; earned_at: string | null }) => ({ rewardKey: row.reward_key, label: row.label, kind: row.kind, courseSlug: row.course_slug, level: row.level, earnedAt: row.earned_at }))
    ) as CourseChallengeProfileReward[]
  const courses = getPublicCourseChallenges().map((course) => {
    const courseProgress = filteredProgress.filter((row: { course_slug: string }) => row.course_slug === course.slug)
    const courseRewards = filteredRewards.filter((row) => row.courseSlug === course.slug)
    return {
      slug: course.slug,
      name: course.name,
      completedLevels: courseProgress.filter((row: { completed_at: string | null }) => Boolean(row.completed_at)).map((row: { level_number: number }) => row.level_number),
      stickers: courseRewards.filter((reward) => reward.kind === "sticker"),
      prestigeRewards: courseRewards.filter((reward) => reward.kind === "badge"),
    }
  })
  return { selectedRewardKey: selection?.selected_reward_key || null, courses, rewards: filteredRewards, completedLevels: filteredProgress.filter((row: { completed_at: string | null }) => Boolean(row.completed_at)).map((row: { level_number: number }) => row.level_number) }
}
