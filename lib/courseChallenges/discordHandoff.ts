export const DISCORD_GAME_SOURCE = "discord_course_challenge_game" as const

export function nextIncompleteCourseChallengeLevel(completedLevels: ReadonlyArray<number>) {
  const completed = new Set(completedLevels.filter(Number.isInteger))
  return [1, 2, 3, 4, 5].find((level) => !completed.has(level)) ?? null
}

export function allowedDiscordEvidenceUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && ["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function discordEvidenceExtension(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}
