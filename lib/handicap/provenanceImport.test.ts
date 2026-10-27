import assert from "node:assert/strict"
import test from "node:test"
import { buildTransactionalImportPlan, deterministicProvenanceId, reconcileRatingSnapshotProvenance, type SourceProvenanceRow } from "./provenanceImport.ts"
import { buildRatingSnapshotImportPackage } from "./ratingSnapshotImport.ts"
import { buildRatingSnapshotPackage, type RatingEvidenceRow } from "./ratingSnapshotPackage.ts"

function evidenceRow(index: number, source: "KWT" | "THE_WEEKLY" = "KWT"): RatingEvidenceRow {
  return {
    source,
    sourceFingerprint: source === "KWT" ? `KWT|KWT14W01|${index}|TTE|${index}` : `THE_WEEKLY|S01W01|AMATEUR|Weekly ${index}|TTE|${index}`,
    sourceEvidenceRef: `source-${index}`,
    courseCode: "TTE",
    courseId: "Tourist Trap_easy",
    difficulty: "easy",
    score: -20 + (index % 5),
    sourcePlayerKey: source === "KWT" ? String(index) : `weekly-${index}`,
    canonicalPlayerId: source === "KWT" ? `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` : null,
    originalPlayerName: source === "KWT" ? `KWT ${index}` : `Weekly ${index}`,
  }
}

function provenance(row: RatingEvidenceRow, index: number): SourceProvenanceRow {
  return {
    id: deterministicProvenanceId(row.sourceFingerprint),
    source_fingerprint: row.sourceFingerprint,
    source_type: row.source,
    source_ref: row.sourceEvidenceRef,
    source_date: null,
    source_season: 14,
    source_week: 1,
    original_player_name: row.originalPlayerName,
    canonical_player_id: row.canonicalPlayerId,
    original_course_label: null,
    original_course_code: row.courseCode,
    metadata: { course_id: row.courseId, difficulty: row.difficulty, score: row.score, source_row: index },
  }
}

function packageFor(rows: RatingEvidenceRow[]) {
  return buildRatingSnapshotImportPackage(buildRatingSnapshotPackage(rows, {
    calculationRunId: "phase63-test-run",
    policyVersion: "policy",
    effectivePeriod: "synthetic",
  }))
}

test("exact provenance makes a snapshot import-ready and preserves import order", () => {
  const rows = Array.from({ length: 20 }, (_, index) => evidenceRow(index))
  const pkg = packageFor(rows)
  const result = reconcileRatingSnapshotProvenance(pkg, rows.map(provenance))
  assert.equal(result.exceptions.length, 0)
  assert.equal(result.importReadySnapshots.length, 2)
  assert.equal(result.blockedSnapshots.length, 0)
  const plan = buildTransactionalImportPlan(pkg, result)
  assert.equal(plan.safeToExecute, true)
  assert.deepEqual(plan.order, ["calculation_run", "source_provenance", "rating_snapshots"])
  assert.equal(plan.provenanceRows.length, 20)
})

test("missing provenance blocks only dependent snapshots", () => {
  const rows = Array.from({ length: 20 }, (_, index) => evidenceRow(index))
  const pkg = packageFor(rows)
  const result = reconcileRatingSnapshotProvenance(pkg, rows.slice(0, 19).map(provenance))
  assert.ok(result.exceptions.some((item) => item.reason === "MISSING_PROVENANCE"))
  assert.equal(result.importReadySnapshots.length, 0)
  assert.equal(result.blockedSnapshots.length, 2)
})

test("conflicting fingerprints are quarantined rather than silently deduplicated", () => {
  const rows = Array.from({ length: 20 }, (_, index) => evidenceRow(index))
  const conflict = { ...provenance(rows[0], 0), metadata: { ...provenance(rows[0], 0).metadata, score: 999 } }
  const result = reconcileRatingSnapshotProvenance(packageFor(rows), [...rows.map(provenance), conflict])
  assert.ok(result.exceptions.some((item) => item.reason === "CONFLICTING_PROVENANCE"))
  assert.equal(result.importReadySnapshots.length, 0)
})

test("Weekly provenance remains external and cannot be linked to a Krys player", () => {
  const rows = Array.from({ length: 20 }, (_, index) => evidenceRow(index, "THE_WEEKLY"))
  const linked = { ...provenance(rows[0], 0), canonical_player_id: "00000000-0000-4000-8000-000000000001" }
  const result = reconcileRatingSnapshotProvenance(packageFor(rows), [linked, ...rows.slice(1).map(provenance)])
  assert.ok(result.exceptions.some((item) => item.reason === "WEEKLY_IDENTITY_MERGE"))
  assert.equal(result.importReadySnapshots.length, 0)
})
