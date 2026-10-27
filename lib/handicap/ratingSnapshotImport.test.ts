import assert from "node:assert/strict"
import test from "node:test"
import { buildRatingSnapshotImportPackage, deterministicCalculationRunId, uuidFromText } from "./ratingSnapshotImport.ts"
import { buildRatingSnapshotPackage, type RatingEvidenceRow } from "./ratingSnapshotPackage.ts"

const PLAYER_PREFIX = "00000000-0000-4000-8000-0000000000"

function row(index: number, score = -20): RatingEvidenceRow {
  return {
    source: "KWT",
    sourceFingerprint: `KWT|S${index}|${index}|TTE|${index}`,
    sourceEvidenceRef: `source-${index}`,
    courseCode: "TTE",
    courseId: "Tourist Trap_easy",
    difficulty: "easy",
    score,
    sourcePlayerKey: String(index),
    canonicalPlayerId: `${PLAYER_PREFIX}${String((index % 20) + 1).padStart(2, "0")}`,
    originalPlayerName: `Player ${index}`,
  }
}

test("import package produces stable UUIDs and schema-compatible confidence values", () => {
  const evidence = Array.from({ length: 50 }, (_, index) => row(index, -30 + (index % 10)))
  const calculation = buildRatingSnapshotPackage(evidence, {
    calculationRunId: "phase61-run",
    policyVersion: "krys-handicap-approved-policy-v1",
    effectivePeriod: "verified local period",
  })
  const first = buildRatingSnapshotImportPackage(calculation)
  const second = buildRatingSnapshotImportPackage(calculation)
  assert.deepEqual(first, second)
  assert.match(first.calculationRun.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(first.importEligibleDraftCount, 2)
  assert.equal(first.statisticallyEligibleCount, 2)
  assert.equal(first.publicationEligibleCount, 0)
  const kwtSnapshot = first.ratingSnapshots.find((snapshot) => snapshot.review_scope === "KWT_ONLY")!
  assert.equal(kwtSnapshot.rating_confidence, "ready")
  assert.equal(kwtSnapshot.effective_from, null)
  assert.equal(kwtSnapshot.publication_status, "UNPUBLISHED")
  assert.equal(kwtSnapshot.calculation_run_id, deterministicCalculationRunId(calculation))
  assert.equal(kwtSnapshot.id, uuidFromText(`rating-snapshot:${first.calculationRun.id}:KWT_ONLY:Tourist Trap_easy:easy:krys-course-rating-elite-lowest-12-v1`))
})

test("provisional ratings are importable drafts but never publication eligible", () => {
  const evidence = Array.from({ length: 20 }, (_, index) => row(index, -15 + (index % 5)))
  const calculation = buildRatingSnapshotPackage(evidence, {
    calculationRunId: "phase61-provisional",
    policyVersion: "policy",
    effectivePeriod: "verified local period",
  })
  const result = buildRatingSnapshotImportPackage(calculation)
  assert.equal(result.importEligibleDraftCount, 2)
  assert.equal(result.provisionalDraftCount, 2)
  assert.equal(result.statisticallyEligibleCount, 0)
  assert.ok(result.ratingSnapshots.every((snapshot) => snapshot.import_eligible === true))
  assert.ok(result.ratingSnapshots.every((snapshot) => snapshot.publication_eligible === false))
  assert.ok(result.ratingSnapshots.every((snapshot) => snapshot.publication_blockers.includes("PROVISIONAL_SAMPLE_SIZE")))
})

test("Weekly evidence remains course-only in the import package", () => {
  const evidence = Array.from({ length: 20 }, (_, index) => ({
    ...row(index, -18 + (index % 3)),
    source: "THE_WEEKLY" as const,
    canonicalPlayerId: null,
    sourcePlayerKey: `weekly-${index}`,
    sourceFingerprint: `WEEKLY|S01W01|AMATEUR|${index}|TTE`,
  }))
  const calculation = buildRatingSnapshotPackage(evidence, {
    calculationRunId: "phase61-weekly",
    policyVersion: "policy",
    effectivePeriod: "Weekly evidence",
  })
  const result = buildRatingSnapshotImportPackage(calculation)
  assert.equal(result.importEligibleDraftCount, 2)
  const weeklySnapshot = result.ratingSnapshots.find((snapshot) => snapshot.review_scope === "WEEKLY_ONLY")!
  assert.equal(weeklySnapshot.source_contribution.THE_WEEKLY, 20)
  assert.equal(weeklySnapshot.source_contribution.KWT, 0)
  assert.equal(weeklySnapshot.review_scope, "WEEKLY_ONLY")
  assert.equal("canonical_player_id" in weeklySnapshot, false)
})
