import assert from "node:assert/strict"
import test from "node:test"
import { classifyKwtChronology, classifyKwtPlayerChronology } from "./kwtChronology.ts"

test("only an explicitly verified source timestamp is EXACT", () => {
  const result = classifyKwtChronology({
    sourceId: "kwt-round-1",
    playedAt: "2026-02-02T00:00:00Z",
    playedAtVerified: true,
    seasonNumber: 14,
    weekNumber: 1,
  })
  assert.equal(result.classification, "EXACT")
  assert.equal(result.evidence.evidenceKind, "EXACT_TIMESTAMP")
  assert.equal(result.evidence.playedAt, "2026-02-02T00:00:00Z")
})

test("season/week is PERIOD_ONLY and never invents a calendar date", () => {
  const result = classifyKwtChronology({
    sourceId: "KWT14W01|player|LLE|round-1",
    seasonNumber: 14,
    weekNumber: 1,
    playedAt: "2026-10-20T12:00:00Z",
    playedAtVerified: false,
  })
  assert.equal(result.classification, "PERIOD_ONLY")
  assert.equal(result.evidence.evidenceKind, "WEEK_WINDOW")
  assert.equal(result.evidence.playedAt, null)
})

test("a source round ID or sequence does not establish within-week chronology", () => {
  const result = classifyKwtChronology({
    sourceId: "round-999999",
    seasonNumber: 14,
    weekNumber: 2,
    sourceSequence: 1,
  })
  assert.equal(result.classification, "PERIOD_ONLY")
  assert.equal(result.evidence.sourceSequence, 1)
  assert.equal(result.evidence.evidenceKind, "WEEK_WINDOW")
})

test("missing season/week remains UNKNOWN even when a source sequence exists", () => {
  const result = classifyKwtChronology({ sourceId: "legacy-row", sourceSequence: 4 })
  assert.equal(result.classification, "UNKNOWN")
  assert.equal(result.evidence.evidenceKind, "UNKNOWN")
})

test("latest-ten ties at a week boundary are AMBIGUOUS", () => {
  const records = [
    { sourceId: "old", seasonNumber: 13, weekNumber: 4 },
    ...Array.from({ length: 11 }, (_, index) => ({
      sourceId: `boundary-${index}`,
      seasonNumber: 14,
      weekNumber: 1,
    })),
  ]
  const result = classifyKwtPlayerChronology(records)
  assert.equal(result.classification, "AMBIGUOUS")
  assert.equal(result.latestTenReview.boundarySourceIds.length, 10)
})

test("complete week boundaries are deterministic but remain PERIOD_ONLY", () => {
  const records = Array.from({ length: 10 }, (_, index) => ({
    sourceId: `week-${index}`,
    seasonNumber: index < 2 ? 13 : 14,
    weekNumber: index < 2 ? 4 : index - 1,
  }))
  const result = classifyKwtPlayerChronology(records)
  assert.equal(result.classification, "PERIOD_ONLY")
  assert.equal(result.latestTenReview.selected.length, 10)
})
