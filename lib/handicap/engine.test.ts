import assert from "node:assert/strict"
import test from "node:test"
import {
  APPROVED_HANDICAP_POLICY,
  buildDifferentials,
  buildHandicapIndexes,
  calculateApprovedHandicapSnapshot,
  calculateHandicapSnapshot,
} from "./engine.ts"

const playerId = "11111111-1111-4111-8111-111111111111"
const otherPlayerId = "22222222-2222-4222-8222-222222222222"

function round(sourceKey: string, playedAt: string, score: number, overrides: Partial<Parameters<typeof buildDifferentials>[0][number]> = {}) {
  return {
    sourceKey,
    playerId,
    playedAt,
    score,
    courseKey: "course-easy",
    ratingVersionId: "rating-v1",
    courseRating: -30,
    slopeRating: 6,
    ...overrides,
  }
}

test("negative score rounds calculate deterministic differentials", () => {
  const result = buildDifferentials([round("r1", "2026-01-01T00:00:00Z", -25)])
  assert.equal(result.issues.length, 0)
  assert.equal(result.differentials[0].differential, 5)
})

test("Candidate A is explicit, slope-normalized, and rejects near-zero slope", () => {
  const result = buildDifferentials([
    round("candidate", "2026-01-01T00:00:00Z", -25, { slopeRating: 4 }),
    round("flat", "2026-01-02T00:00:00Z", -25, { slopeRating: 0 }),
  ], { model: "candidate-a", referenceSlope: 8 })
  assert.equal(result.differentials[0].differential, 10)
  assert.deepEqual(result.issues.map((issue) => issue.code), ["INVALID_SLOPE"])
})

test("missing ratings and duplicate source rounds are excluded with audit issues", () => {
  const result = buildDifferentials([
    round("duplicate", "2026-01-01T00:00:00Z", -25),
    round("duplicate", "2026-01-02T00:00:00Z", -24),
    round("missing", "2026-01-03T00:00:00Z", -23, { courseRating: null }),
  ])
  assert.equal(result.differentials.length, 0)
  assert.deepEqual(result.issues.map((issue) => issue.code), ["DUPLICATE_SOURCE_KEY", "MISSING_RATING"])
})

test("rolling 20 uses every active differential and replaces the oldest card", () => {
  const rounds = Array.from({ length: 21 }, (_, index) =>
    round(`r${index + 1}`, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`, -20 - index),
  )
  const result = calculateApprovedHandicapSnapshot(rounds.map((item) => ({ ...item, sourceType: "KWT" as const, chronologyConfidence: "EXACT" as const })))
  assert.equal(result.indexes[0].latestRoundCount, 20)
  assert.equal(result.indexes[0].selectedRoundCount, 20)
  assert.equal(result.indexes[0].activeRoundCount, 20)
  assert.deepEqual(result.indexes[0].activeSourceKeys, Array.from({ length: 20 }, (_, index) => `r${21 - index}`))
  assert.equal(result.indexes[0].handicapStatus, "OFFICIAL_ELIGIBLE")
  assert.equal(result.indexes[0].index, -0.71)
})

test("Option B makes 1–19 cards provisional and zero cards not yet rated", () => {
  const one = calculateApprovedHandicapSnapshot([round("one", "2026-01-01T00:00:00Z", -25, { sourceType: "KWT", chronologyConfidence: "EXACT" })])
  assert.equal(one.indexes[0].index, 7.1)
  assert.equal(one.indexes[0].handicapStatus, "PROVISIONAL")
  assert.equal(one.indexes[0].publicationStatus, "UNPUBLISHED_APPROVAL")

  const empty = calculateApprovedHandicapSnapshot([])
  assert.equal(empty.indexes.length, 0)
})

test("non-exact chronology remains a deterministic preview and cannot publish", () => {
  const rounds = Array.from({ length: 5 }, (_, index) =>
    round(`period-${index}`, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`, -25, {
      chronologyConfidence: "PERIOD_WINDOW",
    }),
  )
  const result = buildHandicapIndexes(buildDifferentials(rounds).differentials)
  assert.equal(result.indexes[0].index, 5)
  assert.equal(result.indexes[0].chronologyConfidence, "PERIOD_WINDOW")
  assert.equal(result.indexes[0].publicationStatus, "UNPUBLISHED_CHRONOLOGY")
  assert.deepEqual(result.indexes[0].latestSourceKeys, ["period-4", "period-3", "period-2", "period-1", "period-0"])
})

test("Weekly evidence cannot enter personal differentials", () => {
  const result = buildDifferentials([
    round("weekly", "2026-01-01T00:00:00Z", -25, { sourceType: "THE_WEEKLY" }),
  ])
  assert.equal(result.differentials.length, 0)
  assert.deepEqual(result.issues.map((issue) => issue.code), ["EXTERNAL_SOURCE_NOT_ELIGIBLE"])
})

test("equal differentials use a documented deterministic tie break", () => {
  const result = buildHandicapIndexes(
    [
      ...Array.from({ length: 5 }, (_, index) => ({
        ...round(`tie-${index}`, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`, -25),
        differential: 5,
      })),
    ],
  )
  assert.deepEqual(result.indexes[0].selectedSourceKeys, ["tie-4", "tie-3", "tie-2", "tie-1", "tie-0"])
})

test("a second canonical player cannot inherit the first player's index", () => {
  const first = round("first", "2026-01-01T00:00:00Z", -25)
  const second = { ...round("second", "2026-01-01T00:00:00Z", -10), playerId: otherPlayerId }
  const snapshot = calculateHandicapSnapshot([first, second])
  assert.equal(snapshot.indexes.length, 2)
  assert.notEqual(snapshot.indexes[0].playerId, snapshot.indexes[1].playerId)
})

test("approved policy uses the locked Candidate A model and reference slope", () => {
  const result = calculateApprovedHandicapSnapshot([
    round("approved", "2026-01-01T00:00:00Z", -25, {
      sourceType: "KWT",
      courseRating: -30,
      slopeRating: 4,
    }),
  ])
  assert.equal(APPROVED_HANDICAP_POLICY.model, "candidate-a")
  assert.equal(APPROVED_HANDICAP_POLICY.referenceSlope, 8.515)
  assert.equal(APPROVED_HANDICAP_POLICY.modelVersion, "krys-handicap-candidate-a-v1")
  assert.equal(result.differentials[0].differential, 10.64)
  assert.equal(result.issues.length, 0)
})

test("approved policy rejects unclassified personal evidence", () => {
  const result = calculateApprovedHandicapSnapshot([
    round("unclassified", "2026-01-01T00:00:00Z", -25),
    round("weekly", "2026-01-02T00:00:00Z", -25, { sourceType: "THE_WEEKLY" }),
    round("kwt", "2026-01-03T00:00:00Z", -25, { sourceType: "KWT" }),
  ])
  assert.equal(result.differentials.length, 1)
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    "MISSING_PERSONAL_SOURCE_TYPE",
    "EXTERNAL_SOURCE_NOT_ELIGIBLE",
  ])
})

test("approved policy preserves provisional chronology as unpublished", () => {
  const rounds = Array.from({ length: 5 }, (_, index) => round(
    `approved-${index}`,
    `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    -25,
    { sourceType: "KWT", chronologyConfidence: "PERIOD_WINDOW" },
  ))
  const result = calculateApprovedHandicapSnapshot(rounds)
  assert.equal(result.indexes[0].index, 7.1)
  assert.equal(result.indexes[0].publicationStatus, "UNPUBLISHED_CHRONOLOGY")
})
