import assert from "node:assert/strict"
import test from "node:test"
import { buildPersonalIndexCandidates, type PersonalIndexRoundInput } from "./personalIndex.ts"
import { selectPublicationEligibleIndexes } from "./publicationGate.ts"

const PLAYER = "11111111-1111-4111-8111-111111111111"

function pairRound(index: number): PersonalIndexRoundInput {
  const week = index + 1
  return {
    sourceKey: `KWT|S14W${String(week).padStart(2, "0")}|player|BHE|${index}`,
    playerId: PLAYER,
    score: -25 - index,
    courseKey: "BHE",
    ratingVersionId: "rating-version-bhe-v1",
    ratingSnapshotId: "rating-snapshot-bhe-v1",
    courseRating: -30,
    slopeRating: 4,
    sourceType: "KWT",
    chronology: {
      sourceId: `round-${index}`,
      seasonNumber: 14,
      weekNumber: week,
      difficulty: index % 2 === 0 ? "EASY" : "HARD",
      evidenceKind: "OFFICIAL_KWT_SEQUENCE",
      evidenceRef: `kwt-event-${week}`,
    },
  }
}

function provenance(sourceRoundIds: readonly string[]) {
  return sourceRoundIds.map((sourceFingerprint) => ({
    sourceFingerprint,
    sourceType: "KWT" as const,
    originalPlayerName: "Synthetic Player",
    canonicalPlayerId: PLAYER,
    metadata: { source_player_id: sourceFingerprint },
  }))
}

test("official KWT sequence requires explicit opt-in and keeps snapshot drafts unpublished", () => {
  const rounds = Array.from({ length: 20 }, (_, index) => pairRound(index))
  const exactOnly = buildPersonalIndexCandidates(rounds, { calculationRunId: "run-exact-only" })
  assert.equal(exactOnly.indexes[0]?.chronologyConfidence, "OFFICIAL_KWT_SEQUENCE")
  assert.equal(exactOnly.indexes[0]?.publicationStatus, "UNPUBLISHED_CHRONOLOGY")
  assert.equal(exactOnly.snapshotCandidates[0]?.publicationStatus, "UNPUBLISHED")

  const optedIn = buildPersonalIndexCandidates(rounds, {
    calculationRunId: "run-official-sequence",
    chronologyPublicationPolicy: "EXACT_OR_OFFICIAL_KWT_SEQUENCE",
  })
  assert.equal(optedIn.indexes[0]?.publicationStatus, "PUBLISHED")
  assert.equal(optedIn.snapshotCandidates[0]?.publicationStatus, "UNPUBLISHED")
  assert.equal(optedIn.indexes[0]?.index, exactOnly.indexes[0]?.index)
})

test("publication gate rejects official sequence without run opt-in", () => {
  const index = {
    id: "index-1",
    calculationRunId: "run-1",
    publicationStatus: "PUBLISHED" as const,
    chronologyConfidence: "OFFICIAL_KWT_SEQUENCE" as const,
    resultingIndex: 1.25,
    latestTenSourceRoundIds: ["KWT|event|player|BHE|1"],
    bestFiveSourceRoundIds: ["KWT|event|player|BHE|1"],
    sourceRoundIds: ["KWT|event|player|BHE|1"],
  }
  const baseRun = { id: "run-1", status: "COMPLETED" as const, publicationEligibility: "ELIGIBLE" as const }
  const provenanceRows = provenance(index.sourceRoundIds)
  const blocked = selectPublicationEligibleIndexes({ indexes: [index], runs: [baseRun], provenance: provenanceRows })
  assert.deepEqual(blocked.indexes, [])
  assert.equal(blocked.issues[0]?.code, "INDEX_NOT_ELIGIBLE_CHRONOLOGY")

  const allowed = selectPublicationEligibleIndexes({
    indexes: [index],
    runs: [{
      ...baseRun,
      chronologyPolicy: "OFFICIAL_KWT_SEQUENCE",
      metadata: { allow_official_kwt_sequence_publication: true },
    }],
    provenance: provenanceRows,
  })
  assert.deepEqual(allowed.indexes.map((item) => item.id), ["index-1"])
  assert.deepEqual(allowed.issues, [])
})

test("publication gate rejects Weekly evidence for personal indexes", () => {
  const index = {
    id: "index-weekly",
    calculationRunId: "run-weekly",
    publicationStatus: "PUBLISHED" as const,
    chronologyConfidence: "OFFICIAL_KWT_SEQUENCE" as const,
    resultingIndex: 1.25,
    latestTenSourceRoundIds: ["THE_WEEKLY|event|External|BHE|1"],
    bestFiveSourceRoundIds: ["THE_WEEKLY|event|External|BHE|1"],
    sourceRoundIds: ["THE_WEEKLY|event|External|BHE|1"],
  }
  const result = selectPublicationEligibleIndexes({
    indexes: [index],
    runs: [{
      id: "run-weekly",
      status: "COMPLETED",
      publicationEligibility: "ELIGIBLE",
      chronologyPolicy: "OFFICIAL_KWT_SEQUENCE",
      metadata: { allow_official_kwt_sequence_publication: true },
    }],
    provenance: [{
      sourceFingerprint: index.sourceRoundIds[0],
      sourceType: "THE_WEEKLY",
      metadata: { personal_handicap_eligible: false },
    }],
  })
  assert.deepEqual(result.indexes, [])
  assert.equal(result.issues[0]?.code, "WEEKLY_PERSONAL_SOURCE")
})
