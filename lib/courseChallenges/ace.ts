import type { CourseChallengeAceStage, CourseChallengeCourse } from "./types"

export type AceSubmissionRecord = {
  id?: unknown; player_id?: unknown; course_slug?: unknown; challenge_key?: unknown; level_number?: unknown; ace_stage_number?: unknown; created_at?: unknown; difficulty?: unknown; hole_scores?: unknown; requirements_evaluation?: unknown; status?: unknown
}
export type AceEvidenceCard = { id: string | null; challengeKey: "level" | "ace"; level: number | null; difficulty: string | null; createdAt: string | null; holeInOnes: number }
export type AceSkippedCard = { id: string | null; challengeKey: "level" | "ace"; level: number | null; difficulty: string | null; reason: "not_verified" | "missing_hole_scores" }

export function aceHoleNumbers(scores: unknown): number[] { if (!Array.isArray(scores)) return []; return scores.flatMap((score, index) => Number(score) === 1 ? [index + 1] : []) }
export function aceCount(scores: unknown): number { return aceHoleNumbers(scores).length }

export function aceCrossCreditRows(rows: ReadonlyArray<AceSubmissionRecord>, crossCreditedSubmissionIds: ReadonlySet<string>, currentSubmissionId: string, aceStageNumber: number): AceSubmissionRecord[] {
  return rows.filter((row) => {
    if (row.challenge_key === "ace") return true
    if (row.challenge_key !== "level" || Number(row.ace_stage_number) !== aceStageNumber) return false
    const id = row.id === undefined || row.id === null ? "" : String(row.id)
    return id === currentSubmissionId || crossCreditedSubmissionIds.has(id)
  })
}

function isCompleteScorecard(value: unknown): value is number[] { return Array.isArray(value) && value.length === 18 && value.every((score) => Number.isInteger(score) && score > 0) }
function cardSummary(row: AceSubmissionRecord) { return { id: row.id == null ? null : String(row.id), challengeKey: row.challenge_key === "ace" ? "ace" as const : "level" as const, level: row.level_number == null ? null : Number(row.level_number), difficulty: row.difficulty == null ? null : String(row.difficulty), createdAt: row.created_at == null ? null : String(row.created_at) } }
function stageRequirement(stage: CourseChallengeAceStage, difficulty: string): number | null { const requirements = difficulty === "Easy" ? stage.easyRequirements : stage.hardRequirements; return requirements[0]?.kind === "hio_count" && Number.isFinite(Number(requirements[0].target)) ? Number(requirements[0].target) : null }
function stageSatisfied(stage: CourseChallengeAceStage, rows: ReadonlyArray<AceSubmissionRecord>): boolean {
  const easyTarget = stageRequirement(stage, "Easy")
  const hardTarget = stageRequirement(stage, "Hard")
  const stageRows = rows.filter((row) => Number(row.ace_stage_number) === stage.stage)
  return easyTarget !== null && stageRows.some((row) => row.difficulty === "Easy" && aceCount(row.hole_scores) >= easyTarget) && (hardTarget === null || stageRows.some((row) => row.difficulty === "Hard" && aceCount(row.hole_scores) >= hardTarget))
}

export function sequentialCompletedStages(course: CourseChallengeCourse, completedStageNumbers: ReadonlyArray<number>): number[] { const completed = new Set(completedStageNumbers.map(Number)); const result: number[] = []; for (const stage of course.aceStages || []) { if (!completed.has(stage.stage)) break; result.push(stage.stage) } return result }
export function nextSequentialAceStage(course: CourseChallengeCourse, completedStageNumbers: ReadonlyArray<number>): CourseChallengeAceStage | null { const completed = new Set(sequentialCompletedStages(course, completedStageNumbers)); return (course.aceStages || []).find((stage) => !completed.has(stage.stage)) || null }

export function recalculateAceTrack(course: CourseChallengeCourse, rows: ReadonlyArray<AceSubmissionRecord>, storedCompletedStages: number[] = []) {
  const evidenceCards: AceEvidenceCard[] = [], skippedCards: AceSkippedCard[] = []
  for (const row of rows) {
    const summary = cardSummary(row)
    if (row.status !== undefined && row.status !== "approved") { skippedCards.push({ ...summary, reason: "not_verified" }); continue }
    if (!isCompleteScorecard(row.hole_scores)) { skippedCards.push({ ...summary, reason: "missing_hole_scores" }); continue }
    evidenceCards.push({ ...summary, holeInOnes: aceCount(row.hole_scores) })
  }
  const completedStages = [...sequentialCompletedStages(course, storedCompletedStages)]
  const verifiedRows = rows.filter((row) => row.status === undefined || row.status === "approved")
  for (const stage of course.aceStages || []) { if (completedStages.includes(stage.stage)) continue; if (!stageSatisfied(stage, verifiedRows)) break; completedStages.push(stage.stage) }
  return { completedStages, newlyEarnedStages: completedStages.filter((stage) => !storedCompletedStages.includes(stage)), evidenceCards, skippedCards }
}

export function aceStageForSubmission(course: CourseChallengeCourse, row: AceSubmissionRecord): CourseChallengeAceStage | null { const ids = Array.isArray(row.requirements_evaluation) ? row.requirements_evaluation.map((item) => String((item as { requirement?: { id?: unknown } }).requirement?.id || "")).join(" ") : ""; const match = ids.match(/-ace-(wader|chaser|hunter|legend)-/); return course.aceStages?.find((stage) => stage.key === match?.[1]) || null }
export function aceProgress(course: CourseChallengeCourse, rows: ReadonlyArray<AceSubmissionRecord>, storedCompletedStages: number[] = []) { const recalculated = recalculateAceTrack(course, rows, storedCompletedStages); return { completedStages: recalculated.completedStages, nextStage: nextSequentialAceStage(course, recalculated.completedStages), evidenceCards: recalculated.evidenceCards, skippedCards: recalculated.skippedCards } }
