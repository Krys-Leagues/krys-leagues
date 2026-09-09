import type { CourseChallengeEvaluation, CourseChallengeMetrics, CourseChallengeRequirement, RequirementEvaluation } from "./types"

export function validHoleScores(scores: number[]): scores is number[] { return scores.length === 18 && scores.every((score) => Number.isInteger(score) && score > 0) }
export function validHolePars(pars: number[]): pars is number[] { return pars.length === 18 && pars.every((par) => Number.isInteger(par) && par > 0) }

export function calculateCourseChallengeMetrics(scores: number[], pars: number[]): CourseChallengeMetrics {
  if (!validHoleScores(scores)) throw new Error("A complete 18-hole scorecard is required.")
  if (!validHolePars(pars)) throw new Error("The authoritative 18-hole pars are unavailable.")
  const differences = scores.map((score, index) => score - pars[index])
  const totalStrokes = scores.reduce((sum, score) => sum + score, 0)
  const totalPar = pars.reduce((sum, par) => sum + par, 0)
  return {
    totalStrokes,
    totalPar,
    relativeToPar: totalStrokes - totalPar,
    holeInOnes: scores.filter((score) => score === 1).length,
    bogeys: differences.filter((difference) => difference === 1).length,
    parsOrBetter: differences.filter((difference) => difference <= 0).length,
    birdies: differences.filter((difference) => difference === -1).length,
    eagles: differences.filter((difference) => difference <= -2).length,
    // Confirmed Course Challenges rule: a stroke-out is score >= authoritative par + 4.
    strokeOuts: differences.filter((difference) => difference >= 4).length,
    lastHoleScore: scores[17],
    lastThreeRelativeToPar: differences.slice(-3).reduce((sum, difference) => sum + difference, 0),
  }
}

function compare(actual: number, operator: CourseChallengeRequirement["operator"], target: number) { if (operator === "gte") return actual >= target; if (operator === "lte") return actual <= target; return actual === target }
function requirementValue(requirement: CourseChallengeRequirement, metrics: CourseChallengeMetrics, scores: number[], pars: number[]) {
  switch (requirement.kind) {
    case "complete_course": return 1
    case "relative_to_par": return metrics.relativeToPar
    case "hole_score": return requirement.hole ? scores[requirement.hole - 1] : null
    case "hole_relative_to_par": return requirement.hole ? scores[requirement.hole - 1] - pars[requirement.hole - 1] : null
    case "last_hole_score": return metrics.lastHoleScore
    case "last_three_relative_to_par": return metrics.lastThreeRelativeToPar
    case "hio_count": return metrics.holeInOnes
    case "bogey_count": return metrics.bogeys
    case "stroke_out_count": return metrics.strokeOuts
    case "par_or_better_count": return metrics.parsOrBetter
    case "birdie_count": return metrics.birdies
    case "eagle_count": return metrics.eagles
    default: return null
  }
}

export function evaluateCourseChallengeRequirements(scores: number[], pars: number[], requirements: CourseChallengeRequirement[], requirementsStatus: "ready" | "pending_review"): CourseChallengeEvaluation {
  const metrics = calculateCourseChallengeMetrics(scores, pars)
  if (requirementsStatus !== "ready") return { metrics, requirements: [{ requirement: { id: "requirements-pending", label: "Approved challenge requirements are pending review.", kind: "relative_to_par", reviewRequired: true }, passed: null, status: "needs_review", reason: "The finalized Course Challenge requirement data is not present in source yet." }], status: "needs_review", reason: "Challenge requirements require Krys review before automatic approval." }
  const evaluations: RequirementEvaluation[] = requirements.map((requirement) => {
    if (requirement.reviewRequired || requirement.target === undefined) return { requirement, passed: null, status: "needs_review", reason: requirement.reviewRequired ? "This requirement needs photo/admin review." : "This requirement has no target." }
    const value = requirementValue(requirement, metrics, scores, pars)
    if (value === null || value === undefined) return { requirement, passed: null, status: "needs_review", reason: "This requirement cannot be verified from typed scores alone." }
    const passed = compare(value, requirement.operator ?? "eq", requirement.target)
    return { requirement, passed, status: passed ? "passed" : "failed" }
  })
  if (evaluations.some((evaluation) => evaluation.status === "needs_review")) return { metrics, requirements: evaluations, status: "needs_review", reason: "At least one requirement needs photo/admin review." }
  return { metrics, requirements: evaluations, status: evaluations.every((evaluation) => evaluation.passed === true) ? "auto_pass" : "auto_fail" }
}

export function comparePhotoTotal(metrics: CourseChallengeMetrics, photoTotal: number | null, photoTotalReadable: boolean) { if (!photoTotalReadable || photoTotal === null || !Number.isInteger(photoTotal)) return "needs_review" as const; return photoTotal === metrics.totalStrokes ? "passed" as const : "needs_review" as const }
export function levelIsComplete(easyStatus: string | null | undefined, hardStatus: string | null | undefined) { return easyStatus === "approved" && hardStatus === "approved" }
export function nextUnlockedLevel(completedLevels: number[]) { const completed = new Set(completedLevels.filter((level) => level >= 1 && level <= 5)); let next = 1; while (completed.has(next) && next < 5) next += 1; return next }