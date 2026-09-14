import type { CourseChallengeCourse, CourseChallengeRewardDefinition } from "./types"

export function levelRewardDefinitions(course: CourseChallengeCourse, level: number): CourseChallengeRewardDefinition[] {
  const levelData = course.levels.find((item) => item.level === level)
  if (!levelData) return []
  return [
    { rewardKey: levelData.stickerKey, label: course.name + " Level " + level + " sticker", kind: "sticker", courseSlug: course.slug, level, assetPath: levelData.stickerAsset },
    ...(levelData.badgeKey ? [{ rewardKey: levelData.badgeKey, label: course.name + " Level " + level + " badge", kind: "badge" as const, courseSlug: course.slug, level, assetPath: levelData.badgeAsset }] : []),
  ]
}

export function isProfileDisplayRewardKey(rewardKey: string): boolean {
  // Eligibility comes from the persisted course_challenge_rewards ownership
  // row. This helper is intentionally generic so new earned reward metadata
  // becomes displayable without another reward-key allow-list change.
  return rewardKey.trim().length > 0
}

export function profileDisplayRewardRank(rewardKey: string): number {
  if (rewardKey.endsWith(":course-pro")) return 0
  if (rewardKey.endsWith(":ace-challenge") || rewardKey.includes(":ace-")) return 1
  if (rewardKey.includes(":level-5:")) return 2
  return 3
}

export function aceRewardDefinition(course: CourseChallengeCourse): CourseChallengeRewardDefinition | null {
  const ace = course.aceChallenge
  return ace ? { rewardKey: ace.rewardKey, label: course.name + " Ace Challenge badge", kind: "badge", courseSlug: course.slug, level: null, assetPath: ace.rewardAsset } : null
}

export function aceStageRewardDefinitions(course: CourseChallengeCourse): CourseChallengeRewardDefinition[] {
  return (course.aceStages || []).map((stage) => ({ rewardKey: stage.rewardKey, label: course.name + " " + stage.label, kind: "badge" as const, courseSlug: course.slug, level: null, assetPath: stage.rewardAsset }))
}

export function prestigeStageRewardDefinitions(course: CourseChallengeCourse, stage: number): CourseChallengeRewardDefinition[] {
  const prestige = course.prestigeStages?.find((item) => item.stage === stage)
  return prestige ? [{ rewardKey: prestige.rewardKey, label: prestige.label, kind: "badge", courseSlug: course.slug, level: null, assetPath: prestige.rewardAsset }] : []
}
