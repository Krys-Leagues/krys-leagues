export type WeeklyDivision = "AMATEUR" | "SEMI-PRO" | "PRO" | "ELITE"

export type WeeklyEvidenceRow = {
  source: "THE_WEEKLY"
  eventId: string
  seasonWeek: string
  division: WeeklyDivision
  playerExact: string
  sourcePlayerId?: string
  courseCode: string
  difficulty: "EASY" | "HARD"
  score: number | null
  completedRound: boolean
  sourceScreenshot: string
  sourceRow: number
  verificationStatus: "VERIFIED" | "AMBIGUOUS" | "EXCLUDED"
  exceptionReason?: string
}

export type WeeklyValidatedRow = WeeklyEvidenceRow & {
  fingerprint: string
  courseRatingEligible: true
  personalHandicapEligible: false
}

export type WeeklyRejectedRow = WeeklyEvidenceRow & {
  fingerprint: string
  reason: string
}

const VALID_COURSE_CODE = /^[A-Z0-9]{3}$/

export function weeklyFingerprint(row: Pick<WeeklyEvidenceRow, "eventId" | "division" | "playerExact" | "courseCode" | "sourceRow">): string {
  return ["THE_WEEKLY", row.eventId, row.division, row.playerExact, row.courseCode, row.sourceRow].join("|")
}

export function validateWeeklyRows(rows: readonly WeeklyEvidenceRow[]): {
  accepted: readonly WeeklyValidatedRow[]
  rejected: readonly WeeklyRejectedRow[]
} {
  const seen = new Set<string>()
  const accepted: WeeklyValidatedRow[] = []
  const rejected: WeeklyRejectedRow[] = []

  for (const row of rows) {
    const fingerprint = weeklyFingerprint(row)
    let reason: string | null = null
    if (seen.has(fingerprint)) reason = "DUPLICATE_WEEKLY_SOURCE_FINGERPRINT"
    else if (row.source !== "THE_WEEKLY") reason = "SOURCE_NOT_THE_WEEKLY"
    else if (!VALID_COURSE_CODE.test(row.courseCode)) reason = "UNKNOWN_OR_INVALID_COURSE_CODE"
    else if (!Number.isFinite(row.score)) reason = "MISSING_OR_NON_NUMERIC_SCORE"
    else if (!row.completedRound) reason = "INCOMPLETE_ROUND"
    else if (row.verificationStatus !== "VERIFIED") reason = row.exceptionReason ?? "ROW_NOT_VERIFIED"

    seen.add(fingerprint)
    if (reason) rejected.push({ ...row, fingerprint, reason })
    else accepted.push({ ...row, fingerprint, courseRatingEligible: true, personalHandicapEligible: false })
  }

  return { accepted, rejected }
}

export function summarizeWeeklyRows(rows: readonly WeeklyValidatedRow[]): readonly {
  courseCode: string
  difficulty: WeeklyValidatedRow["difficulty"]
  eventCount: number
  rowCount: number
  distinctSourcePlayers: number
}[] {
  const groups = new Map<string, WeeklyValidatedRow[]>()
  for (const row of rows) {
    const key = `${row.courseCode}|${row.difficulty}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, grouped]) => {
    const [courseCode, difficulty] = key.split("|") as [string, WeeklyValidatedRow["difficulty"]]
    return {
      courseCode,
      difficulty,
      eventCount: new Set(grouped.map((row) => row.eventId)).size,
      rowCount: grouped.length,
      distinctSourcePlayers: new Set(grouped.map((row) => row.playerExact)).size,
    }
  })
}
