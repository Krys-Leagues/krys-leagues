export type CourseDistribution = {
  courseRating: number
  slopeRating: number
  fieldAverage: number
  fieldStandardDeviation: number
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function currentDifferentialResearch(score: number, distribution: CourseDistribution): number {
  return score - distribution.courseRating
}

/**
 * Candidate only. The reference slope must come from the observed catalog;
 * no conventional golf constant is supplied here.
 */
export function slopeNormalizedDifferential(
  score: number,
  distribution: CourseDistribution,
  observedReferenceSlope: number,
): number | null {
  if (distribution.slopeRating <= 0 || observedReferenceSlope <= 0) return null
  return (score - distribution.courseRating) * (observedReferenceSlope / distribution.slopeRating)
}

/** Candidate only: a distribution-relative standard score. */
export function distributionStandardScore(
  score: number,
  distribution: CourseDistribution,
): number | null {
  if (distribution.fieldStandardDeviation <= 0) return null
  return (score - distribution.fieldAverage) / distribution.fieldStandardDeviation
}
