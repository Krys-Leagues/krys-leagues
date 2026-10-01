import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { MAJOR_COURSES } from "./majors.ts"
import {
  CHERRY_MASTERS_STREAM_PARS,
  completedThrough,
  deriveHoleStrokesFromRunningTotal,
  formatRunningToPar,
  isStaleRevisionError,
  mastersStreamCourseForRound,
  moveStreamParticipant,
  orderStreamParticipants,
  nineHoleRows,
  runningToPar,
  runningToParThrough,
  updateLocalHoleScores,
} from "./mastersStreamScorecard.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20261001183000_masters_live_stream_scorecard.sql", import.meta.url),
  "utf8",
)
const runningTotalMigration = readFileSync(
  new URL("../supabase/migrations/20261001210856_masters_stream_running_total_controls.sql", import.meta.url),
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
const fireworksDisplay = readFileSync(
  new URL("../app/majors/masters-stream/[sessionId]/fireworks/page.tsx", import.meta.url),
  "utf8",
)
const fireworksView = readFileSync(
  new URL("../components/masters/MastersHioFireworksView.tsx", import.meta.url),
  "utf8",
)
const fireworksCss = readFileSync(
  new URL("../components/masters/MastersHioFireworksView.module.css", import.meta.url),
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

test("Dawn's running-total changes derive the correct current-hole strokes", () => {
  assert.equal(deriveHoleStrokesFromRunningTotal(0, -2, 3), 1)
  assert.equal(deriveHoleStrokesFromRunningTotal(0, -1, 3), 2)
  assert.equal(deriveHoleStrokesFromRunningTotal(0, 0, 3), 3)
  assert.equal(deriveHoleStrokesFromRunningTotal(0, 1, 3), 4)
  assert.equal(deriveHoleStrokesFromRunningTotal(-4, -6, 3), 1)
  assert.equal(deriveHoleStrokesFromRunningTotal(-4, -5, 3), 2)
  assert.equal(deriveHoleStrokesFromRunningTotal(-4, -4, 3), 3)
  assert.equal(deriveHoleStrokesFromRunningTotal(-4, -3, 3), 4)
  assert.equal(deriveHoleStrokesFromRunningTotal(2, 0, 4), 2)
  assert.equal(deriveHoleStrokesFromRunningTotal(2, 2, 4), 4)
})

test("running total through the previous hole excludes the current and later holes", () => {
  const scores = [
    { participant_id: "p1", hole_number: 1, strokes: 2 },
    { participant_id: "p1", hole_number: 2, strokes: 4 },
    { participant_id: "p1", hole_number: 3, strokes: 1 },
  ]
  assert.equal(runningToParThrough(scores, "p1", [3, 4, 3], 1), -1)
  assert.equal(runningToParThrough(scores, "p1", [3, 4, 3], 2), -1)
  assert.equal(runningToParThrough(scores, "p1", [3, 4, 3], 3), -3)
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

test("an earlier-hole correction recalculates the total without changing later holes", () => {
  const before = [
    { participant_id: "p1", hole_number: 1, strokes: 3 },
    { participant_id: "p1", hole_number: 2, strokes: 4 },
    { participant_id: "p1", hole_number: 3, strokes: 3 },
    { participant_id: "p1", hole_number: 4, strokes: 5 },
    { participant_id: "p1", hole_number: 5, strokes: 3 },
  ]
  const after = updateLocalHoleScores(before, 4, { p1: 3 })
  assert.equal(after.find((score) => score.hole_number === 5)?.strokes, 3)
  assert.equal(runningToPar(before, "p1", [3, 4, 3, 4, 3]), 1)
  assert.equal(runningToPar(after, "p1", [3, 4, 3, 4, 3]), -1)
})

test("broadcast player order moves names while scores remain attached to participant ids", () => {
  const participants = [
    { id: "duardy", name: "DUARDY" },
    { id: "el-jorge", name: "EL JORGE" },
    { id: "yuk1n", name: "YUK1N" },
  ]
  const scores = new Map([["duardy", -4], ["el-jorge", -2], ["yuk1n", -6]])
  const holeScores = new Map([["duardy:1", 2], ["el-jorge:1", 3], ["yuk1n:1", 1]])
  const firstMove = moveStreamParticipant(participants, "yuk1n", -1)
  const reordered = moveStreamParticipant(firstMove, "yuk1n", -1)
  assert.deepEqual(reordered.map((participant) => participant.name), ["YUK1N", "DUARDY", "EL JORGE"])
  assert.deepEqual(reordered.map((participant) => scores.get(participant.id)), [-6, -4, -2])
  assert.deepEqual(reordered.map((participant) => holeScores.get(`${participant.id}:1`)), [1, 2, 3])
  assert.deepEqual(moveStreamParticipant(participants.slice(0, 2), "duardy", 1).map((player) => player.id), ["el-jorge", "duardy"])
  assert.deepEqual(moveStreamParticipant([...participants, { id: "fourth", name: "FOURTH" }], "fourth", -1).map((player) => player.id), ["duardy", "el-jorge", "fourth", "yuk1n"])
  assert.deepEqual(
    orderStreamParticipants(
      participants.map((participant, index) => ({ ...participant, position: index + 1 })),
      ["yuk1n", "duardy", "el-jorge"],
    ).map((participant) => participant.name),
    ["YUK1N", "DUARDY", "EL JORGE"],
  )
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
  const migrations = `${migration}\n${runningTotalMigration}`
  assert.doesNotMatch(migrations, /(insert into|update|delete from) public\.major_player_scorecards/i)
  assert.doesNotMatch(migrations, /(insert into|update|delete from) public\.major_scorecard_holes/i)
  assert.doesNotMatch(migrations, /(insert into|update|delete from) public\.major_results/i)
  assert.doesNotMatch(migrations, /(insert into|update|delete from) public\.major_result_snapshots/i)
  assert.doesNotMatch(controller, /major_player_scorecards|major_scorecard_holes|major_results/)
})

test("corrections target an explicit hole while the current-hole pointer stays independent", () => {
  assert.match(runningTotalMigration, /score_hole_number := coalesce\(\(score_item ->> 'hole_number'\)::integer, p_current_hole\)/i)
  assert.match(runningTotalMigration, /hole_number = score_hole_number/i)
  assert.match(runningTotalMigration, /values \(p_session_id, score_participant_id, score_hole_number, score_value\)/i)
  assert.match(runningTotalMigration, /set current_hole = p_current_hole/i)
  assert.match(runningTotalMigration, /public\.is_current_user_site_admin\(\)/i)
  assert.match(runningTotalMigration, /STALE_STREAM_REVISION/)
})

test("player order is a protected persistent stream-only permutation", () => {
  assert.match(runningTotalMigration, /reorder_masters_stream_participants/i)
  assert.match(runningTotalMigration, /pg_catalog\.cardinality\(p_participant_ids\) <> session_record\.participant_count/i)
  assert.match(runningTotalMigration, /each broadcast participant exactly once/i)
  assert.match(runningTotalMigration, /set stream_participant_order = p_participant_ids/i)
  assert.match(runningTotalMigration, /order by coalesce\(\s*pg_catalog\.array_position\(session\.stream_participant_order, participant\.id\)/i)
  assert.match(runningTotalMigration, /public\.is_current_user_site_admin\(\)/i)
  assert.match(migration, /order by participant\.position/i)
  assert.doesNotMatch(runningTotalMigration, /(insert into|update|delete from) public\.major_schedule_group_members/i)
  assert.doesNotMatch(runningTotalMigration, /(insert into|update|delete from) public\.major_entries/i)
  assert.match(controller, /PLAYER ORDER/)
  assert.match(controller, /Move \$\{participant\.player_screen_name_snapshot\} up/)
  assert.match(controller, /Move \$\{participant\.player_screen_name_snapshot\} down/)
})

test("stream controller is protected, deliberate, persistent, and phone friendly", () => {
  assert.match(migration, /public\.is_current_user_site_admin\(\)/i)
  assert.match(migration, /raise exception 'Administrator authorization is required'/i)
  assert.match(controller, /Confirm LOAD ROOM/)
  assert.match(controller, /p_confirmed: true/)
  assert.match(controller, /setInterval\(\(\) => \{/)
  assert.match(controller, /1500/)
  assert.match(controller, /Nothing here writes official player scores or results/)
  assert.match(controllerCss, /@media\s*\(max-width:\s*700px\)/)
  assert.match(controllerCss, /min-height:\s*46px/)
  assert.match(controller, /Running to par/)
  assert.match(controller, /CONFIRM PAR/)
  assert.match(controller, /SCORECARD \/ CORRECTIONS/)
  assert.match(controller, /hole_number: holeNumber/)
})

test("scorecard OBS route is display-only, compact, transparent, and front/back aware", () => {
  assert.doesNotMatch(display, /SUPABASE_SECRET|SERVICE_ROLE|LOAD ROOM|update_masters_stream_scorecard/)
  assert.match(display, /setInterval\(\(\) => void refresh\(\), 850\)/)
  assert.match(displayView, /FRONT NINE/)
  assert.match(displayView, /BACK NINE/)
  assert.match(displayCss, /background:\s*transparent\s*!important/)
  assert.match(displayCss, /activeHole/)
  assert.match(displayCss, /activeScore/)
  assert.match(displayCss, /width:\s*min\(900px/)
  assert.match(displayView, /krys-leagues-logo-source\.png/)
  assert.doesNotMatch(display, /fireworks_sequence|setFireworks|HOLE IN ONE/)
  assert.doesNotMatch(displayView, /fireworks|HOLE IN ONE/)
  assert.doesNotMatch(displayCss, /text-overflow:\s*ellipsis|white-space:\s*nowrap/)
})

test("fireworks OBS route is independent, full-frame, transparent when idle, and auto-resets", () => {
  assert.match(fireworksDisplay, /fireworks_sequence/)
  assert.match(fireworksDisplay, /setInterval\(\(\) => void refresh\(\), 350\)/)
  assert.match(fireworksDisplay, /setTimeout\(\(\) => setCelebrationKey\(null\), 3000\)/)
  assert.match(fireworksView, /celebrationKey != null/)
  assert.match(fireworksView, /HOLE IN ONE!/)
  assert.match(fireworksCss, /width:\s*100vw/)
  assert.match(fireworksCss, /height:\s*100vh/)
  assert.match(fireworksCss, /background:\s*transparent/)
  assert.doesNotMatch(fireworksDisplay, /MastersStreamScorecardView/)
  assert.doesNotMatch(fireworksView, /player_screen_name|TO PAR|FRONT NINE|BACK NINE/)
  assert.match(controller, /\/majors\/masters-stream\/\{session\.id\}\/fireworks/)
  assert.match(controller, /920 × 420/)
  assert.match(controller, /1920 × 1080/)
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
