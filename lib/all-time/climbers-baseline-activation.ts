export const CLIMBERS_BASELINE_IMPORT_KEY = "all_time_leaderboard_2026_08_14"
export const CLIMBERS_BASELINE_CUTOFF = "2026-08-15T00:00:00.000Z"

export const EXPECTED_CLIMBERS_BASELINE = {
  sourceRows: 79,
  canonicalPlayers: 78,
  julyPoints: 15_210,
  augustPoints: 682,
  combinedPoints: 15_892,
} as const

export type ClimbersBaselineSourceRow = {
  source_name: string
  ytd_points: number | null
  period_points: number | null
  canonical_player_id: string | null
  identity_status: string
}

export type ClimbersBaselineImportMarker = {
  import_key: string
  cutoff_at: string
  applied_at: string | null
}

export type ClimbersBaselineSummary = {
  sourceRows: number
  canonicalPlayers: number
  julyPoints: number
  augustPoints: number
  combinedPoints: number
}

function isSameInstant(left: string, right: string): boolean {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  return Number.isFinite(leftTime) && leftTime === rightTime
}

export function summarizeClimbersBaseline(rows: ClimbersBaselineSourceRow[]): ClimbersBaselineSummary {
  const canonicalPlayers = new Set(rows.map((row) => row.canonical_player_id).filter((id): id is string => Boolean(id)))
  const julyPoints = rows.reduce((total, row) => total + (row.ytd_points ?? 0), 0)
  const augustPoints = rows.reduce((total, row) => total + (row.period_points ?? 0), 0)

  return {
    sourceRows: rows.length,
    canonicalPlayers: canonicalPlayers.size,
    julyPoints,
    augustPoints,
    combinedPoints: julyPoints + augustPoints,
  }
}

export function validateClimbersBaselineForActivation(
  marker: ClimbersBaselineImportMarker | null,
  summary: ClimbersBaselineSummary,
): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  if (!marker || marker.import_key !== CLIMBERS_BASELINE_IMPORT_KEY) {
    issues.push("The verified Climbers baseline import marker is missing.")
  }
  if (marker && !isSameInstant(marker.cutoff_at, CLIMBERS_BASELINE_CUTOFF)) {
    issues.push("The Climbers baseline cutoff does not match the verified cutoff.")
  }
  if (marker && marker.applied_at !== null) {
    issues.push("The legacy Climbers baseline is already applied.")
  }

  const checks: Array<[keyof typeof EXPECTED_CLIMBERS_BASELINE, number, string]> = [
    ["sourceRows", summary.sourceRows, "source rows"],
    ["canonicalPlayers", summary.canonicalPlayers, "canonical players"],
    ["julyPoints", summary.julyPoints, "July points"],
    ["augustPoints", summary.augustPoints, "August points"],
    ["combinedPoints", summary.combinedPoints, "combined points"],
  ]
  for (const [key, actual, label] of checks) {
    if (actual !== EXPECTED_CLIMBERS_BASELINE[key]) {
      issues.push(`Expected ${EXPECTED_CLIMBERS_BASELINE[key]} ${label}; found ${actual}.`)
    }
  }

  return { valid: issues.length === 0, issues }
}
