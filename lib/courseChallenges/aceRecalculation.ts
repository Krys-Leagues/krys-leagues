import { getCourseChallenge } from "./catalog.ts"
import { recalculateAceTrack, type AceSubmissionRecord } from "./ace.ts"

export type AceRecalculationRow = AceSubmissionRecord & {
  player_id: string
  course_slug: string
}

export type AceRecalculationReport = {
  playerId: string
  playerName: string
  courseSlug: string
  courseName: string
  storedCompletedStages: number[]
  storedUniqueAceHoles: number[]
  recalculatedUniqueAceHoles: number[]
  newlyEarnedStages: number[]
  evidenceCards: ReturnType<typeof recalculateAceTrack>["evidenceCards"]
  skippedCards: ReturnType<typeof recalculateAceTrack>["skippedCards"]
}

export function buildAceRecalculationReport({ rows, storedRows, playerNames }: { rows: AceRecalculationRow[]; storedRows: Array<{ player_id: string; course_slug: string; stage_number: number; completed_at: string | null }>; playerNames: Map<string, string> }) {
  const keys = new Set([
    ...rows.map((row) => row.player_id + "\u0000" + row.course_slug),
    ...storedRows.map((row) => row.player_id + "\u0000" + row.course_slug),
  ])
  const reports: AceRecalculationReport[] = []
  for (const key of keys) {
    const separator = key.indexOf("\u0000")
    const playerId = key.slice(0, separator)
    const courseSlug = key.slice(separator + 1)
    const course = getCourseChallenge(courseSlug)
    if (!course) continue
    const courseRows = rows.filter((row) => row.player_id === playerId && row.course_slug === courseSlug)
    const currentAceRows = courseRows.filter((row) => row.challenge_key === "ace" && row.status === "approved")
    const storedCompletedStages = storedRows
      .filter((row) => row.player_id === playerId && row.course_slug === courseSlug && row.completed_at)
      .map((row) => Number(row.stage_number))
      .filter((stage) => Number.isInteger(stage))
      .sort((left, right) => left - right)
    const recalculated = recalculateAceTrack(course, courseRows, storedCompletedStages)
    reports.push({
      playerId,
      playerName: playerNames.get(playerId) || "Unknown player",
      courseSlug,
      courseName: course.name,
      storedCompletedStages: [...new Set(storedCompletedStages)],
      storedUniqueAceHoles: recalculateAceTrack(course, currentAceRows).uniqueHoles,
      recalculatedUniqueAceHoles: recalculated.uniqueHoles,
      newlyEarnedStages: recalculated.newlyEarnedStages,
      evidenceCards: recalculated.evidenceCards,
      skippedCards: recalculated.skippedCards,
    })
  }
  return reports.sort((left, right) => left.playerName.localeCompare(right.playerName) || left.courseSlug.localeCompare(right.courseSlug))
}
