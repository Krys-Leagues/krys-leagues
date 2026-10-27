import assert from "node:assert/strict"
import test from "node:test"
import { resolveHistoricalOrdering, sortHistoricalEvidence } from "./dateProvenance.ts"

test("exact source timestamps are chronological only when explicitly supplied", () => {
  const result = resolveHistoricalOrdering({
    sourceId: "message-2",
    playedAt: "2026-02-02T00:00:00Z",
    evidenceKind: "EXACT_TIMESTAMP",
  })
  assert.equal(result.evidenceKind, "EXACT_TIMESTAMP")
  assert.equal(result.chronological, true)
  assert.match(result.orderingKey, /^0:2026-02-02T00:00:00\.000Z:/)
})

test("season and week provide a deterministic window, not an exact date", () => {
  const result = resolveHistoricalOrdering({
    sourceId: "KWT-S11-W03-player",
    seasonNumber: 11,
    weekNumber: 3,
    evidenceKind: "WEEK_WINDOW",
  })
  assert.equal(result.evidenceKind, "WEEK_WINDOW")
  assert.equal(result.chronological, false)
  assert.equal(result.orderingKey, "1:00000011:00000003:KWT-S11-W03-player")
})

test("ordered undated evidence is stable but never promoted to chronology", () => {
  const result = resolveHistoricalOrdering({
    sourceId: "discord-post-b",
    sourceSequence: 2,
    evidenceKind: "ORDERED_UNDATED",
  })
  assert.equal(result.evidenceKind, "ORDERED_UNDATED")
  assert.equal(result.chronological, false)
  assert.equal(result.orderingKey, "2:00000002:discord-post-b")
})

test("an import timestamp cannot become a played date implicitly", () => {
  const result = resolveHistoricalOrdering({
    sourceId: "kwt-row-1",
    playedAt: "2026-08-24T23:57:34.349Z",
    evidenceKind: "WEEK_WINDOW",
    seasonNumber: 10,
    weekNumber: 1,
  })
  assert.equal(result.evidenceKind, "WEEK_WINDOW")
  assert.equal(result.chronological, false)
})

test("sorting is deterministic within and across evidence classes", () => {
  const sorted = sortHistoricalEvidence([
    { sourceId: "unknown-b", evidenceKind: "UNKNOWN" },
    { sourceId: "kwt-2", seasonNumber: 11, weekNumber: 2, evidenceKind: "WEEK_WINDOW" },
    { sourceId: "kwt-1", seasonNumber: 11, weekNumber: 1, evidenceKind: "WEEK_WINDOW" },
    { sourceId: "unknown-a", evidenceKind: "UNKNOWN" },
  ])
  assert.deepEqual(sorted.map((item) => item.sourceId), ["kwt-1", "kwt-2", "unknown-a", "unknown-b"])
})
