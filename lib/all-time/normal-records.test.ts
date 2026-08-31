import test from "node:test"
import assert from "node:assert/strict"
import { classifyRecord, climbersPoints, deriveFullCardStats } from "./normal-records.ts"

test("normal entries never move a lower-is-better record backwards", () => {
  assert.equal(classifyRecord(null, -18), "FIRST")
  assert.equal(classifyRecord(-25, -27), "BETTER")
  assert.equal(classifyRecord(-25, -25), "EQUAL")
  assert.equal(classifyRecord(-25, -22), "WORSE")
  assert.equal(climbersPoints("WORSE", 8), 0)
})

test("Climbers points count only people passed by a better PB", () => {
  assert.equal(climbersPoints("FIRST", 9), 0)
  assert.equal(climbersPoints("BETTER", 3), 3)
  assert.equal(climbersPoints("BETTER", 0), 0)
  assert.equal(climbersPoints("EQUAL", 3), 0)
})

test("full cards derive total, relative score, HN1, and hole statistics", () => {
  const stats = deriveFullCardStats(Array.from({ length: 18 }, (_, index) => index === 0 ? 1 : 3), Array(18).fill(3))
  assert.deepEqual(stats, { totalStrokes: 52, scoreRelativeToPar: -2, hn1Count: 1, birdies: 0, eagles: 1, pars: 17, bogeys: 0, otherHoles: 0 })
})

test("full cards reject missing holes and malformed scores", () => {
  assert.deepEqual(deriveFullCardStats([3], [3]), { error: "A full card requires exactly 18 holes and 18 authoritative pars." })
  assert.deepEqual(deriveFullCardStats([...Array(17).fill(3), 0], Array(18).fill(3)), { error: "Every hole score must be a positive whole number." })
})
