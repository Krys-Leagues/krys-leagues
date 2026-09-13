export type CourseChallengeGameMode = "solo" | "multiplayer"

export function allowedGameModes(level: number, challengeKey: "level" | "ace" | "prestige" = "level"): CourseChallengeGameMode[] {
  return challengeKey === "ace" || challengeKey === "prestige" || level >= 3 ? ["multiplayer"] : ["solo", "multiplayer"]
}

export function isEligibleGameMode(level: number, mode: string | null | undefined, challengeKey: "level" | "ace" | "prestige" = "level") {
  return typeof mode === "string" && allowedGameModes(level, challengeKey).includes(mode as CourseChallengeGameMode)
}
