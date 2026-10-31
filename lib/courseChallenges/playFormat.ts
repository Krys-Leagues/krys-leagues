export type CourseChallengePlayFormatRule =
  | "SOLO PLAY ALLOWED"
  | "MULTIPLAYER ROOM REQUIRED"
  | "MULTIPLAYER OR NAMED SOLO ROOM REQUIRED"

export function playFormatRuleForLevel(level: number): CourseChallengePlayFormatRule {
  return level <= 3 ? "SOLO PLAY ALLOWED" : "MULTIPLAYER ROOM REQUIRED"
}

export function playFormatRuleForPrestige(key: "course-pro" | "course-master"): CourseChallengePlayFormatRule {
  void key
  return "MULTIPLAYER ROOM REQUIRED"
}

export function playFormatRuleForAce(key: "wader" | "chaser" | "hunter" | "legend"): CourseChallengePlayFormatRule {
  return key === "wader" || key === "chaser" ? "SOLO PLAY ALLOWED" : "MULTIPLAYER OR NAMED SOLO ROOM REQUIRED"
}
