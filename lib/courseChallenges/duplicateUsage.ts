export type CourseChallengeTrack = "level" | "ace" | "prestige"

export type CourseChallengeCardUsage = {
  id: string
  playerId: string
  courseSlug: string
  challengeKey: CourseChallengeTrack
  level: number | null
  aceStage: number | null
  difficulty: string | null
  status: string
  aceCrossCredited?: boolean
}

export type DuplicateDisposition =
  | "allowed_cross_track"
  | "blocked_same_track"
  | "blocked_identity_mismatch"
  | "non_blocking_unapproved"

export type DuplicateClassification = {
  disposition: DuplicateDisposition
  blocking: boolean
  currentUsageKey: string
  existingUsageKeys: string[]
}

export function courseChallengeUsageKey(card: CourseChallengeCardUsage): string {
  if (card.challengeKey === "ace") return `ace:${card.courseSlug}:stage-${card.aceStage ?? card.level ?? "unknown"}`
  if (card.challengeKey === "prestige") return `prestige:${card.courseSlug}:stage-${card.level ?? "unknown"}:${card.difficulty ?? "unknown"}`
  return `level:${card.courseSlug}:level-${card.level ?? "unknown"}:${card.difficulty ?? "unknown"}`
}

export function existingUsageKeys(card: CourseChallengeCardUsage): string[] {
  const keys = [courseChallengeUsageKey(card)]
  if (card.challengeKey === "level" && card.aceCrossCredited && card.aceStage) {
    keys.push(`ace:${card.courseSlug}:stage-${card.aceStage}`)
  }
  return keys
}

export function classifyDuplicateCard(current: CourseChallengeCardUsage, existing: CourseChallengeCardUsage): DuplicateClassification {
  const currentUsageKey = courseChallengeUsageKey(current)
  const usageKeys = existingUsageKeys(existing)

  if (existing.status !== "approved") {
    return { disposition: "non_blocking_unapproved", blocking: false, currentUsageKey, existingUsageKeys: usageKeys }
  }

  if (current.playerId !== existing.playerId || current.courseSlug !== existing.courseSlug) {
    return { disposition: "blocked_identity_mismatch", blocking: true, currentUsageKey, existingUsageKeys: usageKeys }
  }

  if (usageKeys.includes(currentUsageKey)) {
    return { disposition: "blocked_same_track", blocking: true, currentUsageKey, existingUsageKeys: usageKeys }
  }

  const levelAcePair = (current.challengeKey === "level" && existing.challengeKey === "ace")
    || (current.challengeKey === "ace" && existing.challengeKey === "level")
  if (levelAcePair) {
    return { disposition: "allowed_cross_track", blocking: false, currentUsageKey, existingUsageKeys: usageKeys }
  }

  return { disposition: "blocked_same_track", blocking: true, currentUsageKey, existingUsageKeys: usageKeys }
}
