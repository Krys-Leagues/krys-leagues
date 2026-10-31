export type AvailabilityWindow = { startMinute: number; endMinute: number }

export type DoublesBoardGameState = "NOT PLAYED" | "COMPLETED"
export type DoublesBoardTaskState = "PENDING" | "CLAIMED" | "DONE" | "RETRYABLE" | "EXHAUSTED" | "NOT_FOUND"
export type DoublesFixtureParticipants = {
  homePlayer1Id: string
  homePlayer2Id: string
  awayPlayer1Id: string
  awayPlayer2Id: string
}

export function fixtureParticipantIds(participants: DoublesFixtureParticipants) {
  const ids = [participants.homePlayer1Id, participants.homePlayer2Id, participants.awayPlayer1Id, participants.awayPlayer2Id]
  return ids.every((id) => typeof id === "string" && id.trim() !== "") && new Set(ids).size === 4 ? ids : null
}

export function intersectAvailability(groups: AvailabilityWindow[][]) {
  if (!groups.length) return []
  return groups.reduce<AvailabilityWindow[]>((current, next) => current.flatMap((left) => next.flatMap((right) => {
    const startMinute = Math.max(left.startMinute, right.startMinute)
    const endMinute = Math.min(left.endMinute, right.endMinute)
    return startMinute < endMinute ? [{ startMinute, endMinute }] : []
  })), groups[0])
}

export function canFixtureParticipant(playerId: string, participantIds: string[]) {
  return participantIds.length === 4 && new Set(participantIds).size === 4 && participantIds.includes(playerId)
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

export function claimDoublesBoardTask(input: { status: DoublesBoardTaskState; availableAt: Date; now: Date; attempts: number; maxAttempts?: number }) {
  const maxAttempts = input.maxAttempts ?? 5
  if (input.status === "DONE" || input.status === "EXHAUSTED" || input.status === "NOT_FOUND") return false
  if (input.attempts >= maxAttempts) return false
  return input.status === "PENDING" || input.status === "RETRYABLE" || input.availableAt <= input.now
}

export function recoverStaleDoublesBoardTask(input: { status: DoublesBoardTaskState; claimedAt: Date | null; now: Date; staleAfterMs?: number }) {
  if (input.status !== "CLAIMED" || !input.claimedAt) return false
  return input.now.getTime() - input.claimedAt.getTime() >= (input.staleAfterMs ?? 10 * 60 * 1000)
}

export function classifyDoublesDiscordFailure(error: { status?: number; code?: string; message?: string }) {
  if (error.status === 404 || error.code === "UNKNOWN_MESSAGE" || error.code === "UNKNOWN_CHANNEL") return "not_found" as const
  if (error.status !== undefined && error.status >= 400 && error.status < 500) return "permanent" as const
  return "temporary" as const
}

export function doublesBoardTaskPayload(input: { seasonId: string; division: string; games: unknown[]; standings: unknown[] }) {
  return Object.freeze({ adapter: "doubles", seasonId: input.seasonId, division: input.division, games: input.games, standings: input.standings })
}

export function finalScorecardReadiness(input: { managed: boolean; rosterApproved: boolean; fixtures: number; incomplete: number; standingsCurrent: boolean; approved: boolean; existingSnapshot: boolean }) {
  return input.managed && input.rosterApproved && input.fixtures > 0 && input.incomplete === 0 && input.standingsCurrent && input.approved && !input.existingSnapshot
}

export function roleSyncKey(playerId: string, leagueKey: string, desiredState: "GRANTED" | "REVOKED") {
  return `${playerId}:${leagueKey}:${desiredState}`
}

export function buildDoublesBoardGame(input: {
  gameNumber: number
  homeTeamName: string
  homePlayers: string[]
  awayTeamName: string
  awayPlayers: string[]
  course: string
  hasAuthoritativeResult: boolean
}) {
  const state: DoublesBoardGameState = input.hasAuthoritativeResult ? "COMPLETED" : "NOT PLAYED"
  return Object.freeze({
    gameNumber: input.gameNumber,
    home: { teamName: input.homeTeamName, players: [...input.homePlayers] },
    away: { teamName: input.awayTeamName, players: [...input.awayPlayers] },
    course: input.course,
    state,
  })
}

export function buildLeagueRoleDesiredState(input: {
  activeMemberships: Array<{ playerId: string; leagueKey: string }>
  leagueKey: string
  knownPlayerIds: string[]
}) {
  const active = new Set(input.activeMemberships.filter((membership) => membership.leagueKey === input.leagueKey).map((membership) => membership.playerId))
  return input.knownPlayerIds.map((playerId) => ({
    playerId,
    leagueKey: input.leagueKey,
    desiredState: active.has(playerId) ? "GRANTED" as const : "REVOKED" as const,
    idempotencyKey: roleSyncKey(playerId, input.leagueKey, active.has(playerId) ? "GRANTED" : "REVOKED"),
  }))
}

export function canFinalizeDoublesSeason(input: {
  managed: boolean
  rosterApproved: boolean
  fixturesCount: number
  incompleteFixtures: number
  finalScorecardRequired: boolean
  finalScorecardApproved: boolean
  existingSnapshot: boolean
}) {
  if (!input.managed || !input.rosterApproved || input.fixturesCount < 1 || input.incompleteFixtures > 0) return false
  if (!input.finalScorecardRequired || !input.finalScorecardApproved) return false
  return !input.existingSnapshot
}

export function buildFinalSnapshot(input: { seasonId: string; division: string; teams: unknown[]; fixtures: unknown[]; results: unknown[]; standings: unknown[] }) {
  return Object.freeze({ seasonId: input.seasonId, division: input.division, teams: input.teams, fixtures: input.fixtures, results: input.results, standings: input.standings })
}
