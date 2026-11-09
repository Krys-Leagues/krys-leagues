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

  const easyOverParHoles = input.easyHoles.filter((score, index) => score > input.easyPars[index]).length
  const hardOverParHoles = input.hardHoles.filter((score, index) => score > input.hardPars[index]).length
  const badges: KwtKiwiBadge[] = easyOverParHoles === 0 && hardOverParHoles === 0
    ? ["COCONUT"]
    : easyOverParHoles === 0
      ? ["KIWI_EASY"]
      : hardOverParHoles === 0
        ? ["KIWI_HARD"]
        : []
  return { badges, easyBogeys: easy.bogeys, hardBogeys: hard.bogeys, easyRelativeToPar: easy.scoreRelativeToPar, hardRelativeToPar: hard.scoreRelativeToPar, errors }
}

