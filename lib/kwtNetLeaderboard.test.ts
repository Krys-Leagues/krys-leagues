import assert from "node:assert/strict"
import test from "node:test"
import { buildKwtNetResults, netScore } from "./kwtNetLeaderboard.ts"
import type { CourseStrokeAllowance } from "./handicap/courseStrokeAllowance.ts"

const event = { eventIdentifier: "verified-event", courseName: "Verified Course", easySlope: 8.515, hardSlope: 17.03 }

test("KWT NET uses the frozen index and the same signed Easy/Hard stroke allowances", () => {
  const [row] = buildKwtNetResults(event, [{ playerId: "p1", screenName: "Player", easyGross: -20, hardGross: -18, handicapIndex: 8.515, handicapStatus: "OFFICIAL" }])
  assert.ok(row.easyStrokes)
  assert.ok(row.hardStrokes)
  assert.equal(row.easyStrokes.display, "9 RECEIVED")
  assert.equal(row.hardStrokes.display, "17 RECEIVED")
  assert.equal(row.easyNet, -29)
  assert.equal(row.hardNet, -35)
  assert.equal(row.combinedNet, -64)
})

test("given strokes add back to gross scores and missing events fail closed", () => {
  const given: CourseStrokeAllowance = { rawAllowance: -2.5, strokes: 3, direction: "GIVEN", display: "3 GIVEN" }
  assert.equal(netScore(-20, given), -17)
  assert.deepEqual(buildKwtNetResults(null, []), [])
})

