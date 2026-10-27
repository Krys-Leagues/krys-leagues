import assert from "node:assert/strict"
import test from "node:test"
import { buildHandicapAdminReviewModel } from "./adminReviewContracts.ts"
import { reviewLatestTen } from "./dateProvenance.ts"
import { appendReviewDecision, createReviewEntry, currentDecision, emptyReviewLedger } from "./reviewLedger.ts"
import { appendRatingSnapshot, createIndexSnapshot, createRatingSnapshot, emptySnapshotLedger } from "./snapshots.ts"

const rating = () => createRatingSnapshot({
  snapshotId: "run-1:TTE:easy",
  calculationRunId: "run-1",
  courseId: "TTE",
  difficulty: "easy",
  courseRating: -22,
  slope: 6,
  sampleSize: 50,
  distinctCanonicalPlayerCount: 20,
  ratingConfidence: "ready",
  modelVersion: "candidate-a-v1",
  effectiveFrom: null,
  effectivePeriod: "KWT-ordered-undated",
  sourceEvidenceRefs: ["phase40:kwt-code-backed"],
})

test("rating snapshots are immutable and duplicate IDs cannot overwrite history", () => {
  const first = rating()
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.sourceEvidenceRefs), true)
  const ledger = appendRatingSnapshot(emptySnapshotLedger(), first)
  assert.throws(() => appendRatingSnapshot(ledger, first), /already exists/)
})

test("non-exact chronology forces index snapshots to remain unpublished", () => {
  const snapshot = createIndexSnapshot({
    snapshotId: "run-1:player-1",
    calculationRunId: "run-1",
    canonicalPlayerId: "00000000-0000-4000-8000-000000000001",
    sourceRoundIds: ["r1"],
    ratingSnapshotIds: ["run-1:TTE:easy"],
    ratingVersionIds: ["rating-v1"],
    differentialModelVersion: "candidate-a-v1",
    latestTenSourceRoundIds: ["r1"],
    bestFiveSourceRoundIds: ["r1"],
    index: 2,
    chronologyConfidence: "PERIOD_WINDOW",
    publicationStatus: "PROVISIONAL",
  })
  assert.equal(snapshot.publicationStatus, "UNPUBLISHED")
})

test("week-window boundary ties are detected instead of arbitrarily selecting latest ten", () => {
  const evidence = [{ sourceId: "old-1", seasonNumber: 1, weekNumber: 1, evidenceKind: "WEEK_WINDOW" as const }]
    .concat(Array.from({ length: 11 }, (_, index) => ({ sourceId: `boundary-${index}`, seasonNumber: 1, weekNumber: 2, evidenceKind: "WEEK_WINDOW" as const })))
  const review = reviewLatestTen(evidence, 10)
  assert.equal(review.confidence, "AMBIGUOUS")
  assert.equal(review.boundarySourceIds.length, 10)
})

test("review decisions preserve evidence and rationale without automatic approval", () => {
  let ledger = emptyReviewLedger()
  ledger = appendReviewDecision(ledger, createReviewEntry({
    decisionId: "decision-1",
    decisionSequence: 1,
    subjectKind: "COURSE_ALIAS",
    subjectKey: "undefined_hard",
    decision: "NEEDS_MORE_INFORMATION",
    evidenceRefs: ["phase36:course-alias-ledger"],
    rationale: "No authoritative course identity is retained.",
    reviewerId: null,
  }))
  assert.equal(currentDecision(ledger, "COURSE_ALIAS", "undefined_hard")?.decision, "NEEDS_MORE_INFORMATION")
  assert.deepEqual(ledger.entries[0].evidenceRefs, ["phase36:course-alias-ledger"])
})

test("admin review contract is read-only data preparation", () => {
  const model = buildHandicapAdminReviewModel({
    courseCoverage: [rating()],
    snapshotHistory: [],
    reviewQueue: [],
    recalculationPreview: {
      calculationRunId: "run-1",
      acceptedRoundCount: 1,
      quarantinedRoundCount: 1,
      ratingSnapshotCount: 1,
      indexSnapshotCount: 0,
      publishableIndexCount: 0,
      notes: ["Chronology is not exact."],
    },
  })
  assert.equal(model.recalculationPreview?.publishableIndexCount, 0)
  assert.equal(Object.isFrozen(model), true)
})
