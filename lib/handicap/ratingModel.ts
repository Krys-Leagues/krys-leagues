export type CurrentRatingPolicy = {
  eliteShare: number
  minimumReadySample: number
  minimumProvisionalSample: number
}

export type RatingConfidence = {
  sampleSize: number
  standardDeviation: number | null
  standardError: number | null
  approximate95PercentHalfWidth: number | null
}

export type CurrentRatingSummary = {
  fieldAverage: number | null
  eliteAverage: number | null
  courseRating: number | null
  slopeRating: number | null
  eliteCount: number
  ratingStatus: "ready" | "provisional" | "needs_data"
  eliteTiePolicy: "exact-count-lowest-scores"
  confidence: RatingConfidence
}

export const DEFAULT_CURRENT_RATING_POLICY: CurrentRatingPolicy = {
  eliteShare: 0.12,
  minimumReadySample: 50,
  minimumProvisionalSample: 20,
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function standardDeviation(values: readonly number[], mean: number | null): number | null {
  if (mean === null || values.length < 2) return null
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function summarizeCurrentRating(
  scores: readonly number[],
  policy: CurrentRatingPolicy = DEFAULT_CURRENT_RATING_POLICY,
): CurrentRatingSummary {
  const validScores = scores.filter(Number.isFinite).slice().sort((a, b) => a - b)
  const fieldAverage = average(validScores)
  const eliteCount = validScores.length ? Math.max(1, Math.ceil(validScores.length * policy.eliteShare)) : 0
  const eliteAverage = average(validScores.slice(0, eliteCount))
  const ratingStatus =
    validScores.length >= policy.minimumReadySample
      ? "ready"
      : validScores.length >= policy.minimumProvisionalSample
        ? "provisional"
        : "needs_data"
  const deviation = standardDeviation(validScores, fieldAverage)
  const standardError = deviation === null ? null : deviation / Math.sqrt(validScores.length)
  return {
    fieldAverage,
    eliteAverage,
    courseRating: validScores.length >= policy.minimumProvisionalSample ? eliteAverage : null,
    slopeRating:
      validScores.length >= policy.minimumProvisionalSample && fieldAverage !== null && eliteAverage !== null
        ? fieldAverage - eliteAverage
        : null,
    eliteCount,
    ratingStatus,
    eliteTiePolicy: "exact-count-lowest-scores",
    confidence: {
      sampleSize: validScores.length,
      standardDeviation: deviation,
      standardError,
      approximate95PercentHalfWidth: standardError === null ? null : 1.96 * standardError,
    },
  }
}

export type SlopeModelInput = {
  baseDifferential: number
  score: number
  courseRating: number
  slopeRating: number | null
}

export type SlopeModel = {
  id: string
  version: string
  adjust: (input: SlopeModelInput) => number
}

export function currentDifferential(score: number, courseRating: number): number {
  return Math.round((score - courseRating) * 100) / 100
}

export function candidateDifferential(
  score: number,
  courseRating: number,
  slopeRating: number | null,
  model: SlopeModel,
): number {
  const baseDifferential = currentDifferential(score, courseRating)
  return Math.round(model.adjust({ baseDifferential, score, courseRating, slopeRating }) * 100) / 100
}
