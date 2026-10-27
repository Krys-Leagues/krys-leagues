import assert from "node:assert/strict"
import test from "node:test"
import {
  buildLocalHandicapProjection,
  PHASE38_SIMULATION_POLICY,
  type ApprovedCourseCode,
  type ProjectionRoundInput,
  type ProjectionPolicy,
} from "./projection.ts"
import type { CanonicalPlayer } from "./identityResolver.ts"

const PLAYER_A = "8b29287c-0696-4cb9-8bb1-b161e0940808"
const PLAYER_B = "00000000-0000-0000-0000-000000000001"

const players: readonly CanonicalPlayer[] = [
  { id: PLAYER_A, screenName: "Raccoons_whisker" },
  { id: PLAYER_B, screenName: "Player B" },
]

const courses: readonly ApprovedCourseCode[] = [
  { code: "TTE", courseId: "Tourist Trap_easy", baseMap: "Tourist Trap", difficulty: "easy" },
  { code: "TTH", courseId: "Tourist Trap_hard", baseMap: "Tourist Trap", difficulty: "hard" },
]

const policy: ProjectionPolicy = {
  ...PHASE38_SIMULATION_POLICY,
  minimumProvisionalSample: 2,
  minimumReadySample: 4,
  minimumDistinctPlayers: 2,
  maximumPlayerShare: 1,
  minimumIndexRounds: 2,
}

function round(overrides: Partial<ProjectionRoundInput> = {}): ProjectionRoundInput {
  return {
    sourceId: "row-1",
    sourceFingerprint: "fingerprint-1",
    historicalPlayerName: "Raccoons Whisker",
    canonicalPlayerId: PLAYER_A,
    playedAt: "2026-01-01T00:00:00.000Z",
    score: -20,
    courseCode: "TTE",
    difficulty: "easy",
    ...overrides,
  }
}

test("projection requires UUID-backed identity and approved course codes", () => {
  const result = buildLocalHandicapProjection([
    round(),
    round({ sourceId: "row-2", sourceFingerprint: "fingerprint-2", canonicalPlayerId: null }),
    round({ sourceId: "row-3", sourceFingerprint: "fingerprint-3", courseCode: "ZZH", difficulty: "hard" }),
  ], players, courses, policy)

  assert.equal(result.accepted.length, 1)
  assert.equal(result.quarantined.length, 2)
  assert.deepEqual(
    result.quarantined.map((entry) => entry.reasonCode).sort(),
    ["MISSING_CANONICAL_PLAYER", "UNKNOWN_COURSE_CODE"],
  )
  assert.equal(result.accepted[0].record.historicalPlayerName, "Raccoons Whisker")
  assert.equal(result.accepted[0].record.canonicalScreenName, "Raccoons_whisker")
})

test("source fingerprints are idempotent while distinct repeated scores remain eligible", () => {
  const result = buildLocalHandicapProjection([
    round({ sourceId: "row-a", sourceFingerprint: "same", score: -20 }),
    round({ sourceId: "row-b", sourceFingerprint: "same", score: -20 }),
    round({ sourceId: "row-c", sourceFingerprint: "different", score: -20, playedAt: "2026-01-02T00:00:00.000Z" }),
    round({ sourceId: "row-d", sourceFingerprint: "conflict", score: -18 }),
    round({ sourceId: "row-e", sourceFingerprint: "conflict", score: -17 }),
  ], players, courses, policy)

  assert.equal(result.accepted.length, 2)
  assert.equal(result.excluded.length, 1)
  assert.equal(result.excluded[0].reasonCode, "DUPLICATE_SOURCE_FINGERPRINT")
  assert.equal(result.quarantined.length, 2)
  assert.equal(result.quarantined[0].reasonCode, "SOURCE_FINGERPRINT_CONFLICT")
})

test("all three models preserve negative scores, versions, and fail closed on invalid slope", () => {
  const result = buildLocalHandicapProjection([
    round({ sourceId: "a", sourceFingerprint: "a", score: -24, playedAt: "2026-01-01T00:00:00.000Z" }),
    round({ sourceId: "b", sourceFingerprint: "b", score: -22, playedAt: "2026-01-02T00:00:00.000Z" }),
    round({ sourceId: "c", sourceFingerprint: "c", score: -20, canonicalPlayerId: PLAYER_B, playedAt: "2026-01-03T00:00:00.000Z" }),
    round({ sourceId: "d", sourceFingerprint: "d", score: -18, canonicalPlayerId: PLAYER_B, playedAt: "2026-01-04T00:00:00.000Z" }),
  ], players, courses, policy)

  assert.equal(result.ratings[0].ratingStatus, "ready")
  assert.equal(result.differentials.current.length, 4)
  assert.equal(result.differentials["candidate-a"].length, 4)
  assert.equal(result.differentials["candidate-b"].length, 4)
  assert.ok(result.differentials.current.some((item) => item.score < 0))
  assert.deepEqual(
    result.versions.map((version) => version.modelVersion),
    ["current-differential-v1", "slope-normalized-v1", "distribution-standard-score-v1"],
  )

  const flatPolicy: ProjectionPolicy = { ...policy, nearZeroSlope: 0.01 }
  const flat = buildLocalHandicapProjection([
    round({ sourceId: "flat-a", sourceFingerprint: "flat-a", score: -20 }),
    round({ sourceId: "flat-b", sourceFingerprint: "flat-b", score: -20, canonicalPlayerId: PLAYER_B }),
    round({ sourceId: "flat-c", sourceFingerprint: "flat-c", score: -20, playedAt: "2026-01-02T00:00:00.000Z" }),
    round({ sourceId: "flat-d", sourceFingerprint: "flat-d", score: -20, canonicalPlayerId: PLAYER_B, playedAt: "2026-01-02T00:00:00.000Z" }),
  ], players, courses, flatPolicy)
  assert.equal(flat.ratings[0].ratingStatus, "needs_review")
  assert.equal(flat.differentials["candidate-a"].length, 0)
})

test("indexes use the rolling active window and all differentials deterministically across repeated runs", () => {
  const rounds = Array.from({ length: 10 }, (_, index) => round({
    sourceId: `history-${index}`,
    sourceFingerprint: `history-${index}`,
    score: -30 + index,
    playedAt: `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }))
  const first = buildLocalHandicapProjection(rounds, players, courses, {
    ...policy,
    minimumDistinctPlayers: 1,
    maximumPlayerShare: 1,
  })
  const second = buildLocalHandicapProjection(rounds, players, courses, {
    ...policy,
    minimumDistinctPlayers: 1,
    maximumPlayerShare: 1,
  })

  assert.deepEqual(first.indexes, second.indexes)
  assert.equal(first.indexes.current[0].latestRoundCount, 10)
  assert.equal(first.indexes.current[0].selectedRoundCount, 10)
  assert.deepEqual(first.indexes.current[0].selectedSourceKeys, [
    "history-9", "history-8", "history-7", "history-6", "history-5",
    "history-4", "history-3", "history-2", "history-1", "history-0",
  ])
})

test("Weekly rounds may inform course evidence but never a personal index", () => {
  const result = buildLocalHandicapProjection([
    ...Array.from({ length: 2 }, (_, index) => round({
      sourceId: `weekly-${index}`,
      sourceFingerprint: `weekly-${index}`,
      sourceType: "THE_WEEKLY",
      personalHandicapEligible: false,
      score: -20 - index,
      playedAt: `2026-03-0${index + 1}T00:00:00.000Z`,
    })),
    ...Array.from({ length: 2 }, (_, index) => round({
      sourceId: `kwt-${index}`,
      sourceFingerprint: `kwt-${index}`,
      sourceType: "KWT",
      score: -18 - index,
      playedAt: `2026-03-1${index + 1}T00:00:00.000Z`,
    })),
  ], players, courses, {
    ...policy,
    minimumDistinctPlayers: 1,
    maximumPlayerShare: 1,
  })
  assert.equal(result.accepted.length, 4)
  assert.equal(result.differentials.current.length, 4)
  assert.deepEqual(result.indexes.current[0].selectedSourceKeys, ["kwt-1", "kwt-0"])
  assert.ok(result.differentials.current.every((round) => round.sourceKey.startsWith("kwt-") || round.eligible === false))
})
