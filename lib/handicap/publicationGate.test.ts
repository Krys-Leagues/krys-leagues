import assert from "node:assert/strict"
import test from "node:test"
import {
  isPublicationEligibleRun,
  selectPublicationEligibleIndexes,
  selectPublicationEligibleRatings,
} from "./publicationGate.ts"

const playerId = "11111111-1111-4111-8111-111111111111"

const kwt = {
  sourceFingerprint: "KWT|KWT14W01|101|BHE|55555",
  sourceType: "KWT" as const,
  originalPlayerName: "Player",
  canonicalPlayerId: playerId,
  metadata: { source_player_id: "101" },
}

test("missing or quarantined run eligibility fails closed", () => {
  assert.equal(isPublicationEligibleRun({ id: "missing", status: "COMPLETED" }), false)
  assert.equal(isPublicationEligibleRun({ id: "bad", status: "COMPLETED", publicationEligibility: "QUARANTINED" }), false)
  assert.equal(isPublicationEligibleRun({ id: "good", status: "COMPLETED", publicationEligibility: "ELIGIBLE" }), true)
})

test("unpublished rating and invalid provenance cannot be selected", () => {
  const result = selectPublicationEligibleRatings({
    runs: [{ id: "run", status: "COMPLETED", publicationEligibility: "ELIGIBLE" }],
    provenance: [{ ...kwt, sourceFingerprint: "KWT|%||%" }],
    ratings: [{
      id: "draft",
      calculationRunId: "run",
      publicationStatus: "UNPUBLISHED",
      effectiveFrom: null,
      slope: 8.515,
      sourceEvidenceRefs: [kwt.sourceFingerprint],
    }],
  })
  assert.deepEqual(result.ratings, [])
  assert.equal(result.issues[0].code, "RATING_NOT_PUBLISHED")
})

test("published rating requires verified KWT or course-only Weekly provenance", () => {
  const result = selectPublicationEligibleRatings({
    runs: [{ id: "run", status: "COMPLETED", publicationEligibility: "ELIGIBLE" }],
    provenance: [
      kwt,
      {
        sourceFingerprint: "THE_WEEKLY|S21W05_GLE_HWH|AMATEUR|External|GLE|1",
        sourceType: "THE_WEEKLY",
        originalPlayerName: "External",
        metadata: { personal_handicap_eligible: false },
      },
    ],
    ratings: [
      { id: "kwt", calculationRunId: "run", publicationStatus: "PUBLISHED", effectiveFrom: "2026-10-20", slope: 8.5, sourceEvidenceRefs: [kwt.sourceFingerprint] },
      { id: "weekly", calculationRunId: "run", publicationStatus: "PUBLISHED", effectiveFrom: "2026-10-20", slope: 8.5, sourceEvidenceRefs: ["THE_WEEKLY|S21W05_GLE_HWH|AMATEUR|External|GLE|1"] },
      { id: "missing", calculationRunId: "run", publicationStatus: "PUBLISHED", effectiveFrom: "2026-10-20", slope: 8.5, sourceEvidenceRefs: ["missing"] },
    ],
  })
  assert.deepEqual(result.ratings.map((rating) => rating.id), ["kwt", "weekly"])
  assert.equal(result.issues[0].code, "MISSING_PROVENANCE")
})

test("personal-source contract rejects Weekly and malformed KWT evidence", () => {
  const result = selectPublicationEligibleRatings({
    runs: [{ id: "run", status: "COMPLETED", publicationEligibility: "ELIGIBLE" }],
    provenance: [
      { ...kwt, sourceFingerprint: "KWT|%||%" },
      { sourceFingerprint: "THE_WEEKLY|event|External|BHE|1", sourceType: "THE_WEEKLY", metadata: { personal_handicap_eligible: true } },
    ],
    ratings: [
      { id: "bad-kwt", calculationRunId: "run", publicationStatus: "PUBLISHED", effectiveFrom: "2026-10-20", slope: 8.5, sourceEvidenceRefs: ["KWT|%||%"] },
      { id: "bad-weekly", calculationRunId: "run", publicationStatus: "PUBLISHED", effectiveFrom: "2026-10-20", slope: 8.5, sourceEvidenceRefs: ["THE_WEEKLY|event|External|BHE|1"] },
    ],
  })
  assert.equal(result.ratings.length, 0)
  assert.deepEqual(result.issues.map((issue) => issue.code), ["INVALID_KWT_PROVENANCE", "WEEKLY_PERSONAL_SOURCE"])
})

test("provisional rolling-20 candidates remain blocked from publication", () => {
  const result = selectPublicationEligibleIndexes({
    runs: [{
      id: "run",
      status: "COMPLETED",
      publicationEligibility: "ELIGIBLE",
      chronologyPolicy: "OFFICIAL_KWT_SEQUENCE",
      metadata: { allow_official_kwt_sequence_publication: true },
    }],
    provenance: [{ ...kwt }],
    indexes: [{
      id: "provisional",
      calculationRunId: "run",
      publicationStatus: "PUBLISHED",
      chronologyConfidence: "OFFICIAL_KWT_SEQUENCE",
      resultingIndex: 12.34,
      latestTenSourceRoundIds: [],
      bestFiveSourceRoundIds: [],
      activeRoundSourceIds: [kwt.sourceFingerprint],
      handicapStatus: "PROVISIONAL",
      sourceRoundIds: [kwt.sourceFingerprint],
    }],
  })
  assert.deepEqual(result.indexes, [])
  assert.deepEqual(result.issues.map((issue) => issue.code), ["INDEX_NOT_OFFICIAL_ELIGIBLE"])
})
