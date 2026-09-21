export type CourseChallengeGameMode = "solo" | "multiplayer"
export type CourseChallengeKey = "level" | "ace" | "prestige"

export function allowedGameModes(level: number, challengeKey: CourseChallengeKey = "level"): CourseChallengeGameMode[] {
  if (challengeKey === "ace") return []
  return challengeKey === "prestige" || level >= 3 ? ["multiplayer"] : ["solo", "multiplayer"]
}

export function normalizeCourseChallengeGameMode(mode: string | null | undefined): CourseChallengeGameMode | null {
  return mode === "solo" || mode === "multiplayer" ? mode : null
}

export function isEligibleGameMode(level: number, mode: string | null | undefined, challengeKey: CourseChallengeKey = "level") {
  return typeof mode === "string" && allowedGameModes(level, challengeKey).includes(mode as CourseChallengeGameMode)
}

export function courseChallengeGameModeError(level: number, mode: string | null | undefined, challengeKey: CourseChallengeKey = "level") {
  if (challengeKey === "ace") return null
  const normalized = normalizeCourseChallengeGameMode(mode)
  if (!normalized) return "Select verified Solo or Multiplayer before approving this Course Challenge card."
  if (!isEligibleGameMode(level, normalized, challengeKey)) return "This Course Challenge requirement must be verified as Multiplayer before approval."
  return null
}
