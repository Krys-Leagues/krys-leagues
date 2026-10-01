import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { MAJOR_COURSES } from "./majors.ts"
import {
  CHERRY_MASTERS_STREAM_PARS,
  completedThrough,
  formatRunningToPar,
  isStaleRevisionError,
  mastersStreamCourseForRound,
  nineHoleRows,
  runningToPar,
  updateLocalHoleScores,
} from "./mastersStreamScorecard.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20261001183000_masters_live_stream_scorecard.sql", import.meta.url),
  "utf8",
)
const controller = readFileSync(
  new URL("../app/admin/majors/stream-scorecard/page.tsx", import.meta.url),
  "utf8",
)
const controllerCss = readFileSync(
  new URL("../app/admin/majors/stream-scorecard/page.module.css", import.meta.url),
  "utf8",
)
const display = readFileSync(
  new URL("../app/majors/masters-stream/[sessionId]/page.tsx", import.meta.url),
  "utf8",
)
const displayView = readFileSync(
  new URL("../components/masters/MastersStreamScorecardView.tsx", import.meta.url),
  "utf8",
)
const displayCss = readFileSync(
  new URL("../components/masters/MastersStreamScorecardView.module.css", import.meta.url),
  "utf8",
)
const legacyController = readFileSync(
  new URL("../app/admin/majors/scoring/page.tsx", import.meta.url),
  "utf8",
)
const legacyDisplay = readFileSync(
  new URL("../app/majors/live/[sessionId]/[view]/page.tsx", import.meta.url),
  "utf8",
)
const liveAnnouncementGuard = readFileSync(new URL("./mastersLiveAnnouncement.ts", import.meta.url), "utf8")
const roomReminderGuard = readFileSync(new URL("./mastersRoomReminder.ts", import.meta.url), "utf8")
const optionalSignIn = readFileSync(new URL("../components/auth/OptionalSignInWelcome.tsx", import.meta.url), "utf8")
const courseChallengeAlert = readFileSync(new URL("../components/admin/CourseChallengePendingAlert.tsx", import.meta.url), "utf8")
const mastersVerificationAlert = readFileSync(new URL("../components/admin/MastersVerificationPendingAlert.tsx", import.meta.url), "utf8")

test("stream courses use the existing authoritative Cherry Blossom configuration", () => {
  assert.equal(CHERRY_MASTERS_STREAM_PARS.CBE, MAJOR_COURSES.CBE.pars)
  assert.equal(CHERRY_MASTERS_STREAM_PARS.CBH, MAJOR_COURSES.CBH.pars)
  assert.deepEqual(mastersStreamCourseForRound(1), { code: "CBE", ...MAJOR_COURSES.CBE })
  assert.deepEqual(mastersStreamCourseForRound(2), { code: "CBE", ...MAJOR_COURSES.CBE })
  assert.deepEqual(mastersStreamCourseForRound(3), { code: "CBH", ...MAJOR_COURSES.CBH })
  assert.deepEqual(mastersStreamCourseForRound(4), { code: "CBH", ...MAJOR_COURSES.CBH })
  assert.equal(MAJOR_COURSES.CBE.pars.length, 18)
  assert.equal(MAJOR_COURSES.CBE.pars.reduce((sum, par) => sum + par, 0), 63)
})

test("running to-par supports negative, even, positive, and full 18-hole totals", () => {
  const oneUnder = MAJOR_COURSES.CBE.pars.map((par, index) => ({
    participant_id: "p1",
    hole_number: index + 1,
    strokes: index === 0 ? par - 1 : par,
  }))
  assert.equal(runningToPar(oneUnder, "p1", MAJOR_COURSES.CBE.pars), -1)
  assert.equal(formatRunningToPar(-2), "-2")
  assert.equal(formatRunningToPar(0), "E")
  assert.equal(formatRunningToPar(3), "+3")
})

test("front/back nine selection covers holes 1, 9, 10, and 18", () => {
  assert.deepEqual(nineHoleRows(1), [1,2,3,4,5,6,7,8,9])
  assert.deepEqual(nineHoleRows(9), [1,2,3,4,5,6,7,8,9])
  assert.deepEqual(nineHoleRows(10), [10,11,12,13,14,15,16,17,18])
  assert.deepEqual(nineHoleRows(18), [10,11,12,13,14,15,16,17,18])
})

test("corrections and contiguous completed-through state remain deterministic", () => {
  const first = updateLocalHoleScores([], 1, { p1: 2, p2: 3 })
  const corrected = updateLocalHoleScores(first, 1, { p1: 1, p2: null })
  assert.deepEqual(corrected, [{ participant_id: "p1", hole_number: 1, strokes: 1 }])
  assert.equal(completedThrough([...corrected, { participant_id: "p1", hole_number: 2, strokes: 4 }], "p1"), 2)
  assert.equal(completedThrough([...corrected, { participant_id: "p1", hole_number: 3, strokes: 3 }], "p1"), 1)
})

test("stale desktop or phone writes are recognized", () => {
  assert.equal(isStaleRevisionError("STALE_STREAM_REVISION"), true)
  assert.equal(isStaleRevisionError("could not serialize access due to concurrent update"), true)
  assert.equal(isStaleRevisionError("other failure"), false)
})

test("migration supports exact published 2-4 player rooms and UUID room identity", () => {
  assert.match(migration, /participant_count between 2 and 4/i)
  assert.match(migration, /position between 1 and 4/i)
  assert.match(migration, /room\.is_published/i)
  assert.match(migration, /entry\.status in \('registered', 'confirmed'\)/i)
  assert.match(migration, /schedule_group_id uuid references public\.major_schedule_groups\(id\)/i)
  assert.match(migration, /play_day_id uuid references public\.major_play_days\(id\)/i)
  assert.match(migration, /major_scoring_sessions_schedule_group_unique/i)
  assert.doesNotMatch(migration, /unique\s*\([^)]*group_label/i)
})

test("room loading validates authoritative course data and isolates active stream sessions", () => {
  assert.match(controller, /mastersStreamCourseForRound\(room\.day_number\)/)
  assert.match(controller, /p_course_code: course\.code/)
  assert.match(controller, /p_hole_pars: \[\.\.\.course\.pars\]/)
  assert.match(migration, /Course configuration does not match the authoritative Masters round configuration/)
  assert.match(migration, /schedule_group_id is not null\s+and \(is_active or is_public\)/i)
  assert.doesNotMatch(migration, /where is_active or is_public;/i)
})

test("revision locking prevents stale writes and inactive room controllers from writing", () => {
  assert.match(migration, /session_record\.revision <> p_expected_revision/i)
  assert.match(migration, /STALE_STREAM_REVISION/)
  assert.match(migration, /not session_record\.is_active or not session_record\.is_public/i)
  assert.match(controller, /p_expected_revision: session\.revision/)
  assert.match(controller, /Another controller changed the scorecard/)
})

test("broadcast migration never writes official Masters scoring or result tables", () => {
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_player_scorecards/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_scorecard_holes/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_results/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_result_snapshots/i)
  assert.doesNotMatch(controller, /major_player_scorecards|major_scorecard_holes|major_results/)
})

test("stream controller is protected, deliberate, persistent, and phone friendly", () => {
  assert.match(migration, /public\.is_current_user_site_admin\(\)/i)
  assert.match(migration, /raise exception 'Administrator authorization is required'/i)
  assert.match(controller, /Confirm LOAD ROOM/)
  assert.match(controller, /p_confirmed: true/)
  assert.match(controller, /setInterval\(\(\) => \{/)
  assert.match(controller, /1500/)
  assert.match(controller, /Nothing here writes official player scores or results/)
  assert.match(controllerCss, /@media\(max-width:700px\)/)
  assert.match(controllerCss, /min-height:46px/)
})

test("OBS route is display-only, transparent, automatic, and front/back aware", () => {
  assert.doesNotMatch(display, /SUPABASE_SECRET|SERVICE_ROLE|LOAD ROOM|update_masters_stream_scorecard/)
  assert.match(display, /setInterval\(\(\) => void refresh\(\), 850\)/)
  assert.match(displayView, /FRONT NINE/)
  assert.match(displayView, /BACK NINE/)
  assert.match(display, /fireworks_sequence/)
  assert.match(displayCss, /background:transparent!important/)
  assert.match(displayCss, /activeHole/)
  assert.match(displayCss, /activeScore/)
})

test("OBS route suppresses global site popups without changing normal public pages", () => {
  for (const source of [liveAnnouncementGuard, roomReminderGuard, optionalSignIn, courseChallengeAlert, mastersVerificationAlert]) {
    assert.match(source, /\/majors\/masters-stream/)
  }
  assert.doesNotMatch(displayView, /MastersRoomReminder|MastersLiveAnnouncement|OptionalSignInWelcome/)
})

test("existing generic Major scoring controller and display remain available", () => {
  assert.match(legacyController, /Live Major Scoring/)
  assert.match(legacyController, /loadProtectedAdminGlobalPlayers/)
  assert.match(legacyController, /Create scoring session/)
  assert.match(legacyDisplay, /MajorLiveScoreboardPage/)
  assert.match(legacyDisplay, /compact/)
  assert.match(legacyDisplay, /large/)
  assert.doesNotMatch(legacyController, /MastersStreamControllerPage/)
  assert.doesNotMatch(legacyDisplay, /HIO FIREWORKS/)
})
