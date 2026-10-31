import assert from "node:assert/strict"
import test from "node:test"

import {
  MAJOR_RANKING_POINTS,
  accumulateMajorRankingPoints,
  calculateMajorRankingFinishPoints,
  formatMajorRankingPoints,
  majorRankingPointsForPosition,
  majorRankingPointsForTie,
  nextMajorRankingPositionAfterTie,
} from "./majorRankingPoints.ts"

test("the authoritative schedule starts at 200 and ends at 20", () => {
  assert.equal(majorRankingPointsForPosition(1), 200)
  assert.equal(majorRankingPointsForPosition(54), 20)
})

test("the full 54-place schedule is present in order", () => {
  assert.equal(MAJOR_RANKING_POINTS.length, 54)
  assert.deepEqual(MAJOR_RANKING_POINTS.map((entry) => entry.position), Array.from({ length: 54 }, (_, index) => index + 1))
  assert.deepEqual(MAJOR_RANKING_POINTS.map((entry) => entry.points), [
    200, 185, 175, 165, 155, 148, 142, 136, 130, 125, 120, 116, 112, 108, 104, 101, 98, 95, 93, 90,
    87, 84, 81, 78, 75, 73, 71, 69, 67, 65, 63, 61, 59, 56, 53, 50, 48, 46, 44, 42, 40, 38, 36, 34,
    32, 31, 30, 29, 28, 27, 25, 23, 21, 20,
  ])
})

test("ties average every occupied position", () => {
  assert.equal(majorRankingPointsForTie(5, 2), 151.5)
  assert.equal(majorRankingPointsForTie(10, 3), (125 + 120 + 116) / 3)
  assert.equal(majorRankingPointsForTie(50, 2), 26)
})

test("the next finish after a tie begins after every occupied place", () => {
  assert.equal(nextMajorRankingPositionAfterTie(5, 2), 7)
  assert.equal(majorRankingPointsForTie(7), 142)
})

test("ranking points preserve decimal precision and use clean display formatting", () => {
  const points = calculateMajorRankingFinishPoints({ playerId: "three-way", position: 10, tieSize: 3 })
  assert.equal(points, 361 / 3)
  assert.equal(Number.isInteger(points), false)
  assert.equal(formatMajorRankingPoints(points), "120.33")
  assert.equal(formatMajorRankingPoints(151.5), "151.5")
  assert.equal(formatMajorRankingPoints(26), "26")
})

test("four-Major accumulation sums each player's awards without truncating ties", () => {
  const totals = accumulateMajorRankingPoints([
    [{ playerId: "a", position: 1 }, { playerId: "b", position: 5, tieSize: 2 }],
    [{ playerId: "a", position: 10, tieSize: 3 }, { playerId: "b", position: 2 }],
    [{ playerId: "a", position: 54 }, { playerId: "b", position: 50, tieSize: 2 }],
    [{ playerId: "a", position: 20 }, { playerId: "b", position: 7 }],
  ])
  assert.equal(totals.get("a"), 200 + 361 / 3 + 20 + 90)
  assert.equal(totals.get("b"), 151.5 + 185 + 26 + 142)
})

test("invalid positions do not create an award", () => {
  assert.equal(majorRankingPointsForPosition(0), null)
  assert.equal(majorRankingPointsForPosition(55), null)
  assert.equal(majorRankingPointsForTie(54, 2), null)
  assert.equal(calculateMajorRankingFinishPoints({ playerId: "invalid", position: 0 }), null)
})
