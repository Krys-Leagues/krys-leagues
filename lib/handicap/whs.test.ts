import assert from "node:assert/strict"
import test from "node:test"
import { addScoreDifferentials, calculateHandicapIndex, calculateScoreDifferential, FEWER_THAN_20_RULES, HANDICAP_START_BOUNDARY, isForwardEligibleRound } from "./whs.ts"

test("uses the WHS score differential formula and preserves negative differentials", () => {
  assert.equal(calculateScoreDifferential({ adjustedGrossScore: 80, courseRating: 72, slopeRating: 113, pccAdjustment: 0 }), 8)
  assert.equal(calculateScoreDifferential({ adjustedGrossScore: 69, courseRating: 71.5, slopeRating: 125, pccAdjustment: 0 }), -2.3)
})

test("uses the USGA fewer-than-20 table", () => {
  assert.equal(FEWER_THAN_20_RULES.length, 11)
  const rounds = Array.from({ length: 6 }, (_, index) => ({ id: String(index), playerId: "p", playedAt: `2026-09-${String(15 - index).padStart(2, "0")}T00:00:00Z`, adjustedGrossScore: 70 + index, courseRating: 70, slopeRating: 113, source: "KWT" }))
  const result = calculateHandicapIndex(addScoreDifferentials(rounds))
  assert.equal(result.index, -0.5)
  assert.equal(result.adjustment, -1)
  assert.deepEqual(result.selectedRoundIds, ["0", "1"])
})

test("uses the lowest 8 of the most recent 20 and rounds to tenths", () => {
  const rounds = Array.from({ length: 21 }, (_, index) => ({ id: String(index), playerId: "p", playedAt: new Date(Date.UTC(2026, 8, 15 - index)).toISOString(), adjustedGrossScore: 70 + (index % 10), courseRating: 70, slopeRating: 113, source: "LEAGUE" }))
  const result = calculateHandicapIndex(addScoreDifferentials(rounds))
  assert.equal(result.roundsCount, 20)
  assert.equal(result.selectedRoundIds.length, 8)
  assert.equal(result.status, "ACTIVE")
})

test("keeps the All-Time boundary explicit and rejects pre-boundary or non-played rows", () => {
  assert.equal(HANDICAP_START_BOUNDARY, "2026-09-15T00:00:00.000Z")
  assert.equal(isForwardEligibleRound("2026-09-14T23:59:59Z", "ALL_TIME", true), false)
  assert.equal(isForwardEligibleRound("2026-09-15T00:00:00Z", "ALL_TIME", true), true)
  assert.equal(isForwardEligibleRound("2026-09-15T00:00:00Z", "ALL_TIME", false), false)
  assert.equal(isForwardEligibleRound("2026-09-15T00:00:00Z", "ALL_TIME", true, true), false)
})
