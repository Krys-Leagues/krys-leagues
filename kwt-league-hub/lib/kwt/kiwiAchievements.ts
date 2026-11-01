import { deriveFullCardStats } from "../all-time/normal-records.ts"

export const KWT_KIWI_BADGES = ["KIWI_EASY", "KIWI_HARD", "COCONUT"] as const
export type KwtKiwiBadge = (typeof KWT_KIWI_BADGES)[number]

export type KwtKiwiAudit = {
  badges: KwtKiwiBadge[]
  easyBogeys: number | null
  hardBogeys: number | null
  easyRelativeToPar: number | null
  hardRelativeToPar: number | null
  errors: string[]
}

/**
 * Kiwi eligibility is a scorecard achievement. It intentionally ignores
 * handicaps, NET scores, division, placement, and leaderboard eligibility.
 */
export function calculateKwtKiwiAchievements(input: {
  easyHoles: number[]
  hardHoles: number[]
  easyPars: number[]
  hardPars: number[]
}): KwtKiwiAudit {
  const easy = deriveFullCardStats(input.easyHoles, input.easyPars)
  const hard = deriveFullCardStats(input.hardHoles, input.hardPars)
  const errors: string[] = []
  if ("error" in easy) errors.push(`Easy: ${easy.error}`)
  if ("error" in hard) errors.push(`Hard: ${hard.error}`)
  if ("error" in easy || "error" in hard) return { badges: [], easyBogeys: null, hardBogeys: null, easyRelativeToPar: null, hardRelativeToPar: null, errors }

  const badges: KwtKiwiBadge[] = []
  if (easy.bogeys === 0) badges.push("KIWI_EASY")
  if (hard.bogeys === 0) badges.push("KIWI_HARD")
  if (easy.bogeys === 0 && hard.bogeys === 0) badges.push("COCONUT")
  return { badges, easyBogeys: easy.bogeys, hardBogeys: hard.bogeys, easyRelativeToPar: easy.scoreRelativeToPar, hardRelativeToPar: hard.scoreRelativeToPar, errors }
}

