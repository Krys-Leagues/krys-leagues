import assert from "node:assert/strict"
import test from "node:test"
import {
  buildKwtShotsDisplay,
  calculateCourseStrokeAllowance,
  roundStrokeMagnitude,
} from "./courseStrokeAllowance.ts"

test("rounds final stroke magnitude with exact half-up behavior", () => {
  assert.equal(roundStrokeMagnitude(8.46), 8)
  assert.equal(roundStrokeMagnitude(8.5), 9)
  assert.equal(roundStrokeMagnitude(14.09), 14)
  assert.equal(roundStrokeMagnitude(-3.5), 4)
})

test("preserves signed give/receive direction after rounding", () => {
  assert.deepEqual(calculateCourseStrokeAllowance(8.515, 8.515), {
    rawAllowance: 8.515,
    strokes: 9,
    direction: "RECEIVED",
    display: "9 RECEIVED",
  })
  assert.deepEqual(calculateCourseStrokeAllowance(-3.5, 8.515), {
    rawAllowance: -3.5,
    strokes: 4,
    direction: "GIVEN",
    display: "4 GIVEN",
  })
  assert.equal(calculateCourseStrokeAllowance(0, 8.515)?.display, "ZERO STROKES")
})

test("fails closed when verified event data is unavailable", () => {
  assert.equal(buildKwtShotsDisplay(null, 6.43), null)
  assert.equal(buildKwtShotsDisplay({ eventIdentifier: "KWTS15W1", courseName: "Raptor Cliffs", easySlope: 0, hardSlope: 12 }, 6.43), null)
})

test("returns one safe event/course payload with side-by-side Easy and Hard values", () => {
  const result = buildKwtShotsDisplay({ eventIdentifier: "KWTS15W1", courseName: "Raptor Cliffs", easySlope: 8.515, hardSlope: 17.03 }, 8.515)
  assert.deepEqual(result, {
    eventIdentifier: "KWTS15W1",
    courseName: "Raptor Cliffs",
    easy: { rawAllowance: 8.515, strokes: 9, direction: "RECEIVED", display: "9 RECEIVED" },
    hard: { rawAllowance: 17.03, strokes: 17, direction: "RECEIVED", display: "17 RECEIVED" },
  })
})
