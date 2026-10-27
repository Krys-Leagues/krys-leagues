import { formatLocalDateTime, localDateTimeToUtc } from "./schedule.ts"
import type { TrophyPlacement } from "./trophy"

export type ScheduleOffer = { id: string; proposedBy: string; startsAt: string; timeZone: string; status: "pending" | "accepted" | "countered" | "withdrawn" }
export type MatchState = { id: string; playerA: string; playerB: string; status: "pending" | "live" | "completed" | "review"; winner?: string; offers: ScheduleOffer[]; confirmations: Record<string, string> }

export function proposeScheduleOffer(match: MatchState, actor: string, localDateTime: string, timeZone: string, id: string): MatchState {
  if (![match.playerA, match.playerB].includes(actor)) throw new Error("Only a match participant may propose a time")
  const startsAt = localDateTimeToUtc(localDateTime, timeZone)
  if (new Date(startsAt).getTime() <= Date.now()) throw new Error("A proposed match time must be in the future")
  return { ...match, offers: [...match.offers, { id, proposedBy: actor, startsAt, timeZone, status: "pending" }] }
}

export function respondToScheduleOffer(match: MatchState, actor: string, offerId: string, action: "accept" | "counter" | "withdraw"): MatchState {
  const offer = match.offers.find((candidate) => candidate.id === offerId)
  if (!offer || ![match.playerA, match.playerB].includes(actor)) throw new Error("The offer or participant is invalid")
  if (action === "accept" && offer.proposedBy === actor) throw new Error("The proposer cannot accept their own offer")
  return { ...match, offers: match.offers.map((candidate) => candidate.id === offerId ? { ...candidate, status: action === "accept" ? "accepted" : action === "counter" ? "countered" : "withdrawn" } : candidate) }
}

export function localOfferTimes(offer: ScheduleOffer, firstZone: string, secondZone: string) {
  return { first: formatLocalDateTime(offer.startsAt, firstZone), second: formatLocalDateTime(offer.startsAt, secondZone) }
}

export type ScorecardRules = { holeInOne?: number; condor?: number; albatross?: number; eagle?: number; birdie?: number; par?: number }
export function validateScorecard(scores: number[], rules: ScorecardRules = {}): number {
  const values = Object.values(rules).filter((value): value is number => value !== undefined)
  if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Scorecard point values must be non-negative numbers")
  if (scores.length !== 18 || scores.some((score) => !Number.isInteger(score) || score < 1 || score > 20)) throw new Error("An 18-hole scorecard with whole-number scores is required")
  const total = scores.reduce((sum, score) => sum + score, 0)
  return total
}

export function scoreTournamentCard(scores: number[], par: number[], rules: ScorecardRules): { total: number; points: number } {
  validateScorecard(scores, rules)
  if (par.length !== 18 || par.some((value) => !Number.isInteger(value) || value < 1)) throw new Error("Exactly 18 valid hole pars are required")
  const points = scores.reduce((sum, score, index) => {
    const relative = par[index] - score
    // A hole-in-one is its own approved 5,4,3,2,1 outcome. It must win over
    // the relative-to-par classification on par-4 holes (which would look
    // like an albatross/condor otherwise).
    if (score === 1) return sum + (rules.holeInOne ?? 5)
    if (relative >= 3) return sum + (rules.condor ?? 4)
    if (relative === 3) return sum + (rules.albatross ?? 3)
    if (relative === 2) return sum + (rules.eagle ?? 2)
    if (relative === 1) return sum + (rules.birdie ?? 1)
    return sum + (rules.par ?? 0)
  }, 0)
  return { total: scores.reduce((sum, score) => sum + score, 0), points }
}

export function confirmWinner(match: MatchState, actor: string, winner: string): MatchState {
  if (![match.playerA, match.playerB].includes(actor) || ![match.playerA, match.playerB].includes(winner)) throw new Error("The confirmer and winner must be match participants")
  const confirmations = { ...match.confirmations, [actor]: winner }
  const values = Object.values(confirmations)
  if (values.length === 2 && values[0] === values[1]) return { ...match, confirmations, status: "completed", winner }
  if (values.length === 2) return { ...match, confirmations, status: "review" }
  return { ...match, confirmations }
}

export function downstreamMatchKeys(round: number, matchNumber: number, bracketSize: 32 | 64): string[] {
  const maxRound = Math.log2(bracketSize)
  const impacted: string[] = []
  for (let nextRound = round + 1; nextRound <= maxRound; nextRound++) impacted.push(`r${nextRound}m${Math.ceil(matchNumber / (2 ** (nextRound - round)))}`)
  return impacted
}

export function canViewSecretPars(userId: string, designatedAdminId: string, topAdminIds: string[], tournamentPlayerIds: string[]) {
  if (!topAdminIds.includes(userId) || userId !== designatedAdminId) return false
  return !tournamentPlayerIds.includes(userId)
}

export function personalizeTrophy(originalPath: string, winnerName: string, placement: TrophyPlacement) {
  if (!originalPath || !winnerName.trim()) throw new Error("Original trophy and verified winner are required")
  if (![placement.x, placement.y, placement.fontSize].every(Number.isFinite) || placement.fontSize <= 0) throw new Error("Trophy text placement is invalid")
  return { originalPath, copyRequired: true, winnerName: winnerName.trim(), placement }
}

export type DiscordResult = { status: "sent" | "not_configured" | "failed"; id?: string; reason?: string }
export interface TournamentDiscordAdapter { createPrivateThread(input: { matchId: string; playerIds: string[]; body: string }): Promise<DiscordResult>; sendReminder(input: { matchId: string; playerIds: string[]; body: string }): Promise<DiscordResult>; sendThreadMessage(input: { threadId: string; body: string }): Promise<DiscordResult>; deleteThread(threadId: string): Promise<DiscordResult> }
export function createMockDiscordAdapter(configured = false): TournamentDiscordAdapter {
  return { async createPrivateThread() { return configured ? { status: "sent", id: "mock-thread" } : { status: "not_configured", reason: "Discord credentials are not configured" } }, async sendReminder() { return configured ? { status: "sent" } : { status: "not_configured", reason: "Discord credentials are not configured" } }, async sendThreadMessage() { return configured ? { status: "sent" } : { status: "not_configured", reason: "Discord credentials are not configured" } }, async deleteThread() { return configured ? { status: "sent" } : { status: "not_configured", reason: "Discord credentials are not configured" } } }
}
