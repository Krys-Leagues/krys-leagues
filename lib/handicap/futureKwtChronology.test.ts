import assert from "node:assert/strict"
import test from "node:test"
import {
  prepareFutureKwtChronology,
  validateFutureKwtChronologyBatch,
} from "./futureKwtChronology.ts"

const base = {
  sourceId: "kwt-s15-w01-player-round",
  sourceFingerprint: "kwt|s15|w01|player|course|round",
  canonicalPlayerId: "11111111-1111-4111-8111-111111111111",
  originalPlayerName: "Exact Historical Name",
  playedAt: "2026-10-20T15:30:00-04:00",
  evidenceRef: "discord-message:kwt-s15-w01:message-1",
  sourceType: "KWT" as const,
  seasonNumber: 15,
  weekNumber: 1,
}

test("future KWT intake preserves exact timestamp evidence and identity", () => {
  const result = prepareFutureKwtChronology(base)
  assert.equal(result.chronologyClassification, "EXACT")
  assert.equal(result.personalHandicapEligible, true)
  assert.equal(result.sourceType, "KWT")
  assert.equal(result.canonicalPlayerId, base.canonicalPlayerId)
  assert.equal(result.originalPlayerName, base.originalPlayerName)
  assert.equal(result.evidence.evidenceKind, "EXACT_TIMESTAMP")
  assert.equal(result.evidence.playedAt, "2026-10-20T19:30:00.000Z")
})

test("future intake rejects timestamps without an explicit timezone", () => {
  assert.throws(() => prepareFutureKwtChronology({ ...base, playedAt: "2026-10-20T15:30:00" }), /timezone/)
})

test("future intake rejects Weekly evidence from personal chronology", () => {
  assert.throws(() => prepareFutureKwtChronology({ ...base, sourceType: "THE_WEEKLY" }), /KWT evidence only/)
})

test("future intake rejects missing canonical identity and evidence reference", () => {
  const result = validateFutureKwtChronologyBatch([
    { ...base, canonicalPlayerId: "not-a-uuid" },
    { ...base, sourceId: "missing-ref", evidenceRef: "" },
  ])
  assert.deepEqual(result.accepted, [])
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    "INVALID_CANONICAL_PLAYER_ID",
    "MISSING_EVIDENCE_REFERENCE",
  ])
})

test("future intake fails closed on duplicate source identity", () => {
  const result = validateFutureKwtChronologyBatch([
    base,
    { ...base, sourceId: "different-source-id" },
    { ...base, sourceFingerprint: "different-fingerprint" },
  ])
  assert.equal(result.accepted.length, 1)
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    "DUPLICATE_SOURCE_FINGERPRINT",
    "DUPLICATE_SOURCE_ID",
  ])
})
