import assert from "node:assert/strict"
import test from "node:test"
import { compareRelativeScoreToPb, formatHistoricalPb, formatPb, parseOptionalRelativeScore } from "../../lib/all-time/pb-precheck.ts"

test("PB pre-check compares lower relative scores as better", () => {
  assert.equal(parseOptionalRelativeScore("-24"), -24)
  assert.equal(compareRelativeScoreToPb(-25, -24), "BETTER THAN PB")
  assert.equal(compareRelativeScoreToPb(-24, -24), "EQUAL TO PB")
  assert.equal(compareRelativeScoreToPb(-23, -24), "DOES NOT BEAT PB")
  assert.equal(compareRelativeScoreToPb(-24, null), "FIRST SCORE")
})

test("PB display distinguishes no record from a pending lookup", () => {
  assert.equal(formatPb(-24), "-24")
  assert.equal(formatPb(3), "+3")
  assert.equal(formatPb(null), "NO CURRENT ALL-TIME RECORD")
  assert.equal(formatPb(undefined), "PB LOOKUP PENDING")
  assert.equal(formatHistoricalPb(-24), "-24")
  assert.equal(formatHistoricalPb(null), "NO ALL-TIME RECORD AT SUBMISSION")
})
