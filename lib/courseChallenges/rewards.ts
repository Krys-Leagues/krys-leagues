import type { CourseChallengeCourse, CourseChallengeRewardDefinition } from "./types"

export function levelRewardDefinitions(course: CourseChallengeCourse, level: number): CourseChallengeRewardDefinition[] {
  const levelData = course.levels.find((item) => item.level === level)
  if (!levelData) return []
  return [
    { rewardKey: levelData.stickerKey, label: course.name + " Level " + level + " sticker", kind: "sticker", courseSlug: course.slug, level, assetPath: levelData.stickerAsset },
    ...(levelData.badgeKey ? [{ rewardKey: levelData.badgeKey, label: course.name + " Level " + level + " badge", kind: "badge" as const, courseSlug: course.slug, level, assetPath: levelData.badgeAsset }] : []),
    ...(level === 3 ? [{ rewardKey: "course-challenge:" + course.slug + ":course-pro", label: "Course Pro", kind: "badge" as const, courseSlug: course.slug, level: null, assetPath: course.courseProAsset ?? null }] : []),
    ...(level === 5 ? [{ rewardKey: "course-challenge:" + course.slug + ":course-master", label: "Course Master", kind: "badge" as const, courseSlug: course.slug, level: null, assetPath: course.courseMasterAsset ?? null }] : []),
  ]
}

export function aceRewardDefinition(course: CourseChallengeCourse): CourseChallengeRewardDefinition | null {
  const ace = course.aceChallenge
  return ace ? { rewardKey: ace.rewardKey, label: course.name + " Ace Challenge badge", kind: "badge", courseSlug: course.slug, level: null, assetPath: ace.rewardAsset } : null
}