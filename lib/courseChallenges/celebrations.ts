export const COURSE_CHALLENGE_REACTIONS = ["🎉", "👏", "🏆", "🔥", "❤️", "⛳"] as const
export type CourseChallengeReaction = typeof COURSE_CHALLENGE_REACTIONS[number]

export function celebrationRewardLabel(label: string, level: number | null, rewardKey: string) {
  if (rewardKey.endsWith(":course-pro")) return "Course Pro"
  if (rewardKey.endsWith(":ace-challenge")) return "Ace Challenge"
  if (rewardKey.endsWith(":course-master")) return "Course Master"
  return level ? `Level ${level}` : label
}

export function buildCourseChallengeDiscordCelebration(playerName: string, courseName: string, rewardLabel: string) {
  return `🎉 COURSE CHALLENGE ACHIEVEMENT\n\n${playerName} earned ${courseName} — ${rewardLabel}!\n\nCongratulations! 🏆`
}

export function celebrationDiscordWebhookConfigured() {
  return Boolean(process.env.DISCORD_WEBHOOK_COURSE_CHALLENGE_CELEBRATIONS)
}
