import assert from "node:assert/strict"
import test from "node:test"
import { buildPublicationPlan, type PublicationApprovalManifest, type PublicationIndexRow, type PublicationRatingRow } from "./publicationPreparation.ts"

const uuid = (n: number) => `00000000-0000-5000-8000-${String(n).padStart(12, "0")}`
const ref = (n: number) => `KWT|S${Math.floor(n / 10) + 1}|W${(n % 10) + 1}|player-${n}|course-${n}`
const period = "KWT S4W1 through S13W5; observed S4W1; OFFICIAL_KWT_SEQUENCE; calendar date unavailable"

function fixtures() {
  const sourceRunId = uuid(900)
  const ratings: PublicationRatingRow[] = Array.from({ length: 72 }, (_, i) => ({
    id: uuid(i + 1), calculationRunId: sourceRunId, courseId: `course-${i}`, difficulty: i % 2 ? "hard" : "easy",
    courseRating: -20, slope: 8.515, sampleSize: 62, distinctPlayers: 62, ratingConfidence: "ready",
    modelVersion: "krys-course-rating-elite-lowest-12-v1", effectiveFrom: null, effectivePeriod: period,
    sourceEvidenceRefs: [ref(i)], publicationStatus: "UNPUBLISHED", reviewScope: "KWT_ONLY",
    recommendation: i < 4 ? "APPROVE_AFTER_DIAGNOSTIC_REVIEW" : "APPROVE_PENDING_FORMAL_REVIEW",
  }))
  const indexes: PublicationIndexRow[] = Array.from({ length: 157 }, (_, i) => ({
    id: uuid(i + 1000), calculationRunId: sourceRunId, canonicalPlayerId: uuid(i + 2000),
    sourceRoundIds: [ref(i)], ratingSnapshotIds: [uuid((i % 72) + 1)], ratingVersionIds: [uuid((i % 72) + 1)],
    differentialModelVersion: "krys-handicap-candidate-a-v1", latestTenSourceRoundIds: [ref(i)], bestFiveSourceRoundIds: [ref(i), ref(i + 1), ref(i + 2), ref(i + 3), ref(i + 4)],
    resultingIndex: -1.25, chronologyConfidence: "OFFICIAL_KWT_SEQUENCE", publicationStatus: "UNPUBLISHED",
  }))
  const approval: PublicationApprovalManifest = {
    schemaVersion: "phase107-publication-approval-v1", sourceRunId,
    approvalManifestSha256: "a".repeat(64), ratingManifestSha256: "b".repeat(64), diagnosticManifestSha256: "c".repeat(64), indexManifestSha256: "d".repeat(64),
    ratingApprovals: ratings.map((row) => ({ snapshotId: row.id, decision: "APPROVE", approvalRef: `review:${row.id}`, ...(row.recommendation.startsWith("APPROVE_AFTER") ? { diagnosticDisposition: "NO_DEFECT_FOUND" } : {}) })),
    diagnosticApprovals: ratings.filter((row) => row.recommendation.startsWith("APPROVE_AFTER")).map((row) => ({ snapshotId: row.id, decision: "APPROVE" as const, disposition: "NO_DEFECT_FOUND", approvalRef: `diagnostic:${row.id}` })),
    indexApprovals: indexes.map((row) => ({ snapshotId: row.id, decision: "APPROVE", approvalRef: `review:${row.id}` })),
  }
  return { sourceRunId, ratingRows: ratings, indexRows: indexes, approval }
}

test("publication planning requires explicit approval coverage", () => {
  const input = fixtures()
  const plan = buildPublicationPlan(input)
  assert.notEqual(plan.publicationRunId, input.sourceRunId)
  assert.equal(plan.ratingSnapshots.length, 72)
  assert.equal(plan.indexSnapshots.length, 157)
  assert.ok(plan.ratingSnapshots.every((row) => row.publicationStatus === "PUBLISHED"))
  assert.ok(plan.indexSnapshots.every((row) => row.publicationStatus === "PUBLISHED"))
  assert.equal(plan.run.metadata.reference_slope, 8.515)
  assert.equal(plan.run.metadata.allow_official_kwt_sequence_publication, true)
  const sourceRatingIds = new Set(input.ratingRows.map((row) => row.id))
  assert.ok(plan.indexSnapshots.every((row) => row.ratingSnapshotIds.every((id) => !sourceRatingIds.has(id))))
  assert.ok(plan.indexSnapshots.every((row) => row.ratingVersionIds.every((id) => !sourceRatingIds.has(id))))
})

test("reviewed Phase 98 rating aliases are normalized to Phase 104 source ids", () => {
  const input = fixtures()
  const phase98Id = "phase98-rating-id"
  const phase104Id = input.ratingRows[0].id
  const indexRows = input.indexRows.map((row, index) => index === 0
    ? { ...row, ratingSnapshotIds: [phase98Id], ratingVersionIds: [phase98Id] }
    : row)
  const plan = buildPublicationPlan({
    ...input,
    indexRows,
    ratingSnapshotIdAliases: { [phase98Id]: phase104Id },
  })
  assert.ok(plan.indexSnapshots[0].ratingSnapshotIds[0])
  assert.equal(plan.indexSnapshots[0].ratingSnapshotIds.length, 1)
  assert.equal(plan.indexSnapshots[0].ratingSnapshotIds[0], plan.ratingSnapshots[0].id)
  assert.equal(plan.indexSnapshots[0].ratingVersionIds[0], plan.ratingSnapshots[0].id)
})

test("missing rating approval and diagnostic disposition fail closed", () => {
  const input = fixtures()
  assert.throws(() => buildPublicationPlan({ ...input, approval: { ...input.approval, ratingApprovals: input.approval.ratingApprovals.slice(0, -1) } }), /every rating requires explicit approval/)
  const second = fixtures()
  const ratingApprovals = second.approval.ratingApprovals.map((approval, index) => index === 0 ? ({ snapshotId: second.ratingRows[0].id, decision: "APPROVE" as const, approvalRef: "review:missing-diagnostic" }) : approval)
  assert.throws(() => buildPublicationPlan({ ...second, approval: { ...second.approval, ratingApprovals } }), /diagnostic disposition missing/)
  const third = fixtures()
  assert.throws(() => buildPublicationPlan({ ...third, approval: { ...third.approval, diagnosticApprovals: [] } }), /diagnostic approval coverage is incomplete/)
})

test("provisional, Weekly, invalid chronology, and inconsistent rating references fail closed", () => {
  const input = fixtures()
  const ratings = input.ratingRows.map((row, index) => index === 5 ? { ...row, sourceEvidenceRefs: ["THE_WEEKLY|S20W01|Amateur|x|y"] } : row)
  assert.throws(() => buildPublicationPlan({ ...input, ratingRows: ratings }), /non-KWT evidence/)
  const second = fixtures()
  const indexes = second.indexRows.map((row, index) => index === 0 ? { ...row, ratingVersionIds: [] } : row)
  assert.throws(() => buildPublicationPlan({ ...second, indexRows: indexes }), /inconsistent rating references/)
})
