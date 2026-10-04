import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import type { MajorDayChoice, MajorPlayDay, MajorRoomRosterMember } from "./majors.ts"
import {
  buildPublishedMastersRoomAssignments,
  dismissMastersRoomAssignment,
  hasEligibleMastersRoomExperience,
  mastersRoomAssignmentFingerprint,
  parseMastersRoomReminderDismissals,
  selectCurrentMastersRoomAssignment,
  shouldRenderMastersRoomReminderOnPath,
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
    group_instructions: null,
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

function twoPublishedAssignments() {
  const laterDay = { ...day, id: "ffffffff-ffff-4fff-8fff-ffffffffffff", day_number: 2 as const, label: "Round 2", play_date: "2026-10-02" }
  return buildPublishedMastersRoomAssignments(eventId, [
    choice(),
    choice({ id: "12121212-1212-4121-8121-121212121212", play_day_id: laterDay.id, starts_at: "2026-10-02T04:00:00.000Z" }),
  ], [day, laterDay])
}

test("the next room follows the schedule clock instead of unfinished scorecards", () => {
  const assignments = twoPublishedAssignments()
  const afterRoundOne = Date.parse("2026-10-01T12:00:00.000Z")
  assert.equal(selectCurrentMastersRoomAssignment(assignments, afterRoundOne)?.dayNumber, 2)
})

test("submitted or verified status does not change the scheduled next room", () => {
  const assignments = twoPublishedAssignments()
  const beforeRoundOne = Date.parse("2026-10-01T03:00:00.000Z")
  assert.equal(selectCurrentMastersRoomAssignment(assignments, beforeRoundOne)?.dayNumber, 1)
})

test("missed earlier rounds do not block a later scheduled room", () => {
  const assignments = twoPublishedAssignments()
  const afterRoundOne = Date.parse("2026-10-02T03:00:00.000Z")
  assert.equal(selectCurrentMastersRoomAssignment(assignments, afterRoundOne)?.dayNumber, 2)
})

test("future room times and midnight changes cannot advance an unfinished earlier round", () => {
  const assignments = twoPublishedAssignments().map((assignment, index) => ({
    ...assignment,
    startsAt: index === 0 ? "2026-09-30T23:59:00.000Z" : "2026-10-01T00:01:00.000Z",
  }))
  assert.equal(selectCurrentMastersRoomAssignment(assignments, Date.parse("2026-09-30T23:00:00.000Z"))?.dayNumber, 1)
  assert.equal(selectCurrentMastersRoomAssignment(assignments, Date.parse("2026-09-30T23:00:00.000Z"))?.dayNumber, 1)
})

test("a published room with no later assignment remains the available room", () => {
  const [roundOne] = twoPublishedAssignments()
  assert.equal(selectCurrentMastersRoomAssignment([roundOne], Date.parse("2026-10-03T00:00:00.000Z"))?.dayNumber, 1)
})

test("a started room remains visible when it is the player's only assignment", () => {
  const [roundOne] = twoPublishedAssignments()
  assert.equal(selectCurrentMastersRoomAssignment([roundOne], Date.parse("2026-10-01T04:00:00.000Z"))?.groupLabel, "KMGM7")
})

test("the latest started published room is the fallback when no future room exists", () => {
  const assignments = twoPublishedAssignments()
  const selected = selectCurrentMastersRoomAssignment(assignments, Date.parse("2026-10-03T00:00:00.000Z"))
  assert.equal(selected?.dayNumber, 2)
})

test("a future room takes priority over older started rooms", () => {
  const assignments = twoPublishedAssignments()
  const selected = selectCurrentMastersRoomAssignment(assignments, Date.parse("2026-10-01T12:00:00.000Z"))
  assert.equal(selected?.dayNumber, 2)
})

test("a final round room remains visible at and after its start", () => {
  const finalDay = { ...day, id: "22222222-2222-4222-8222-222222222222", day_number: 4 as const, label: "Final Round", play_date: "2026-10-04" }
  const [finalRound] = buildPublishedMastersRoomAssignments(eventId, [choice({ play_day_id: finalDay.id, starts_at: "2026-10-04T04:00:00.000Z" })], [finalDay])
  assert.equal(selectCurrentMastersRoomAssignment([finalRound], Date.parse("2026-10-04T04:00:00.000Z"))?.dayNumber, 4)
  assert.equal(selectCurrentMastersRoomAssignment([finalRound], Date.parse("2026-10-05T04:00:00.000Z"))?.roundLabel, "Sunday — Final Round")
})

test("an eligible player keeps the Masters entry point when no next room is published", () => {
  const schedule = [choice({ group_label: null, room_roster: [] })]
  assert.equal(hasEligibleMastersRoomExperience(schedule), true)
  assert.equal(buildPublishedMastersRoomAssignments(eventId, schedule, [day]).length, 0)
})

test("the selected assignment retains the exact round and play-day score route", () => {
  const assignments = twoPublishedAssignments()
  const selected = selectCurrentMastersRoomAssignment(assignments, Date.parse("2026-10-01T12:00:00.000Z"))
  assert.equal(selected?.dayNumber, 2)
  assert.equal(selected?.playDayId, "ffffffff-ffff-4fff-8fff-ffffffffffff")
})

test("visit-scoped dismissal closes the exact assignment and changed assignments auto-open", () => {
  const [assignment] = buildPublishedMastersRoomAssignments(eventId, [choice()], [day])
  assert.equal(shouldAutoOpenMastersRoomReminder(assignment, {}), true)
  const dismissed = dismissMastersRoomAssignment(assignment, {})
  assert.equal(shouldAutoOpenMastersRoomReminder(assignment, dismissed), false)

  const roomChanged = { ...assignment, groupLabel: "KMGM8" }
  const timeChanged = { ...assignment, timeSlotId: "13131313-1313-4131-8131-131313131313", startsAt: "2026-10-01T06:00:00.000Z" }
  const roundChanged = { ...assignment, playDayId: "14141414-1414-4141-8141-141414141414", dayNumber: 2 as const, roundLabel: "Round 2" }
  const rosterChanged = { ...assignment, roster: roster(3) }
  const instructionsChanged = { ...assignment, instructions: "Meet in the lobby 10 minutes early." }
  assert.doesNotMatch(mastersRoomAssignmentFingerprint(assignment), /instructions/)
  assert.match(mastersRoomAssignmentFingerprint(instructionsChanged), /Meet in the lobby 10 minutes early/)
  for (const changed of [roomChanged, timeChanged, roundChanged, rosterChanged, instructionsChanged]) {
    assert.notEqual(mastersRoomAssignmentFingerprint(changed), mastersRoomAssignmentFingerprint(assignment))
    assert.equal(shouldAutoOpenMastersRoomReminder(changed, dismissed), true)
  }
})

test("dismissal storage parsing is safe", () => {
  assert.deepEqual(parseMastersRoomReminderDismissals(null), {})
  assert.deepEqual(parseMastersRoomReminderDismissals("not-json"), {})
  assert.deepEqual(parseMastersRoomReminderDismissals('{"scope":"fingerprint","bad":2}'), { scope: "fingerprint" })
})

test("the shared reminder renders on normal routes and stays out of admin, auth, and access-error routes", () => {
  for (const path of [
    "/",
    "/majors/masters",
    "/majors/masters/scoring",
    "/player-dashboard",
    "/players/player-id",
    "/league-play",
    "/stroke",
    "/course-challenges/cherry-blossom",
    "/records",
  ]) {
    assert.equal(shouldRenderMastersRoomReminderOnPath(path), true, path)
  }

  for (const path of [
    "/admin",
    "/admin/majors/scheduling",
    "/auth/callback",
    "/access-denied",
    "/testing-access",
    "/api/records/public",
  ]) {
    assert.equal(shouldRenderMastersRoomReminderOnPath(path), false, path)
  }
  assert.equal(shouldRenderMastersRoomReminderOnPath(null), false)
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

test("the reminder has one global mount with cross-route state, full roster, and mobile navigation clearance", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
  const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")
  const component = readFileSync(new URL("../components/home/MastersRoomReminder.tsx", import.meta.url), "utf8")
  const css = readFileSync(new URL("../components/home/MastersRoomReminder.module.css", import.meta.url), "utf8")

  assert.doesNotMatch(home, /MastersRoomReminder/)
  assert.equal(rootLayout.match(/<MastersRoomReminder \/>/g)?.length, 1)
  assert.match(component, /SHOW MASTERS ROOM/)
  assert.match(component, /OPEN MINI GOLF MASTERS/)
  assert.match(component, /NO NEXT ROOM YET/)
  assert.match(component, /hasEligibleMastersRoomExperience\(schedule\)/)
  assert.match(component, /OPEN MASTERS PLAYER PAGE/)
  assert.match(component, /Close Masters room reminder/)
  assert.match(component, /usePathname/)
  assert.match(component, /refreshAssignment\(true\)/)
  assert.match(component, /assignment\.roster\.map/)
  assert.match(component, /assignment\.instructions &&/)
  assert.match(component, /ROOM INSTRUCTIONS/)
  assert.match(component, /isMastersScoringRoute/)
  assert.match(component, /styles\.scoringDock/)
  assert.match(component, /styles\.scoringCard/)
  assert.doesNotMatch(component, /\.roster\.(?:slice|splice)\(/)
  assert.match(component, /get_my_major_signup_schedule/)
  assert.match(component, /selectCurrentMastersRoomAssignment\(\s*assignments,\s*Date\.now\(\)/)
  assert.doesNotMatch(component, /get_my_major_scorecards/)
  assert.match(component, /MASTERS_CATALOG_CACHE_MS = 5 \* 60_000/)
  assert.match(component, /lastSessionToken\.current === session\.access_token/)
  assert.doesNotMatch(component, /supabase\.auth\.getUser\(\)/)
  assert.match(component, /playDayId=\$\{encodeURIComponent\(assignment\.playDayId\)\}/)
  assert.match(component, /window\.sessionStorage/)
  assert.doesNotMatch(component, /window\.localStorage/)
  assert.match(component, /ENTER ROUND \{assignment\.dayNumber\} SCORES/)
  assert.match(component, /VIEW INSTRUCTIONS & RULES/)
  assert.doesNotMatch(component, /VIEW LIVE MASTERS SCORE TRACKER/)
  assert.match(component, /CONTACT ADMIN/)
  assert.match(component, /formatMastersRoomCountdown/)
  assert.match(component, /setInterval\(\(\) => setCountdownNow\(Date\.now\(\)\), 60_000\)/u)
  assert.match(component, /window\.clearInterval\(timerId\)/u)
  assert.match(component, /ROOM STARTS IN:/)
  assert.match(css, /\.countdown[\s\S]*?background: rgba\(0, 0, 0, 0\.2\)/)
  assert.match(css, /right: max\(16px, env\(safe-area-inset-right\)\)/)
  assert.doesNotMatch(css, /left: max\(16px, env\(safe-area-inset-left\)\)/)
  assert.match(css, /@media \(max-width: 600px\)/)
  assert.match(css, /max-height: 58dvh/)
  assert.match(css, /bottom: max\(72px/)
  assert.match(css, /pointer-events: none/)
  assert.match(css, /\.scoringDock,[\s\S]*?position: static/)
  assert.match(css, /\.scoringDock \.launcher[\s\S]*?min-height: 36px/)
})

test("published instructions are trimmed and blank instructions stay hidden", () => {
  const [withInstructions] = buildPublishedMastersRoomAssignments(eventId, [choice({ group_instructions: "  Meet early.  " })], [day])
  const [blank] = buildPublishedMastersRoomAssignments(eventId, [choice({ group_instructions: "   " })], [day])
  assert.equal(withInstructions.instructions, "Meet early.")
  assert.equal(blank.instructions, null)
})
