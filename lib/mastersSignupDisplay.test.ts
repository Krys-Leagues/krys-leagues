import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  formatMastersAdminDateTime,
  formatMastersAdminTime,
  formatMastersOfficialDate,
  formatMastersPlayerDateTime,
  formatMastersPlayerSlot,
  formatMastersPlayerTime,
  formatMastersRoomCountdown,
  meaningfulMajorSlotLabel,
  PLAYER_LOCAL_TIME_HEADING,
} from "./mastersSignupDisplay.ts"

test("Masters room countdown uses the absolute start timestamp without seconds or negative values", () => {
  const now = Date.parse("2026-10-03T00:00:00.000Z")
  assert.equal(formatMastersRoomCountdown("2026-10-04T05:12:00.000Z", now), "1 DAY 5 HOURS 12 MINUTES")
  assert.equal(formatMastersRoomCountdown("2026-10-03T05:12:00.000Z", now), "5 HOURS 12 MINUTES")
  assert.equal(formatMastersRoomCountdown("2026-10-03T00:42:59.000Z", now), "42 MINUTES")
  assert.equal(formatMastersRoomCountdown("2026-10-03T00:00:59.000Z", now), "STARTING NOW")
  assert.equal(formatMastersRoomCountdown("2026-10-02T23:59:59.000Z", now), "ROOM STARTED")
})

test("the same room countdown is timezone-independent while local slot display remains DST-aware", () => {
  const start = "2026-10-04T00:00:00.000Z"
  const now = Date.parse("2026-10-03T23:18:00.000Z")
  assert.equal(formatMastersRoomCountdown(start, now), "42 MINUTES")
  assert.equal(formatMastersRoomCountdown(start, now), formatMastersRoomCountdown(start, now))
  const newSouthWales = formatMastersPlayerSlot(start, "2026-10-03", "Australia/Sydney")
  assert.equal(newSouthWales.date, "Sunday, October 4")
  assert.equal(newSouthWales.time, "11:00 AM")
  assert.equal(newSouthWales.dayShift, "Next day locally")
})

test("the local-time explanation is a single round-level heading", () => {
  assert.equal(PLAYER_LOCAL_TIME_HEADING, "AVAILABLE TIMES — SHOWN IN YOUR LOCAL TIME")
})

test("the redundant Available slot fallback is not rendered", () => {
  assert.equal(meaningfulMajorSlotLabel(null), null)
  assert.equal(meaningfulMajorSlotLabel(""), null)
  assert.equal(meaningfulMajorSlotLabel("Available"), null)
  assert.equal(meaningfulMajorSlotLabel("AVAILABLE"), null)
  assert.equal(meaningfulMajorSlotLabel("Early evening"), "Early evening")
})

test("Masters player times use the viewer timezone with 12-hour labels", () => {
  const instant = "2026-10-01T04:00:00.000Z"
  assert.equal(formatMastersPlayerTime(instant, "Europe/London", "en-GB"), "5:00 AM BST")
  assert.equal(formatMastersPlayerTime(instant, "America/New_York", "en-US"), "12:00 AM EDT")
  assert.equal(formatMastersPlayerTime(instant, "UTC", "en-US"), "4:00 AM UTC")
  assert.equal(formatMastersPlayerTime(instant, "Asia/Kolkata", "en-US"), "9:30 AM")
  assert.equal(instant, "2026-10-01T04:00:00.000Z")
})

test("Masters player times distinguish midnight and noon", () => {
  assert.equal(formatMastersPlayerTime("2026-10-01T04:00:00.000Z", "America/New_York"), "12:00 AM EDT")
  assert.equal(formatMastersPlayerTime("2026-10-01T16:00:00.000Z", "America/New_York"), "12:00 PM EDT")
})

test("Masters player slots preserve the official round while reporting local date rollover", () => {
  const previous = formatMastersPlayerSlot("2026-10-01T03:00:00.000Z", "2026-10-01", "America/Los_Angeles", "en-US")
  assert.equal(previous.date, "Wednesday, September 30")
  assert.equal(previous.dayShift, "Previous day locally")

  const next = formatMastersPlayerSlot("2026-10-02T03:00:00.000Z", "2026-10-01", "Europe/London", "en-GB")
  assert.equal(next.date, "Friday 2 October")
  assert.equal(next.dayShift, "Next day locally")
})

test("Masters October dates use the correct EDT and BST daylight-saving offsets", () => {
  for (const day of ["01", "02", "03", "04"]) {
    const instant = `2026-10-${day}T13:00:00.000Z`
    assert.equal(formatMastersPlayerTime(instant, "America/New_York"), "9:00 AM EDT")
    assert.equal(formatMastersPlayerTime(instant, "Europe/London"), "2:00 PM BST")
  }
  assert.equal(formatMastersPlayerDateTime("2026-10-01T13:00:00.000Z", "Europe/London", "en-GB"), "Thursday 1 October · 2:00 PM BST")
})

test("Masters admin times stay on the official Eastern date without GMT or UTC clutter", () => {
  const midnight = formatMastersAdminDateTime("2026-10-01T04:00:00.000Z")
  assert.equal(midnight, "Thursday, October 1, 2026 · 12:00 AM ET")
  assert.equal(formatMastersAdminTime("2026-10-01T16:00:00.000Z"), "12:00 PM ET")
  assert.doesNotMatch(midnight, /GMT|UTC|[+-]\d{2}:?\d{2}/u)
  assert.equal(formatMastersOfficialDate("2026-10-01"), "Thursday, October 1, 2026")
})

test("Masters schedule rendering is display-only and leaves the saved selection unchanged", () => {
  const selection = { slotId: "slot-1", startsAt: "2026-10-01T04:00:00.000Z" }
  const before = structuredClone(selection)
  formatMastersPlayerSlot(selection.startsAt, "2026-10-01", "Europe/London", "en-GB")
  formatMastersPlayerSlot(selection.startsAt, "2026-10-01", "Europe/London", "en-GB")
  assert.deepEqual(selection, before)
})

test("all player schedule and room surfaces share local-only formatting", async () => {
  const page = await readFile("app/majors/[slug]/page.tsx", "utf8")
  assert.ok((page.match(/formatMastersPlayerSlot\(/gu) || []).length >= 3)
  assert.doesNotMatch(page, /event time|Event reference time|GMT-4|UTC reference/iu)
})

test("admin Masters surfaces use Eastern display helpers without raw UTC references", async () => {
  const [scheduling, waitlist, verification] = await Promise.all([
    readFile("app/admin/majors/scheduling/page.tsx", "utf8"),
    readFile("app/admin/majors/waitlist/page.tsx", "utf8"),
    readFile("app/admin/majors/verification/page.tsx", "utf8"),
  ])
  assert.match(scheduling, /formatMastersAdminTime/)
  assert.match(waitlist, /formatMastersAdminDateTime/)
  assert.match(verification, /formatMastersAdminTime/)
  assert.doesNotMatch(scheduling, /UTC reference|UTC is shown/u)
})
