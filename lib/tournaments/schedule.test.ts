import assert from "node:assert/strict"
import test from "node:test"

import { assertIanaTimeZone, formatLocalDateTime, localDateTimeToUtc, roundScheduleDeadline, SCHEDULE_PRESETS } from "./schedule.ts"

test("schedule presets keep normal, one-day, and custom timing distinct", () => {
  assert.equal(SCHEDULE_PRESETS.NORMAL.defaultRoundDurationMinutes, 10080)
  assert.equal(SCHEDULE_PRESETS.ONE_DAY.defaultRoundDurationMinutes, 60)
  assert.equal(SCHEDULE_PRESETS.CUSTOM.defaultRoundDurationMinutes, null)
})

test("converts a real wall-clock appointment using the selected IANA zone", () => {
  assert.equal(localDateTimeToUtc("2027-03-14T03:00", "America/New_York"), "2027-03-14T07:00:00.000Z")
  assert.match(formatLocalDateTime("2027-03-14T07:00:00.000Z", "America/New_York"), /Mar 14, 2027/i)
})

test("rejects nonexistent and ambiguous daylight-saving local times", () => {
  assert.throws(() => localDateTimeToUtc("2027-03-14T02:30", "America/New_York"), /does not exist/i)
  assert.throws(() => localDateTimeToUtc("2027-11-07T01:30", "America/New_York"), /ambiguous/i)
})

test("validates time zones and calculates UTC duration deadlines", () => {
  assert.equal(assertIanaTimeZone("Europe/London"), "Europe/London")
  assert.throws(() => assertIanaTimeZone("Not/AZone"), /Invalid IANA/i)
  assert.equal(roundScheduleDeadline("2026-10-25T16:00:00.000Z", 60), "2026-10-25T17:00:00.000Z")
})

