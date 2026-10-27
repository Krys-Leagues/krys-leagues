export const KWT_DIVISIONS = ["ELITE", "PRO", "SEMI-PRO", "AMATEUR"] as const
export type KwtDivision = typeof KWT_DIVISIONS[number]

export const KWT_TOP_TEN_POINTS = [25, 21, 18, 16, 15, 14, 13, 12, 11, 10] as const

export function standardCompetitionRanks(values: readonly number[]): number[] {
  const sorted = [...values].sort((left, right) => left - right)
  return values.map((value) => sorted.indexOf(value) + 1)
}

export type KwtDisplayRankInput = {
  playerId: string
  division?: string | null
  combinedNet: number | null
}

export type KwtDisplayRanks = {
  overall: Map<string, number>
  byDivision: Map<string, Map<string, number>>
}

/** Build both rank systems from the complete, unfiltered result set. */
export function buildKwtDisplayRanks(rows: readonly KwtDisplayRankInput[]): KwtDisplayRanks {
  const completed = rows.filter((row) => row.combinedNet !== null)
  const overallValues = standardCompetitionRanks(completed.map((row) => row.combinedNet!))
  const overall = new Map(completed.map((row, index) => [row.playerId, overallValues[index]]))
  const byDivision = new Map<string, Map<string, number>>()

  for (const division of ["ELITE", "PRO", "SEMI-PRO", "AMATEUR", "PROVISIONAL"] as const) {
    const divisionRows = completed.filter((row) => row.division === division)
    const divisionValues = standardCompetitionRanks(divisionRows.map((row) => row.combinedNet!))
    byDivision.set(division, new Map(divisionRows.map((row, index) => [row.playerId, divisionValues[index]])))
  }

  return { overall, byDivision }
}

export function pointsForVerifiedRank(rank: number, belowTenPoints?: readonly number[]): number | null {
  if (!Number.isInteger(rank) || rank < 1) return null
  if (rank <= KWT_TOP_TEN_POINTS.length) return KWT_TOP_TEN_POINTS[rank - 1]
  return belowTenPoints?.[rank - 1] ?? (rank <= 19 ? 20 - rank : 0)
}

export function divisionMedal(rank: number): "GOLD" | "SILVER" | "BRONZE" | null {
  return rank === 1 ? "GOLD" : rank === 2 ? "SILVER" : rank === 3 ? "BRONZE" : null
}

export function divisionMedalEmoji(rank: number | null): string {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : ""
}
