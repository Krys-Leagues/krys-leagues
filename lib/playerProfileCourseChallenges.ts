import { getPublicCourseChallenges } from "./courseChallenges/catalog.ts"
import { aceRewardDefinition, aceStageRewardDefinitions, levelRewardDefinitions, prestigeStageRewardDefinitions } from "./courseChallenges/rewards.ts"
import type { CourseChallengeCourse, CourseChallengeRewardDefinition } from "./courseChallenges/types.ts"

export type ProfileCourseChallengeReward = {
  id: string
  reward_key: string
  label: string
  course_slug: string
  level: number | null
  earned_at: string | null
}

export type ProfileCourseChallengeRewardView = ProfileCourseChallengeReward & {
  definition: CourseChallengeRewardDefinition | null
}

export type ProfileCourseChallengeGroup = {
  course: CourseChallengeCourse
  rewards: ProfileCourseChallengeRewardView[]
  mainRewards: ProfileCourseChallengeRewardView[]
  aceRewards: ProfileCourseChallengeRewardView[]
  latestEarnedAt: string | null
}

type RewardRank = {
  row: "main" | "ace"
  rank: number
}

function rewardDefinitions(course: CourseChallengeCourse) {
  return [
    ...course.levels.flatMap((level) => levelRewardDefinitions(course, level.level)),
    ...aceStageRewardDefinitions(course),
    ...(course.prestigeStages || []).flatMap((stage) => prestigeStageRewardDefinitions(course, stage.stage)),
    aceRewardDefinition(course),
  ].filter((definition): definition is CourseChallengeRewardDefinition => Boolean(definition))
}

function rewardRank(reward: ProfileCourseChallengeRewardView): RewardRank {
  const key = reward.reward_key
  if (key.endsWith(":course-master")) return { row: "main", rank: 0 }
  if (key.endsWith(":course-pro")) return { row: "main", rank: 1 }
  const levelMatch = key.match(/:level-(\d+):/)
  if (levelMatch) return { row: "main", rank: 7 - Number(levelMatch[1]) }
  const aceMatch = key.match(/:ace-(legend|hunter|chaser|wader)(?::|$)/)
  if (aceMatch) {
    const aceRanks: Record<"legend" | "hunter" | "chaser" | "wader", number> = { legend: 0, hunter: 1, chaser: 2, wader: 3 }
    return { row: "ace", rank: aceRanks[aceMatch[1] as keyof typeof aceRanks] }
  }
  if (key.endsWith(":ace-challenge")) return { row: "ace", rank: 4 }
  return { row: "main", rank: 99 }
}

function earnedTime(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}

function newestFirst(left: ProfileCourseChallengeRewardView, right: ProfileCourseChallengeRewardView) {
  return earnedTime(right.earned_at) - earnedTime(left.earned_at) || left.id.localeCompare(right.id)
}

function hierarchyFirst(left: ProfileCourseChallengeRewardView, right: ProfileCourseChallengeRewardView) {
  const leftRank = rewardRank(left)
  const rightRank = rewardRank(right)
  return leftRank.rank - rightRank.rank || newestFirst(left, right)
}

export function groupProfileCourseChallengeRewards(rewards: ProfileCourseChallengeReward[]): ProfileCourseChallengeGroup[] {
  const courses = getPublicCourseChallenges()
  const grouped = courses
    .map((course) => {
      const definitions = new Map(rewardDefinitions(course).map((definition) => [definition.rewardKey, definition]))
      const owned = rewards
        .filter((reward) => reward.course_slug === course.slug)
        .map((reward) => ({ ...reward, definition: definitions.get(reward.reward_key) || null }))
      const latest = owned.reduce<ProfileCourseChallengeRewardView | null>((current, reward) => !current || earnedTime(reward.earned_at) > earnedTime(current.earned_at) ? reward : current, null)
      const sorted = [...owned].sort(hierarchyFirst)
      return {
        course,
        rewards: sorted,
        mainRewards: sorted.filter((reward) => rewardRank(reward).row === "main"),
        aceRewards: sorted.filter((reward) => rewardRank(reward).row === "ace"),
        latestEarnedAt: latest?.earned_at || null,
      }
    })
    .filter((group) => group.rewards.length > 0)

  return grouped.sort((left, right) => earnedTime(right.latestEarnedAt) - earnedTime(left.latestEarnedAt) || left.course.displayOrder - right.course.displayOrder)
}
