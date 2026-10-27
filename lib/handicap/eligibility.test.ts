import assert from "node:assert/strict"
import test from "node:test"
import {
  isValidKwtFingerprint,
  selectEligiblePersonalProvenance,
  selectPublishedRatingSnapshots,
} from "./eligibility.ts"

const playerId = "11111111-1111-4111-8111-111111111111"

test("malformed Phase 67 KWT fingerprints are never eligible", () => {
  assert.equal(isValidKwtFingerprint("KWT|%||%"), false)
  const result = selectEligiblePersonalProvenance({
    runs: [{ id: "invalid", status: "COMPLETED", quarantined: true }],
    records: [{
      id: "bad",
      sourceFingerprint: "KWT|%||%",
      sourceType: "KWT",
      sourceRef: "bad",
      originalPlayerName: "Player",
      canonicalPlayerId: playerId,
      calculationRunId: "invalid",
    }],
  })
  assert.equal(result.records.length, 0)
  assert.equal(result.issues[0].code, "MALFORMED_KWT_FINGERPRINT")
})

test("corrected KWT records require canonical identity and an active completed run", () => {
  const result = selectEligiblePersonalProvenance({
    runs: [{ id: "corrected", status: "COMPLETED", publicationEligibility: "ELIGIBLE" }],
    records: [{
      id: "good",
      sourceFingerprint: "KWT|KWT10W01|101|LLE|55253",
      sourceType: "KWT",
      sourceRef: "KWT10W01.csv#row=27",
      originalPlayerName: "gopats37",
      canonicalPlayerId: playerId,
      calculationRunId: "corrected",
      personalHandicapEligible: true,
    }],
  })
  assert.equal(result.records.length, 1)
  assert.equal(result.issues.length, 0)
})

test("Weekly evidence and superseded batches stay outside personal history", () => {
  const result = selectEligiblePersonalProvenance({
    runs: [{ id: "old", status: "COMPLETED", supersededByRunId: "new" }],
    records: [
      { id: "weekly", sourceFingerprint: "THE_WEEKLY|event|player|BHE|1", sourceType: "THE_WEEKLY", sourceRef: "weekly", originalPlayerName: "External", personalHandicapEligible: false },
      { id: "old-kwt", sourceFingerprint: "KWT|event|player|BHE|1", sourceType: "KWT", sourceRef: "kwt", originalPlayerName: "Player", canonicalPlayerId: playerId, calculationRunId: "old" },
    ],
  })
  assert.equal(result.records.length, 0)
  assert.deepEqual(result.issues.map((issue) => issue.code), ["EXTERNAL_SOURCE_NOT_PERSONAL", "RUN_SUPERSEDED"])
})

test("unpublished or uneffective ratings cannot feed official differentials", () => {
  const result = selectPublishedRatingSnapshots({
    runs: [{ id: "draft", status: "DRAFT" }, { id: "complete", status: "COMPLETED", publicationEligibility: "ELIGIBLE" }],
    snapshots: [
      { id: "draft-rating", calculationRunId: "draft", courseId: "BHE", difficulty: "easy", courseRating: -20, slope: 8, effectiveFrom: null, publicationStatus: "UNPUBLISHED", sourceEvidenceRefs: ["ref"] },
      { id: "published-rating", calculationRunId: "complete", courseId: "BHE", difficulty: "easy", courseRating: -20, slope: 8, effectiveFrom: "2026-10-20", publicationStatus: "PUBLISHED", sourceEvidenceRefs: ["ref"] },
    ],
  })
  assert.deepEqual(result.snapshots.map((snapshot) => snapshot.id), ["published-rating"])
  assert.deepEqual(result.issues.map((issue) => issue.code), ["RUN_NOT_ACTIVE"])
})
