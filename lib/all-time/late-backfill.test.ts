import test from "node:test"
import assert from "node:assert/strict"
import { hasDeterministicBackfillOrder, hasDuplicateBackfillIdentity, replayLateBackfill, type BackfillAttempt } from "./late-backfill.ts"

const entry = (id: string, playerId: string, score: number, date: string, order?: number): BackfillAttempt => ({
  id, courseId: "course", playerId, score, authoritativeTimePrecision: order == null ? "exact" : "date_ordered",
  authoritativeSubmittedAt: order == null ? `${date}T12:00:00Z` : null, authoritativeSubmittedDate: date, authoritativeSubmissionOrder: order ?? null,
})

test("backfill uses authoritative chronology, not the data-entry timestamp", () => {
  const effects = replayLateBackfill([{ courseId: "course", playerId: "leader", score: -5 }], [entry("late", "new", -6, "2026-08-16")], "historical")
  assert.equal(effects[0].oldPbScore, null)
  assert.equal(effects[0].classification, "FIRST")
  assert.equal(effects[0].seasonId, "historical")
})

test("chronological replay calculates FIRST/BETTER/EQUAL/WORSE and repeated passes", () => {
  const effects = replayLateBackfill(
    [{ courseId: "course", playerId: "a", score: -10 }, { courseId: "course", playerId: "b", score: -5 }, { courseId: "course", playerId: "c", score: -6 }],
    [entry("first", "d", -4, "2026-08-15", 1), entry("better", "d", -7, "2026-08-16", 1), entry("equal", "d", -7, "2026-08-17", 1), entry("worse", "d", -3, "2026-08-18", 1), entry("pass-again", "d", -11, "2026-08-19", 1)],
    "historical",
  )
  assert.deepEqual(effects.map(effect => effect.classification), ["FIRST", "BETTER", "EQUAL", "WORSE", "BETTER"])
  assert.deepEqual(effects[1].passedPlayerIds, ["b", "c"])
  assert.equal(effects[1].points, 2)
  assert.equal(effects[2].points, 0)
  assert.equal(effects[4].points, 3)
})

test("ties do not count as passed and imported baseline rows create no events", () => {
  const effects = replayLateBackfill([{ courseId: "course", playerId: "new", score: -10 }, { courseId: "course", playerId: "tied", score: -11 }, { courseId: "course", playerId: "passed", score: 0 }], [entry("late", "new", -11, "2026-08-15", 1)], null)
  assert.equal(effects[0].classification, "BETTER")
  assert.deepEqual(effects[0].passedPlayerIds, ["passed"])
  assert.equal(effects[0].seasonId, null)
})

test("date-only chronology requires explicit source-backed ordering", () => {
  const ordered = [entry("one", "a", -1, "2026-08-15", 1), entry("two", "b", -2, "2026-08-15", 2)]
  const mixed = [entry("one", "a", -1, "2026-08-15", 1), entry("two", "b", -2, "2026-08-15")]
  assert.equal(hasDeterministicBackfillOrder(ordered), true)
  assert.equal(hasDeterministicBackfillOrder(mixed), false)
})

test("duplicate entry keys or fingerprints are rejected", () => {
  assert.equal(hasDuplicateBackfillIdentity([{ entryKey: "a", fingerprint: "ABC" }, { entryKey: "b", fingerprint: "abc" }]), true)
  assert.equal(hasDuplicateBackfillIdentity([{ entryKey: "a", fingerprint: "ABC" }, { entryKey: "a", fingerprint: "def" }]), true)
})
