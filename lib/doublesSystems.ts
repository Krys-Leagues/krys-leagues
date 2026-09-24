export type AvailabilityWindow = { startMinute: number; endMinute: number }

export function intersectAvailability(groups: AvailabilityWindow[][]) {
  if (!groups.length) return []
  return groups.reduce<AvailabilityWindow[]>((current, next) => current.flatMap((left) => next.flatMap((right) => {
    const startMinute = Math.max(left.startMinute, right.startMinute)
    const endMinute = Math.min(left.endMinute, right.endMinute)
    return startMinute < endMinute ? [{ startMinute, endMinute }] : []
  })), groups[0])
}

export function canFixtureParticipant(playerId: string, participantIds: string[]) {
  return participantIds.includes(playerId)
}

export function nextArrangeState(current: "NOT ARRANGED" | "PROPOSED" | "COUNTERED" | "ACCEPTED", action: "propose" | "counter" | "accept") {
  if (action === "propose" && current === "NOT ARRANGED") return "PROPOSED" as const
  if (action === "counter" && (current === "PROPOSED" || current === "COUNTERED")) return "COUNTERED" as const
  if (action === "accept" && (current === "PROPOSED" || current === "COUNTERED")) return "ACCEPTED" as const
  return null
}

export function reminderRecipients(participantIds: string[], acceptedFor: Date) {
  return { eligibleAt: new Date(acceptedFor.getTime() - 20 * 60 * 1000), recipients: [...new Set(participantIds)] }
}

export function boardRetry(attempts: number, errorKind: "temporary" | "not_found" | "permanent") {
  if (errorKind === "not_found") return { state: "NOT_FOUND" as const, delayMs: null }
  if (errorKind === "permanent" || attempts >= 5) return { state: "EXHAUSTED" as const, delayMs: null }
  return { state: "RETRYABLE" as const, delayMs: Math.min(60 * 60 * 1000, 2 ** attempts * 60 * 1000) }
}

export function roleSyncKey(playerId: string, leagueKey: string, desiredState: "GRANTED" | "REVOKED") {
  return `${playerId}:${leagueKey}:${desiredState}`
}

export function buildFinalSnapshot(input: { seasonId: string; division: string; teams: unknown[]; fixtures: unknown[]; results: unknown[]; standings: unknown[] }) {
  return Object.freeze({ seasonId: input.seasonId, division: input.division, teams: input.teams, fixtures: input.fixtures, results: input.results, standings: input.standings })
}
