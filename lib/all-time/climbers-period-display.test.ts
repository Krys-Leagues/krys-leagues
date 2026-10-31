import assert from "node:assert/strict"
import test from "node:test"
import { formatClimbersPeriodRange } from "./climbers-period-display.ts"

test("Climbers periods display UTC calendar dates with an inclusive end", () => {
  assert.equal(
    formatClimbersPeriodRange("2026-08-15T00:00:00Z", "2026-08-29T00:00:00Z"),
    "Aug 15–Aug 28, 2026",
  )
})

test("Climbers period display does not shift midnight UTC into the prior local day", () => {
  assert.doesNotMatch(
    formatClimbersPeriodRange("2026-08-15T00:00:00+00:00", "2026-08-29T00:00:00+00:00"),
    /Aug 14/,
  )
})

test("invalid and reversed ranges are explicit", () => {
  assert.equal(formatClimbersPeriodRange("bad", "2026-08-29T00:00:00Z"), "Unavailable period")
  assert.equal(
    formatClimbersPeriodRange("2026-08-29T00:00:00Z", "2026-08-15T00:00:00Z"),
    "Unavailable period",
  )
})
