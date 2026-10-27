import type { RatingSnapshot, IndexSnapshot } from "./snapshots.ts"
import type { ReviewLedgerEntry } from "./reviewLedger.ts"

export type RecalculationPreview = Readonly<{
  calculationRunId: string
  acceptedRoundCount: number
  quarantinedRoundCount: number
  ratingSnapshotCount: number
  indexSnapshotCount: number
  publishableIndexCount: number
  notes: readonly string[]
}>

export type HandicapAdminReviewModel = Readonly<{
  courseCoverage: readonly RatingSnapshot[]
  snapshotHistory: readonly (RatingSnapshot | IndexSnapshot)[]
  reviewQueue: readonly ReviewLedgerEntry[]
  recalculationPreview: RecalculationPreview | null
}>

export function buildHandicapAdminReviewModel(input: {
  courseCoverage: readonly RatingSnapshot[]
  snapshotHistory: readonly (RatingSnapshot | IndexSnapshot)[]
  reviewQueue: readonly ReviewLedgerEntry[]
  recalculationPreview?: RecalculationPreview | null
}): HandicapAdminReviewModel {
  return Object.freeze({
    courseCoverage: Object.freeze([...input.courseCoverage]),
    snapshotHistory: Object.freeze([...input.snapshotHistory]),
    reviewQueue: Object.freeze([...input.reviewQueue]),
    recalculationPreview: input.recalculationPreview ?? null,
  })
}
