import type { ScorecardAdapterKey, ScorecardHoleInput, ScorecardTotals } from "../core"

export type ScorecardContextReference = {
  adapterKey: ScorecardAdapterKey
  sourceType: "fixture" | "event_round" | "record_observation" | "manual_review"
  sourceKey: string
}

export type ScorecardAdapterParticipant = {
  roleKey: string
  playerId: string | null
  teamId: string | null
  displayName: string
}

export type ScorecardAdapterContext = ScorecardContextReference & {
  seasonId: string | null
  seasonNumber: number | null
  divisionNumber: number | null
  divisionLabel: string | null
  gameNumber: number | null
  roundKey: string | null
  roundLabel: string | null
  arrangedPlayedDate: string | null
  eventPlayedDate: string | null
  courseId: string
  courseCode: string
  courseName: string
  difficulty: "Easy" | "Hard"
  pars: number[]
  participants: ScorecardAdapterParticipant[]
}

export type VerifiedParticipantCard = {
  participant: ScorecardAdapterParticipant
  holes: ScorecardHoleInput[]
  totals: ScorecardTotals
}

export type ScorecardAdapterCommitPlan = {
  adapterKey: ScorecardAdapterKey
  sourceKey: string
  resultPayload: Record<string, unknown>
  standingsRefresh: Record<string, unknown> | null
}

export interface ScorecardLeagueAdapter {
  readonly key: ScorecardAdapterKey
  readonly implementation: "commit_ready" | "compatibility_only" | "blocked"
  readonly ownership: "player" | "team" | "mixed"
  readonly cardStructure: string
  validateForVerification(cards: VerifiedParticipantCard[]): void
  buildCommitPlan(context: ScorecardAdapterContext, cards: VerifiedParticipantCard[]): ScorecardAdapterCommitPlan
}
