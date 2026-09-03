import assert from "node:assert/strict"
import test from "node:test"
import { normalizeLocalDateTimeInput } from "../../lib/all-time/authoritative-date-time.ts"
import { formatClimbersPeriodLabel } from "../../lib/all-time/period-display.ts"
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

test("stored Climbers labels preserve the authoritative calendar dates", () => {
  assert.equal(formatClimbersPeriodLabel({
    label: "Aug 15–Aug 28, 2026",
    starts_at: "2026-08-15T00:00:00Z",
    ends_at: "2026-08-29T00:00:00Z",
  }), "Aug 15–Aug 28, 2026")
})

test("period fallback uses UTC calendar dates and the exclusive end boundary", () => {
  assert.equal(formatClimbersPeriodLabel({
    label: null,
    starts_at: "2026-08-15T00:00:00Z",
    ends_at: "2026-08-29T00:00:00Z",
  }), "8/15/2026–8/28/2026")
})
