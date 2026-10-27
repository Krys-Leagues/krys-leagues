import assert from "node:assert/strict"
import test from "node:test"
import { buildPersonalIndexCandidates, type PersonalIndexRoundInput } from "./personalIndex.ts"

const PLAYER = "11111111-1111-4111-8111-111111111111"

function round(index: number, chronology: PersonalIndexRoundInput["chronology"], overrides: Partial<PersonalIndexRoundInput> = {}): PersonalIndexRoundInput {
  return {
    sourceKey: `KWT|S${chronology.seasonNumber}|W${chronology.weekNumber}|${index}`,
    playerId: PLAYER,
    score: -25,
    courseKey: "BHE",
    ratingVersionId: "rating-version-bhe-v1",
    ratingSnapshotId: "rating-snapshot-bhe-v1",
    courseRating: -30,
    slopeRating: 4,
    sourceType: "KWT",
    chronology,
    ...overrides,
  }
}

test("exact chronology preserves negative scores, Candidate A, rating references, and unpublished local snapshots", () => {
  const result = buildPersonalIndexCandidates(Array.from({ length: 5 }, (_, index) => round(index, {
    sourceId: `exact-${index}`,
    evidenceKind: "EXACT_TIMESTAMP",
    playedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
  })), { calculationRunId: "local-run" })

  assert.equal(result.issues.length, 0)
  assert.equal(result.differentials[0].differential, 10.64)
  assert.equal(result.indexes[0].chronologyConfidence, "EXACT")
  assert.equal(result.indexes[0].publicationStatus, "UNPUBLISHED_APPROVAL")
  assert.equal(result.indexes[0].handicapStatus, "PROVISIONAL")
  assert.equal(result.snapshotCandidates.length, 1)
  assert.equal(result.snapshotCandidates[0].publicationStatus, "UNPUBLISHED")
  assert.deepEqual(result.snapshotCandidates[0].ratingSnapshotIds, ["rating-snapshot-bhe-v1"])
})

test("week-window chronology does not invent playedAt and remains preview-only", () => {
  const result = buildPersonalIndexCandidates(Array.from({ length: 5 }, (_, index) => round(index, {
    sourceId: `window-${index}`,
    seasonNumber: 14,
    weekNumber: index + 1,
    evidenceKind: "WEEK_WINDOW",
  })), { calculationRunId: "local-run" })

  assert.equal(result.issues.length, 0)
  assert.equal(result.differentials.every((item) => item.playedAt === null), true)
  assert.equal(result.indexes[0].chronologyConfidence, "PERIOD_WINDOW")
  assert.equal(result.snapshotCandidates[0].chronologyConfidence, "PERIOD_WINDOW")
  assert.equal(result.snapshotCandidates[0].publicationStatus, "UNPUBLISHED")
})

test("latest-ten boundary ties are ambiguous and cannot be published", () => {
  const rounds = [
    round(0, { sourceId: "boundary-a", seasonNumber: 14, weekNumber: 1, evidenceKind: "WEEK_WINDOW" }),
    round(1, { sourceId: "boundary-b", seasonNumber: 14, weekNumber: 1, evidenceKind: "WEEK_WINDOW" }),
    ...Array.from({ length: 19 }, (_, index) => round(index + 2, {
      sourceId: `old-${index}`,
      seasonNumber: 14,
      weekNumber: index + 2,
      evidenceKind: "WEEK_WINDOW",
    })),
  ]
  const result = buildPersonalIndexCandidates(rounds, { calculationRunId: "local-run" })

  assert.equal(result.indexes[0].latestRoundCount, 20)
  assert.equal(result.indexes[0].chronologyConfidence, "AMBIGUOUS")
  assert.equal(result.snapshotCandidates[0].publicationStatus, "UNPUBLISHED")
  assert.deepEqual(result.chronologyReviews.get(PLAYER)?.boundarySourceIds, ["boundary-b"])
})

test("Weekly evidence cannot enter personal differentials or index candidates", () => {
  const result = buildPersonalIndexCandidates([
    ...Array.from({ length: 5 }, (_, index) => round(index, {
      sourceId: `kwt-${index}`,
      evidenceKind: "EXACT_TIMESTAMP",
      playedAt: `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    })),
    round(99, {
      sourceId: "weekly-1",
      evidenceKind: "EXACT_TIMESTAMP",
      playedAt: "2026-02-06T00:00:00Z",
    }, { sourceType: "THE_WEEKLY", sourceKey: "THE_WEEKLY|S01W01|AMATEUR|external|BHE|1" }),
  ], { calculationRunId: "local-run" })

  assert.equal(result.differentials.some((item) => item.sourceType === "THE_WEEKLY"), false)
  assert.equal(result.issues.some((issue) => issue.code === "EXTERNAL_SOURCE_NOT_ELIGIBLE"), true)
  assert.equal(result.snapshotCandidates.length, 1)
})

test("missing rating snapshot references fail closed and repeated runs are deterministic", () => {
  const rounds = Array.from({ length: 5 }, (_, index) => round(index, {
    sourceId: `repeat-${index}`,
    evidenceKind: "EXACT_TIMESTAMP",
    playedAt: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
  }))
  rounds[0] = { ...rounds[0], ratingSnapshotId: "" }
  const first = buildPersonalIndexCandidates(rounds, { calculationRunId: "local-run" })
  const second = buildPersonalIndexCandidates(rounds, { calculationRunId: "local-run" })

  assert.equal(first.issues.some((issue) => issue.code === "MISSING_RATING_SNAPSHOT_REFERENCE"), true)
  assert.equal(first.indexes[0].index, 10.64)
  assert.equal(first.indexes[0].handicapStatus, "PROVISIONAL")
  assert.deepEqual(first.snapshotCandidates, second.snapshotCandidates)
})
