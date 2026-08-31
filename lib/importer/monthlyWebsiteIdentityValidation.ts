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

export function validateMonthlyWebsiteIdentities(
  names: string[],
  directory: MonthlyIdentityDirectory,
) {
  const matches = directory.matchNames(names)
  const canonicalByName = new Map<string, string>()
  const failures: MonthlyIdentityValidationFailure[] = []

  for (const [index, name] of names.entries()) {
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
