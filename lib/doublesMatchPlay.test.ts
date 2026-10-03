import assert from "node:assert/strict"
import test from "node:test"
import { deriveDoublesCourseTotals, deriveDoublesOverallResult, provisionalDoublesState, validateDoublesHoleRow } from "./doublesMatchPlay.ts"

const row = (values: number[] = []) => [...values, ...Array(18 - values.length).fill(0)]

test("Doubles derives hole wins from canonical team rows, not row order", () => {
  const totals = deriveDoublesCourseTotals({ homePlayerOne: row([1]), homePlayerTwo: row(), awayPlayerOne: row([1]), awayPlayerTwo: row([1]) })
  assert.deepEqual(totals, { homeHolesWon: 0, awayHolesWon: 0, tiedHoles: 1, invalidHoles: 17 })
})

test("invalid double-zero holes are rejected before an overall result", () => {
  assert.throws(() => deriveDoublesOverallResult({ homeHolesWon: 1, awayHolesWon: 0, tiedHoles: 0, invalidHoles: 1 }, { homeHolesWon: 0, awayHolesWon: 1, tiedHoles: 0, invalidHoles: 0 }), /0\+0/)
  assert.equal(validateDoublesHoleRow(Array(18).fill(1)), true)
  assert.equal(validateDoublesHoleRow(Array(18).fill(2)), false)
})

test("two courses add actual holes won and preserve the team outcome", () => {
  assert.deepEqual(deriveDoublesOverallResult({ homeHolesWon: 7, awayHolesWon: 5, tiedHoles: 4, invalidHoles: 0 }, { homeHolesWon: 4, awayHolesWon: 8, tiedHoles: 3, invalidHoles: 0 }), { homeHolesWon: 11, awayHolesWon: 13, outcome: "AWAY_WIN" })
})

test("provisional points wait for both complete agreeing team submissions", () => {
  assert.equal(provisionalDoublesState({ homeSubmitted: true, awaySubmitted: false, homeCourseComplete: true, awayCourseComplete: true, homeOverall: 11, awayOverall: null }), "LIVE")
  assert.equal(provisionalDoublesState({ homeSubmitted: true, awaySubmitted: true, homeCourseComplete: true, awayCourseComplete: true, homeOverall: 11, awayOverall: 12 }), "ADMIN_REVIEW_NEEDED")
  assert.equal(provisionalDoublesState({ homeSubmitted: true, awaySubmitted: true, homeCourseComplete: true, awayCourseComplete: true, homeOverall: 11, awayOverall: 11 }), "PENDING")
})
