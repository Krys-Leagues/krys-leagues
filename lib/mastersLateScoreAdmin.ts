import { MAJOR_COURSES, type MajorCourseCode, type MajorScorecardStatus } from "./majors.ts"

export type MastersLateScoreAdminRow = {
  eventId: string
  entryId: string
  playerId: string
  playerName: string
  playDayId: string
  dayNumber: 1 | 2 | 3 | 4
  playDate: string
  roomId: string
  roomLabel: string
  scheduledAt: string
  normalClosesAt: string
  scoringFinalizedAt: string | null
  scorecardId: string | null
  scorecardStatus: MajorScorecardStatus | null
  holes: Array<{ hole_number: number; par: number; strokes: number }>
  reopenedUntil: string | null
}

export function mastersLateScoreCourse(dayNumber: number) {
  const code: MajorCourseCode = dayNumber <= 2 ? "CBE" : "CBH"
  return { code, ...MAJOR_COURSES[code] }
}

export function isMastersLateScoreUnfinished(status: MajorScorecardStatus | null) {
  return status === null || status === "draft" || status === "reopened"
}

export function mastersLateScoreState(row: MastersLateScoreAdminRow, now = Date.now()) {
  if (row.scoringFinalizedAt) return "finalized" as const
  if (!isMastersLateScoreUnfinished(row.scorecardStatus)) return row.scorecardStatus as "submitted" | "verified"
  if (new Date(row.scheduledAt).getTime() > now) return "before_start" as const
  if (row.reopenedUntil && new Date(row.reopenedUntil).getTime() > now) return "reopened" as const
  if (new Date(row.normalClosesAt).getTime() >= now) return "open" as const
  return "expired" as const
}

export function mastersAdminScoreTotals(dayNumber: number, values: string[]) {
  const course = mastersLateScoreCourse(dayNumber)
  const strokes = values.map(Number)
  const complete = strokes.length === 18 && strokes.every((score) => Number.isInteger(score) && score >= 1 && score <= 99)
  return {
    complete,
    total: complete ? strokes.reduce((sum, score) => sum + score, 0) : null,
    toPar: complete ? strokes.reduce((sum, score, index) => sum + score - course.pars[index], 0) : null,
  }
}
