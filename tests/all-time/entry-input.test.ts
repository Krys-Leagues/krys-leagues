import assert from "node:assert/strict"
import test from "node:test"
import { normalizeLocalDateTimeInput } from "../../lib/all-time/authoritative-date-time.ts"
import { nextHoleAfterCompleteInput, sanitizeHoleScoreInput } from "../../lib/all-time/score-input.ts"

test("rapid one-score-per-hole entry advances each score to the next hole", () => {
  const first = sanitizeHoleScoreInput("2")
  const second = sanitizeHoleScoreInput("2")
  const third = sanitizeHoleScoreInput("2")

  assert.equal(first, "2")
  assert.equal(nextHoleAfterCompleteInput(first, 0), 1)
  assert.equal(second, "2")
  assert.equal(nextHoleAfterCompleteInput(second, 1), 2)
  assert.equal(third, "2")
  assert.equal(nextHoleAfterCompleteInput(third, 2), 3)
})

test("hole input keeps the existing positive-integer validation rule", () => {
  assert.equal(nextHoleAfterCompleteInput("", 0), null)
  assert.equal(nextHoleAfterCompleteInput("0", 0), null)
  assert.equal(nextHoleAfterCompleteInput("22", 0), 1)
})

test("friendly local date/time normalizes to an exact timestamp", () => {
  const normalized = normalizeLocalDateTimeInput("2026-08-15T17:31")
  assert.equal(normalized, new Date("2026-08-15T17:31").toISOString())
})

test("incomplete or invalid date/time stays unresolved without inventing a timestamp", () => {
  assert.equal(normalizeLocalDateTimeInput("2026-08-15"), null)
  assert.equal(normalizeLocalDateTimeInput("08/15/2026 17:31"), null)
  assert.equal(normalizeLocalDateTimeInput("2026-02-31T17:31"), null)
})
