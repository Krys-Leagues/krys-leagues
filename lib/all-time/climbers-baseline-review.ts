export type ClimbersBaselineReviewRow = {
  sourceName: string
  julyYtdPoints: number
  augustThrough14Points: number
}

export const CLIMBERS_BASELINE_REVIEW_CUTOFF = "2026-08-15T00:00:00.000Z"
export const CLIMBERS_BASELINE_SOURCE_NAME = "All Time Leaderboard To 14th Aug 2026 Dawn (1).xlsm"
export const CLIMBERS_BASELINE_SOURCE_PLAYERS = 79
export const CLIMBERS_BASELINE_RESOLVED_SOURCE_NAMES = 62

const REVIEW_SOURCE_ROWS: Array<[string, number, number]> = [
  ["ZOEDARLIN", 1868, 0],
  ["MAMMOTHREPT", 730, 0],
  ["YANKEEDUDE08", 300, 0],
  ["KD0017", 234, 53],
  ["SLUGJUG33", 82, 0],
  ["L7JAZZ", 69, 0],
  ["DREW 0706", 69, 0],
  ["STICKY80", 54, 0],
  ["XEROFORMGIRL", 51, 0],
  ["MULLIGAN", 42, 0],
  ["FRY LOCK", 39, 0],
  ["SHOOTER MCGAVIN", 38, 0],
  ["WYNDEMERE", 38, 0],
  ["WICKEDSHACK", 31, 0],
  ["AWSOME KRIS", 22, 0],
  ["STEWIE", 2, 0],
  ["ANDREWBCA", 0, 61],
]

export const CLIMBERS_BASELINE_REVIEW_ROWS: ClimbersBaselineReviewRow[] = REVIEW_SOURCE_ROWS.map(([sourceName, julyYtdPoints, augustThrough14Points]) => ({
  sourceName,
  julyYtdPoints,
  augustThrough14Points,
}))

export function combinedBaselinePoints(row: ClimbersBaselineReviewRow) {
  return row.julyYtdPoints + row.augustThrough14Points
}

export function normalizeBaselineIdentity(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}
