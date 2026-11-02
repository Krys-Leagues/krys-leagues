import test from "node:test"
import assert from "node:assert/strict"
import { formatMajorLocalDateTime, formatMajorLocalTimeWithZone, isValidIanaTimeZone } from "../../lib/majorTimeZone.ts"

const NEW_YORK_FOUR_PM = "2026-11-12T21:00:00.000Z"

test("formats the same UTC instant in each requested admin timezone", () => {
  assert.match(formatMajorLocalTimeWithZone(NEW_YORK_FOUR_PM, "America/New_York"), /4:00 PM/)
  assert.match(formatMajorLocalTimeWithZone(NEW_YORK_FOUR_PM, "Europe/London"), /9:00 PM/)
  assert.match(formatMajorLocalTimeWithZone(NEW_YORK_FOUR_PM, "Europe/Madrid"), /10:00 PM/)
})

test("preserves the local date when an event slot crosses midnight", () => {
  assert.match(formatMajorLocalDateTime("2026-11-13T04:00:00.000Z", "Europe/London"), /Nov 13, 2026/)
  assert.match(formatMajorLocalDateTime("2026-11-13T04:00:00.000Z", "America/New_York"), /Nov 12, 2026/)
})

test("uses IANA timezone identifiers and keeps DST rules attached to the zone", () => {
  assert.equal(isValidIanaTimeZone("America/New_York"), true)
  assert.equal(isValidIanaTimeZone("Europe/London"), true)
  assert.equal(isValidIanaTimeZone("UTC-5"), false)
  assert.match(formatMajorLocalTimeWithZone("2026-11-01T05:00:00.000Z", "America/New_York"), /1:00 AM.*EDT/)
  assert.match(formatMajorLocalTimeWithZone("2026-11-01T06:00:00.000Z", "America/New_York"), /1:00 AM.*EST/)
})
