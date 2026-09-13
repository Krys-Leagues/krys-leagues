import type { CourseChallengeAceStage, CourseChallengeCourse } from "./types"

export type AceSubmissionRecord = {
  difficulty?: unknown
  hole_scores?: unknown
  requirements_evaluation?: unknown
  status?: unknown
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
  const approved = rows.filter((row) => row.status === undefined || row.status === "approved")
  const uniqueHoles = uniqueAceHoleNumbers(approved)
  const completedStages = (course.aceStages || []).filter((stage) => {
    const stageRows = approved.filter((row) => aceStageForSubmission(course, row)?.stage === stage.stage)
    const easy = stageRows.some((row) => row.difficulty === "Easy")
    const hard = stageRows.some((row) => row.difficulty === "Hard")
    return easy && (!stage.requiresHard || hard)
  }).map((stage) => stage.stage)
  const nextStage = (course.aceStages || []).find((stage) => !completedStages.includes(stage.stage)) || null
  return { uniqueHoles, completedStages, nextStage }
}
