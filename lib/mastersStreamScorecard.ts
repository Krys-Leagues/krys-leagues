import { MAJOR_COURSES, formatMajorToPar, type MajorCourseCode, type MajorHoleScore } from "./majors.ts"

export const CHERRY_MASTERS_STREAM_PARS = {
  CBE: MAJOR_COURSES.CBE.pars,
  CBH: MAJOR_COURSES.CBH.pars,
} as const

export function mastersStreamCourseForRound(dayNumber: number): {
  code: MajorCourseCode
  name: string
  pars: readonly number[]
} {
  const code: MajorCourseCode = dayNumber <= 2 ? "CBE" : "CBH"
  return { code, ...MAJOR_COURSES[code] }
}

export type MastersStreamRoom = {
  group_id: string
  play_day_id: string
  day_number: 1 | 2 | 3 | 4
  day_label: string
  play_date: string
  starts_at: string
  group_label: string
  participant_count: 2 | 3 | 4
  roster: Array<{ player_id: string; player_screen_name_snapshot: string }>
  existing_session_id: string | null
}

export function runningToPar(
  scores: readonly MajorHoleScore[],
  participantId: string,
  pars: readonly number[]
) {
  return scores
    .filter((score) => score.participant_id === participantId)
    .reduce((total, score) => total + score.strokes - (pars[score.hole_number - 1] ?? 0), 0)
}

export function formatRunningToPar(value: number) {
  return formatMajorToPar(value)
}

export function completedThrough(scores: readonly MajorHoleScore[], participantId: string) {
  const completed = new Set(
    scores.filter((score) => score.participant_id === participantId).map((score) => score.hole_number)
  )
  let through = 0
  while (completed.has(through + 1)) through += 1
  return through
}

export function nineHoleRows(currentHole: number) {
  const first = currentHole <= 9 ? 1 : 10
  return Array.from({ length: 9 }, (_, index) => first + index)
}

export function updateLocalHoleScores(
  scores: readonly MajorHoleScore[],
  holeNumber: number,
  updates: Readonly<Record<string, number | null>>
) {
  const untouched = scores.filter(
    (score) => score.hole_number !== holeNumber || !(score.participant_id in updates)
  )
  const changed = Object.entries(updates).flatMap(([participantId, strokes]) =>
    strokes == null ? [] : [{ participant_id: participantId, hole_number: holeNumber, strokes }]
  )
  return [...untouched, ...changed].sort(
    (left, right) => left.hole_number - right.hole_number || left.participant_id.localeCompare(right.participant_id)
  )
}

export function isStaleRevisionError(message: string) {
  return message.includes("STALE_STREAM_REVISION") || message.includes("could not serialize access")
}
