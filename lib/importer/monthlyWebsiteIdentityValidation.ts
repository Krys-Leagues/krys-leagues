import type { PlayerMatch } from "./matchPlayers"

export type MonthlyIdentityDirectory = {
  rawPlayers: Array<{ id: string }>
  canonicalId: (playerId: string) => string
  matchNames: (names: string[]) => PlayerMatch[]
}

export type MonthlyIdentityValidationFailure = {
  historicalName: string
  reason: "unresolved" | "non_canonical"
}

export type ReviewedMonthlyIdentityOverride = {
  sourceName: string
  sourcePlayerId: string
  mergeTargetSourceId: string
  historicalTargetName: string
  canonicalPlayerId: string
}

export const REVIEWED_MONTHLY_IDENTITY_OVERRIDES: Readonly<Record<string, ReviewedMonthlyIdentityOverride>> = Object.freeze({
  "Merged into 7231": {
    sourceName: "Merged into 7231",
    sourcePlayerId: "7988",
    mergeTargetSourceId: "7231",
    historicalTargetName: "WendyW(Wyndemere2020)",
    canonicalPlayerId: "7befb54f-6eec-4c7c-9881-c75d1acfb8d8",
  },
})

export function validateMonthlyWebsiteIdentities(
  names: string[],
  directory: MonthlyIdentityDirectory,
  options: { reviewedOverrides?: Readonly<Record<string, ReviewedMonthlyIdentityOverride>> } = {},
) {
  const matches = directory.matchNames(names)
  const canonicalByName = new Map<string, string>()
  const failures: MonthlyIdentityValidationFailure[] = []

  for (const [index, name] of names.entries()) {
    const reviewedOverride = options.reviewedOverrides?.[name]
    if (reviewedOverride) {
      const canonicalPlayer = directory.rawPlayers.find(
        (player) => player.id === reviewedOverride.canonicalPlayerId && directory.canonicalId(player.id) === reviewedOverride.canonicalPlayerId,
      )
      if (!canonicalPlayer) {
        failures.push({ historicalName: name, reason: "non_canonical" })
      } else {
        canonicalByName.set(name, reviewedOverride.canonicalPlayerId)
      }
      continue
    }

    const match = matches[index]
    if (!match?.autoLinkEligible || !match.playerId) {
      failures.push({ historicalName: name, reason: "unresolved" })
      continue
    }

    const canonicalId = directory.canonicalId(match.playerId)
    const canonicalPlayer = directory.rawPlayers.find(
      (player) => player.id === canonicalId && directory.canonicalId(player.id) === canonicalId,
    )
    if (!canonicalPlayer) {
      failures.push({ historicalName: name, reason: "non_canonical" })
      continue
    }

    canonicalByName.set(name, canonicalId)
  }

  return {
    ready: failures.length === 0,
    canonicalByName,
    failures,
  }
}
