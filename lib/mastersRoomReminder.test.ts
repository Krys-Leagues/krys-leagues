import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import type { MajorDayChoice, MajorPlayDay, MajorRoomRosterMember } from "./majors.ts"
import {
  buildPublishedMastersRoomAssignments,
  dismissMastersRoomAssignment,
  mastersRoomAssignmentFingerprint,
  parseMastersRoomReminderDismissals,
  selectCurrentMastersRoomAssignment,
  shouldAutoOpenMastersRoomReminder,
} from "./mastersRoomReminder.ts"
import { formatMastersPlayerSlot } from "./mastersSignupDisplay.ts"

const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const entryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const day: MajorPlayDay = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  major_event_id: eventId,
  day_number: 1,
  label: "Round 1",
  play_date: "2026-10-01",
  choices_locked: false,
  selection_locks_at: null,
}

function roster(size: number): MajorRoomRosterMember[] {
  return Array.from({ length: size }, (_, index) => ({
    player_id: `${index + 1}`.padStart(8, "0") + "-1111-4111-8111-111111111111",
    player_screen_name_snapshot: `Player ${index + 1}`,
  }))
}

function choice(overrides: Partial<MajorDayChoice> = {}): MajorDayChoice {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    entry_id: entryId,
    play_day_id: day.id,
    time_slot_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    assignment_location: null,
    starts_at: "2026-10-01T04:00:00.000Z",
    group_label: "KMGM7",
    room_roster: roster(4),
    ...overrides,
  }
}

test("only complete published Masters rooms are eligible for the homepage reminder", () => {
  assert.equal(buildPublishedMastersRoomAssignments(eventId, [choice({ group_label: null })], [day]).length, 0)
  assert.equal(buildPublishedMastersRoomAssignments(eventId, [choice({ room_roster: roster(1) })], [day]).length, 0)
  assert.equal(buildPublishedMastersRoomAssignments(eventId, [choice({ room_roster: roster(5) })], [day]).length, 0)
  assert.equal(buildPublishedMastersRoomAssignments(eventId, [choice({ room_roster: roster(2) })], [day]).length, 1)
})

test("the complete 2-, 3-, and 4-player published room roster is preserved", () => {
  for (const size of [2, 3, 4]) {
    const [assignment] = buildPublishedMastersRoomAssignments(eventId, [choice({ room_roster: roster(size) })], [day])
    assert.equal(assignment.roster.length, size)
    assert.deepEqual(assignment.roster.map((member) => member.player_screen_name_snapshot), roster(size).map((member) => member.player_screen_name_snapshot))
  }
})

test("the next upcoming published assignment is selected", () => {
  const laterDay = { ...day, id: "ffffffff-ffff-4fff-8fff-ffffffffffff", day_number: 2 as const, label: "Round 2", play_date: "2026-10-02" }
  const assignments = buildPublishedMastersRoomAssignments(eventId, [
    choice(),
    choice({ id: "12121212-1212-4121-8121-121212121212", play_day_id: laterDay.id, starts_at: "2026-10-02T04:00:00.000Z" }),
  ], [day, laterDay])
  assert.equal(selectCurrentMastersRoomAssignment(assignments, Date.parse("2026-10-01T05:00:00.000Z"))?.roundLabel, "Friday — Round 2")
})

test("dismissal persists for the exact assignment and changed assignments auto-open", () => {
  const [assignment] = buildPublishedMastersRoomAssignments(eventId, [choice()], [day])
  assert.equal(shouldAutoOpenMastersRoomReminder(assignment, {}), true)
  const dismissed = dismissMastersRoomAssignment(assignment, {})
  assert.equal(shouldAutoOpenMastersRoomReminder(assignment, dismissed), false)

  const roomChanged = { ...assignment, groupLabel: "KMGM8" }
  const timeChanged = { ...assignment, timeSlotId: "13131313-1313-4131-8131-131313131313", startsAt: "2026-10-01T06:00:00.000Z" }
  const roundChanged = { ...assignment, playDayId: "14141414-1414-4141-8141-141414141414", dayNumber: 2 as const, roundLabel: "Round 2" }
  const rosterChanged = { ...assignment, roster: roster(3) }
  for (const changed of [roomChanged, timeChanged, roundChanged, rosterChanged]) {
    assert.notEqual(mastersRoomAssignmentFingerprint(changed), mastersRoomAssignmentFingerprint(assignment))
    assert.equal(shouldAutoOpenMastersRoomReminder(changed, dismissed), true)
  }
})

test("dismissal storage parsing is safe", () => {
  assert.deepEqual(parseMastersRoomReminderDismissals(null), {})
  assert.deepEqual(parseMastersRoomReminderDismissals("not-json"), {})
  assert.deepEqual(parseMastersRoomReminderDismissals('{"scope":"fingerprint","bad":2}'), { scope: "fingerprint" })
})

test("homepage room time uses local 12-hour display with timezone and rollover", () => {
  const london = formatMastersPlayerSlot("2026-10-01T04:00:00.000Z", "2026-10-01", "Europe/London")
  assert.equal(london.date, "Thursday, October 1")
  assert.match(london.time, /^5:00 AM BST$/)
  assert.equal(london.dayShift, "")

  const nextDay = formatMastersPlayerSlot("2026-10-02T04:00:00.000Z", "2026-10-01", "Europe/London")
  assert.equal(nextDay.dayShift, "Next day locally")
  assert.doesNotMatch(`${london.time} ${nextDay.time}`, /UTC|GMT[+-]|\b\d{2}:\d{2}\b/u)
})

test("homepage mount, close/reopen controls, full roster, and mobile guard remain present", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
  const component = readFileSync(new URL("../components/home/MastersRoomReminder.tsx", import.meta.url), "utf8")
  const css = readFileSync(new URL("../components/home/MastersRoomReminder.module.css", import.meta.url), "utf8")

  assert.match(home, /<MastersRoomReminder \/>/)
  assert.match(component, /SHOW MASTERS ROOM/)
  assert.match(component, /Close Masters room reminder/)
  assert.match(component, /assignment\.roster\.map/)
  assert.doesNotMatch(component, /\.roster\.(?:slice|splice)\(/)
  assert.match(component, /get_my_major_signup_schedule/)
  assert.match(component, /window\.localStorage/)
  assert.match(css, /@media \(max-width: 600px\)/)
  assert.match(css, /max-height: 68dvh/)
})
