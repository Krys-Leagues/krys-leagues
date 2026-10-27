import assert from "node:assert/strict"
import test from "node:test"
import { classifyKwtPlayerChronology } from "./kwtChronology.ts"
import { validateKwtOfficialPair } from "./kwtOfficialSequence.ts"
import { buildPersonalIndexCandidates } from "./personalIndex.ts"

const pair = {
  canonicalPlayerId: "11111111-1111-4111-8111-111111111111",
  originalPlayerName: "KWT Historical Name",
  seasonNumber: 14,
  weekNumber: 3,
  evidenceRef: "kwt-result:KWT14W03:player-1",
  officialResultVerified: true,
  timingRuleEvidence: "RULE_ONLY" as const,
  easy: { sourceId: "easy-round", sourceFingerprint: "easy-fingerprint" },
  hard: { sourceId: "hard-round", sourceFingerprint: "hard-fingerprint" },
}

test("official KWT pair orders Easy before Hard without inventing timestamps", () => {
  const result = validateKwtOfficialPair(pair)
  assert.equal(result.valid, true)
  assert.equal(result.records[0]?.difficulty, "EASY")
  assert.equal(result.records[1]?.difficulty, "HARD")
  assert.equal(result.records[0]?.playedAt, null)
  assert.equal(result.records[0]?.officialSequenceVerified, true)

  const review = classifyKwtPlayerChronology(result.records)
  assert.equal(review.classification, "OFFICIAL_KWT_SEQUENCE")
  assert.equal(review.latestTenReview.reason, "official KWT season/week pair order; no exact play timestamp")
})

test("the three-minute rule is retained as rule provenance, not timestamp evidence", () => {
  const result = validateKwtOfficialPair(pair)
  assert.equal(result.records.every((record) => record.playedAt === null), true)
  assert.equal(result.records.every((record) => record.playedAtVerified !== true), true)
})

test("duplicate weekly pair components are rejected", () => {
  const result = validateKwtOfficialPair({
    ...pair,
    hard: { ...pair.hard, sourceId: pair.easy.sourceId },
  })
  assert.equal(result.valid, false)
  assert.deepEqual(result.issues, ["DUPLICATE_SOURCE_ID"])
})

test("incomplete or unverified official pairs fail closed", () => {
  const result = validateKwtOfficialPair({
    ...pair,
    officialResultVerified: false,
    hard: { sourceId: "", sourceFingerprint: "" },
  })
  assert.equal(result.valid, false)
  assert.ok(result.issues.includes("UNVERIFIED_OFFICIAL_RESULT"))
  assert.ok(result.issues.includes("MISSING_SOURCE_ID"))
  assert.ok(result.issues.includes("MISSING_SOURCE_FINGERPRINT"))
})

test("season/week boundaries remain ordered without becoming exact timestamps", () => {
  const first = validateKwtOfficialPair({ ...pair, seasonNumber: 13, weekNumber: 12 })
  const second = validateKwtOfficialPair({ ...pair, seasonNumber: 14, weekNumber: 1, easy: { ...pair.easy, sourceId: "next-easy" }, hard: { ...pair.hard, sourceId: "next-hard" } })
  const review = classifyKwtPlayerChronology([
    ...first.records,
    ...second.records,
  ])
  assert.equal(review.classification, "OFFICIAL_KWT_SEQUENCE")
  assert.deepEqual(review.latestTenReview.selected.map((item) => item.sourceId), [
    "easy-round", "hard-round", "next-easy", "next-hard",
  ])
})

test("official sequence can calculate a local preview but cannot publish under the current gate", () => {
  const rounds = []
  for (let week = 1; week <= 5; week += 1) {
    const result = validateKwtOfficialPair({
      ...pair,
      weekNumber: week,
      easy: { sourceId: `easy-${week}`, sourceFingerprint: `easy-fingerprint-${week}` },
      hard: { sourceId: `hard-${week}`, sourceFingerprint: `hard-fingerprint-${week}` },
    })
    assert.equal(result.valid, true)
    for (const record of result.records) {
      rounds.push({
        sourceKey: record.sourceId,
        playerId: pair.canonicalPlayerId,
        score: -25,
        courseKey: "BHE",
        ratingVersionId: "rating-v1",
        ratingSnapshotId: "rating-snapshot-v1",
        courseRating: -30,
        slopeRating: 4,
        sourceType: "KWT" as const,
        chronology: classifyKwtPlayerChronology([record]).evidence[0],
      })
    }
  }
  const result = buildPersonalIndexCandidates(rounds, { calculationRunId: "official-sequence-preview" })
  assert.equal(result.indexes[0]?.index, 10.64)
  assert.equal(result.indexes[0]?.chronologyConfidence, "OFFICIAL_KWT_SEQUENCE")
  assert.equal(result.indexes[0]?.publicationStatus, "UNPUBLISHED_CHRONOLOGY")
  assert.equal(result.snapshotCandidates[0]?.publicationStatus, "UNPUBLISHED")
})
