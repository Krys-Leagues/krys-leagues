import assert from "node:assert/strict"
import test from "node:test"
import { buildRatingSnapshotPackage, type RatingEvidenceRow } from "./ratingSnapshotPackage.ts"

const PLAYER_A = "00000000-0000-4000-8000-000000000001"
const PLAYER_B = "00000000-0000-4000-8000-000000000002"

function row(overrides: Partial<RatingEvidenceRow> = {}): RatingEvidenceRow {
  return {
    source: "KWT",
    sourceFingerprint: "KWT|KWT14W01|1|TTE|1",
    sourceEvidenceRef: "normalized/KWT14W01.csv#row=1",
    courseCode: "TTE",
    courseId: "Tourist Trap_easy",
    difficulty: "easy",
    score: -20,
    sourcePlayerKey: "1",
    canonicalPlayerId: PLAYER_A,
    originalPlayerName: "Player A",
    ...overrides,
  }
}

test("rating package keeps snapshots unpublished and preserves Candidate A metadata", () => {
  const result = buildRatingSnapshotPackage([
    row(),
    row({ sourceFingerprint: "KWT|KWT14W02|2|TTE|2", sourcePlayerKey: "2", canonicalPlayerId: PLAYER_B, score: -18 }),
  ], { calculationRunId: "phase60-run", policyVersion: "krys-handicap-approved-policy-v1", effectivePeriod: "KWT seasons 4-14" })
  assert.equal(result.snapshots.length, 2)
  assert.ok(result.snapshots.every((snapshot) => snapshot.publicationStatus === "UNPUBLISHED" && snapshot.publicationEligible === false))
  assert.ok(result.snapshots.every((snapshot) => snapshot.referenceSlope === 8.515))
  assert.ok(result.snapshots.every((snapshot) => snapshot.effectiveFrom === null))
  assert.ok(result.snapshots.every((snapshot) => snapshot.importEligible === false))
  assert.ok(result.snapshots.every((snapshot) => snapshot.publicationBlockers.includes("MISSING_APPROVED_EFFECTIVE_DATE")))
})

test("exact duplicate fingerprints count once and conflicting fingerprints quarantine", () => {
  const result = buildRatingSnapshotPackage([
    row({ sourceEvidenceRef: "duplicate-source-ref" }),
    row(),
    row({ sourceFingerprint: "conflict", score: -19 }),
    row({ sourceFingerprint: "conflict", score: -17, sourceEvidenceRef: "conflict-source-ref" }),
  ], { calculationRunId: "phase60-run", policyVersion: "policy", effectivePeriod: "KWT seasons 4-14" })
  assert.equal(result.accepted.length, 1)
  assert.equal(result.exceptions.filter((item) => item.reason === "DUPLICATE_FINGERPRINT").length, 1)
  assert.equal(result.exceptions.filter((item) => item.reason === "CONFLICTING_FINGERPRINT").length, 2)
})

test("unresolved KWT identities are excluded while Weekly remains course-only", () => {
  const result = buildRatingSnapshotPackage([
    row({ canonicalPlayerId: null }),
    row({ source: "THE_WEEKLY", canonicalPlayerId: null, sourcePlayerKey: "weekly-player", sourceFingerprint: "weekly|event|player|TTE|1" }),
  ], { calculationRunId: "phase60-run", policyVersion: "policy", effectivePeriod: "KWT seasons 4-14 + Weekly Phase 54" })
  assert.equal(result.accepted.length, 1)
  assert.equal(result.accepted[0].source, "THE_WEEKLY")
  assert.equal(result.exceptions[0].reason, "UNRESOLVED_CANONICAL_ID")
  assert.ok(result.snapshots.every((snapshot) => snapshot.scope !== "KWT_ONLY"))
})

test("near-zero slope fails closed in the snapshot package", () => {
  const rows = Array.from({ length: 20 }, (_, index) => row({
    sourceFingerprint: `flat-${index}`,
    sourcePlayerKey: String(index),
    canonicalPlayerId: index % 2 ? PLAYER_A : PLAYER_B,
    score: -20,
  }))
  const result = buildRatingSnapshotPackage(rows, { calculationRunId: "phase60-run", policyVersion: "policy", effectivePeriod: "KWT seasons 4-14" })
  assert.ok(result.snapshots.every((snapshot) => snapshot.slope === null && snapshot.courseRating === null && snapshot.ratingConfidence === "NEEDS_REVIEW"))
})

test("blank or non-numeric scores are quarantined instead of becoming zero", () => {
  const result = buildRatingSnapshotPackage([row({ score: Number.NaN })], { calculationRunId: "phase60-run", policyVersion: "policy", effectivePeriod: "KWT seasons 4-14" })
  assert.equal(result.accepted.length, 0)
  assert.equal(result.exceptions[0].reason, "INVALID_SCORE")
})
