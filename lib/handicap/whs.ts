export const HANDICAP_START_BOUNDARY = "2026-09-15T00:00:00.000Z"

export type HandicapRound = {
  id: string
  playerId: string
  playedAt: string
  adjustedGrossScore: number
  courseRating: number
  slopeRating: number
  pccAdjustment?: number
  source: string
}

export type ScoreDifferential = HandicapRound & { scoreDifferential: number }

export type HandicapIndexResult = {
  index: number | null
  roundsCount: number
  selectedRoundIds: string[]
  adjustment: number
  status: "NO_INDEX" | "PROVISIONAL" | "ACTIVE"
}

export const FEWER_THAN_20_RULES = [
  { min: 3, max: 3, count: 1, adjustment: -2 },
  { min: 4, max: 4, count: 1, adjustment: -1 },
  { min: 5, max: 5, count: 1, adjustment: 0 },
  { min: 6, max: 6, count: 2, adjustment: -1 },
  { min: 7, max: 8, count: 2, adjustment: 0 },
  { min: 9, max: 11, count: 3, adjustment: 0 },
  { min: 12, max: 14, count: 4, adjustment: 0 },
  { min: 15, max: 16, count: 5, adjustment: 0 },
  { min: 17, max: 18, count: 6, adjustment: 0 },
  { min: 19, max: 19, count: 7, adjustment: 0 },
  { min: 20, max: 20, count: 8, adjustment: 0 },
] as const

function roundHalfAwayFromZero(value: number, decimals = 1) {
  const factor = 10 ** decimals
  return (value < 0 ? Math.ceil(value * factor - 0.5) : Math.floor(value * factor + 0.5)) / factor
}

export function calculateScoreDifferential(round: Omit<HandicapRound, "id" | "playerId" | "playedAt" | "source">) {
  if (!Number.isFinite(round.slopeRating) || round.slopeRating <= 0) throw new Error("Slope Rating must be positive.")
  if (!Number.isFinite(round.courseRating)) throw new Error("Course Rating is required.")
  const pccAdjustment = round.pccAdjustment ?? 0
  return roundHalfAwayFromZero((113 / round.slopeRating) * (round.adjustedGrossScore - round.courseRating - pccAdjustment))
}

export function addScoreDifferentials(rounds: HandicapRound[]): ScoreDifferential[] {
  return rounds.map((round) => ({ ...round, scoreDifferential: calculateScoreDifferential(round) }))
}

export function calculateHandicapIndex(rounds: ScoreDifferential[]): HandicapIndexResult {
  const ordered = [...rounds].sort((left, right) => new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime())
  const recent = ordered.slice(0, 20)
  if (recent.length < 3) return { index: null, roundsCount: recent.length, selectedRoundIds: [], adjustment: 0, status: "NO_INDEX" }

  const rule = FEWER_THAN_20_RULES.find((value) => recent.length >= value.min && recent.length <= value.max)
  const count = rule?.count ?? 8
  const adjustment = rule?.adjustment ?? 0
  const selected = [...recent].sort((left, right) => left.scoreDifferential - right.scoreDifferential).slice(0, count)
  const average = selected.reduce((sum, round) => sum + round.scoreDifferential, 0) / selected.length
  return {
    index: roundHalfAwayFromZero(average + adjustment),
    roundsCount: recent.length,
    selectedRoundIds: selected.map((round) => round.id),
    adjustment,
    status: recent.length >= 20 ? "ACTIVE" : "PROVISIONAL",
  }
}

export function isForwardEligibleRound(playedAt: string, source: "KWT" | "LEAGUE" | "ALL_TIME", hasPlayedScore: boolean, isTeamOnly = false) {
  return source !== "ALL_TIME" || (hasPlayedScore && !isTeamOnly && new Date(playedAt).getTime() >= new Date(HANDICAP_START_BOUNDARY).getTime())
}
