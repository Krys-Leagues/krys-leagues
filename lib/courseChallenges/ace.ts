import type { CourseChallengeAceStage, CourseChallengeCourse } from "./types"

export type AceSubmissionRecord = {
  id?: unknown
  player_id?: unknown
  course_slug?: unknown
  challenge_key?: unknown
  level_number?: unknown
  created_at?: unknown
  difficulty?: unknown
  hole_scores?: unknown
  requirements_evaluation?: unknown
  status?: unknown
}

export type AceEvidenceCard = {
  id: string | null
  challengeKey: "level" | "ace"
  level: number | null
  difficulty: string | null
  createdAt: string | null
  aceHoles: number[]
}

export type AceSkippedCard = {
  id: string | null
  challengeKey: "level" | "ace"
  level: number | null
  difficulty: string | null
  reason: "not_verified" | "missing_hole_scores"
}

export function aceHoleNumbers(scores: unknown): number[] {
  if (!Array.isArray(scores)) return []
  return scores.flatMap((score, index) => Number(score) === 1 ? [index + 1] : [])
}

export function uniqueAceHoleNumbers(rows: ReadonlyArray<AceSubmissionRecord>, currentScores?: number[]): number[] {
  const holes = new Set<number>()
  for (const row of rows) for (const hole of aceHoleNumbers(row.hole_scores)) holes.add(hole)
  if (currentScores) for (const hole of aceHoleNumbers(currentScores)) holes.add(hole)
  return [...holes].sort((left, right) => left - right)
}

function isCompleteScorecard(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 18 && value.every((score) => Number.isInteger(score) && score > 0)
}

function cardSummary(row: AceSubmissionRecord) {
  return {
    id: row.id === undefined || row.id === null ? null : String(row.id),
    challengeKey: row.challenge_key === "ace" ? "ace" as const : "level" as const,
    level: row.level_number === undefined || row.level_number === null ? null : Number(row.level_number),
    difficulty: row.difficulty === undefined || row.difficulty === null ? null : String(row.difficulty),
    createdAt: row.created_at === undefined || row.created_at === null ? null : String(row.created_at),
  }
}

export function recalculateAceTrack(course: CourseChallengeCourse, rows: ReadonlyArray<AceSubmissionRecord>, storedCompletedStages: number[] = []) {
  const uniqueHoles = new Set<number>()
  const evidenceCards: AceEvidenceCard[] = []
  const skippedCards: AceSkippedCard[] = []

  for (const row of rows) {
    const summary = cardSummary(row)
    if (row.status !== undefined && row.status !== "approved") {
      skippedCards.push({ ...summary, reason: "not_verified" })
      continue
    }
    if (!isCompleteScorecard(row.hole_scores)) {
      skippedCards.push({ ...summary, reason: "missing_hole_scores" })
      continue
    }
    const aceHoles = aceHoleNumbers(row.hole_scores)
    for (const hole of aceHoles) uniqueHoles.add(hole)
    evidenceCards.push({ ...summary, aceHoles })
  }

  const sortedUniqueHoles = [...uniqueHoles].sort((left, right) => left - right)
  const completedStages = (course.aceStages || [])
    .filter((stage) => sortedUniqueHoles.length >= Number(stage.easyRequirements[0]?.target || Number.MAX_SAFE_INTEGER))
    .map((stage) => stage.stage)
  return {
    uniqueHoles: sortedUniqueHoles,
    completedStages,
    newlyEarnedStages: completedStages.filter((stage) => !storedCompletedStages.includes(stage)),
    evidenceCards,
    skippedCards,
  }
}

function aceStageKeyFromEvaluation(value: unknown): CourseChallengeAceStage["key"] | null {
  if (!Array.isArray(value)) return null
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const requirement = (item as { requirement?: unknown }).requirement
    if (!requirement || typeof requirement !== "object") continue
    const id = String((requirement as { id?: unknown }).id || "")
    const match = id.match(/-ace-(wader|chaser|hunter|legend)-/)
    if (match) return match[1] as CourseChallengeAceStage["key"]
  }
  return null
}

export function aceStageForSubmission(course: CourseChallengeCourse, row: AceSubmissionRecord): CourseChallengeAceStage | null {
  const key = aceStageKeyFromEvaluation(row.requirements_evaluation)
  return course.aceStages?.find((stage) => stage.key === key) || null
}

export function aceProgress(course: CourseChallengeCourse, rows: ReadonlyArray<AceSubmissionRecord>) {
  const recalculated = recalculateAceTrack(course, rows)
  const nextStage = (course.aceStages || []).find((stage) => !recalculated.completedStages.includes(stage.stage)) || null
  return { uniqueHoles: recalculated.uniqueHoles, completedStages: recalculated.completedStages, nextStage }
}
