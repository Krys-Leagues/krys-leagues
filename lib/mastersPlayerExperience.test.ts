import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { MAJOR_COURSES, type MajorPlayerScoringRound, type MajorPublishedRoom } from "./majors.ts"
import {
  MASTERS_SCORE_CLOSE_AFTER_LAST_ROOM_MS,
  MASTERS_SCORE_PRESHOW_MS,
  mastersCourseForRound,
  mastersRoundAccessState,
  mastersScoreTotal,
  nextMastersScoreAccessTransition,
  shouldAdvanceMastersHole,
  sortMastersPublishedRooms,
  visibleMastersScoringRounds,
} from "./mastersPlayerExperience.ts"

const migration = readFileSync(new URL("../supabase/migrations/20261003100000_masters_remove_player_score_cutoff.sql", import.meta.url), "utf8")
const roomRulesMigration = readFileSync(new URL("../supabase/migrations/20260930190131_masters_player_rooms_rules_and_scoring_access.sql", import.meta.url), "utf8")
const adminPolicyMigration = readFileSync(new URL("../supabase/migrations/20260930235900_scope_major_admin_policies_to_authenticated.sql", import.meta.url), "utf8")
const mastersPage = readFileSync(new URL("../app/majors/[slug]/page.tsx", import.meta.url), "utf8")
const scoringPage = readFileSync(new URL("../app/majors/[slug]/scoring/page.tsx", import.meta.url), "utf8")
const scoreSubmitRoute = readFileSync(new URL("../app/api/majors/scorecards/submit/route.ts", import.meta.url), "utf8")
const scorecardPhoto = readFileSync(new URL("../components/majors/MajorRoomScorecardPhoto.tsx", import.meta.url), "utf8")
const sharedViewer = readFileSync(new URL("../components/scorecards/ScorecardZoomViewer.tsx", import.meta.url), "utf8")
const adminScheduling = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")

function round(overrides: Partial<MajorPlayerScoringRound> = {}): MajorPlayerScoringRound {
  return {
    id: null,
    major_event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    play_day_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    entry_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    player_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    player_screen_name_snapshot: "PRINCESS_BANKSHOT",
    course_code: "CBE",
    status: null,
    submitted_at: null,
    submitted_by: null,
    verified_at: null,
    verified_by: null,
    verifier_screen_name: null,
    verification_notes: null,
    total_strokes: null,
    score_to_par: null,
    slot_starts_at: null,
    room_label: "KMGM1",
    room_group_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    room_instructions: null,
    room_roster: [],
    weekend_field: "qualifying",
    day_number: 1,
    day_label: "Round 1",
    play_date: "2026-10-01",
    holes: [],
    scoring_entry_open: false,
    score_access_state: "hidden",
    score_visible_at: "2026-10-01T01:00:00.000Z",
    room_start_at: "2026-10-01T04:00:00.000Z",
    round_closes_at: "2026-10-02T05:00:00.000Z",
    ...overrides,
  }
}

function room(groupLabel: string, startsAt: string, rosterSize: number, isMyRoom = false): MajorPublishedRoom {
  return {
    group_id: groupLabel,
    play_day_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    day_number: 1,
    day_label: "Round 1",
    play_date: "2026-10-01",
    starts_at: startsAt,
    group_label: groupLabel,
    competition: "qualifying",
    roster: Array.from({ length: rosterSize }, (_, index) => ({
      player_id: `${index + 1}`.padStart(8, "0") + "-1111-4111-8111-111111111111",
      player_screen_name_snapshot: `Player ${index + 1}`,
    })),
    is_my_room: isMyRoom,
  }
}

test("round score controls stay hidden until the three-hour pre-show window", () => {
  const item = round()
  const starts = Date.parse(item.room_start_at!)
  assert.equal(MASTERS_SCORE_PRESHOW_MS, 3 * 60 * 60 * 1000)
  assert.equal(mastersRoundAccessState(item, starts - MASTERS_SCORE_PRESHOW_MS - 1), "hidden")
  assert.equal(mastersRoundAccessState(item, starts - MASTERS_SCORE_PRESHOW_MS), "upcoming")
  assert.equal(visibleMastersScoringRounds([item], starts - MASTERS_SCORE_PRESHOW_MS - 1).length, 0)
  assert.equal(visibleMastersScoringRounds([item], starts - MASTERS_SCORE_PRESHOW_MS).length, 1)
})

test("score access opens at the player's room and stays open until finalization", () => {
  const item = round()
  const starts = Date.parse(item.room_start_at!)
  const closes = Date.parse(item.round_closes_at!)
  assert.equal(MASTERS_SCORE_CLOSE_AFTER_LAST_ROOM_MS, 3 * 60 * 60 * 1000)
  assert.equal(mastersRoundAccessState(item, starts - 1), "upcoming")
  assert.equal(mastersRoundAccessState(item, starts), "open")
  assert.equal(mastersRoundAccessState(item, closes), "open")
  assert.equal(mastersRoundAccessState(item, closes + 24 * 60 * 60 * 1000), "open")
  assert.equal(nextMastersScoreAccessTransition([item], starts - MASTERS_SCORE_PRESHOW_MS - 1), starts - MASTERS_SCORE_PRESHOW_MS)
  assert.equal(nextMastersScoreAccessTransition([item], starts - 1), starts)
  assert.equal(nextMastersScoreAccessTransition([item], closes), null)
})

test("overlapping round windows remain independent and explicit", () => {
  const roundOne = round({
    play_day_id: "11111111-1111-4111-8111-111111111111",
    day_number: 1,
    room_start_at: "2026-10-02T02:00:00.000Z",
    round_closes_at: "2026-10-02T05:00:00.000Z",
  })
  const roundTwo = round({
    play_day_id: "22222222-2222-4222-8222-222222222222",
    day_number: 2,
    play_date: "2026-10-02",
    room_start_at: "2026-10-02T04:00:00.000Z",
    round_closes_at: "2026-10-03T05:00:00.000Z",
  })
  const overlap = Date.parse("2026-10-02T04:30:00.000Z")
  assert.equal(mastersRoundAccessState(roundOne, overlap), "open")
  assert.equal(mastersRoundAccessState(roundTwo, overlap), "open")
  assert.notEqual(roundOne.play_day_id, roundTwo.play_day_id)
  assert.match(mastersPage, /playDayId=\$\{encodeURIComponent\(round\.play_day_id\)\}/)
  assert.match(scoringPage, /card\.play_day_id === requestedPlayDayId/)
})

test("published room presentation keeps complete rosters and sorts by time then room", () => {
  const rooms = sortMastersPublishedRooms([
    room("KMGM10", "2026-10-01T08:00:00.000Z", 4),
    room("KMGM2", "2026-10-01T06:00:00.000Z", 3, true),
    room("KMGM1", "2026-10-01T06:00:00.000Z", 2),
    room("DRAFT", "2026-10-01T05:00:00.000Z", 1),
    room("OVERSIZED", "2026-10-01T05:00:00.000Z", 5),
  ])
  assert.deepEqual(rooms.map((item) => item.group_label), ["KMGM1", "KMGM2", "KMGM10"])
  assert.deepEqual(rooms.map((item) => item.roster.length), [2, 3, 4])
  assert.equal(rooms.find((item) => item.is_my_room)?.group_label, "KMGM2")
  assert.match(roomRulesMigration, /room\.is_published/)
  assert.match(roomRulesMigration, /having count\(member\.entry_id\) between 2 and 4/)
  assert.doesNotMatch(roomRulesMigration.match(/create or replace function public\.get_public_major_published_rooms[\s\S]*?\$function\$;/)?.[0] || "", /admin_notes/)
})

test("Masters rules reuse protected event-wide storage without invented defaults", () => {
  assert.match(mastersPage, />MASTERS RULES</)
  assert.match(mastersPage, /MastersOfficialRules/)
  assert.doesNotMatch(mastersPage, /event\.room_rules \? <p/)
  assert.match(adminScheduling, /Masters rules \(event-wide\)/)
  assert.match(adminScheduling, /save_major_event_information/)
  assert.doesNotMatch(mastersPage, /defaultMastersRules|inventedRules/i)
})

test("all four round actions and the before-start local-time message are explicit", () => {
  assert.match(mastersPage, /ROUND \$\{round\.day_number\} SCORES/)
  assert.match(mastersPage, /YOUR ROUND \$\{round\.day_number\} ROOM HAS NOT STARTED YET/)
  assert.match(mastersPage, /formatMastersPlayerSlot\(round\.room_start_at/)
  assert.match(mastersPage, /mastersRoundAccessState\(round, currentTime\)/)
  assert.match(mastersPage, /nextMastersScoreAccessTransition\(scoringRounds, currentTime\)/)
  assert.doesNotMatch(mastersPage, /GMT-4|toISOString\(\).*ROUND/)
})

test("the SQL scoring gate uses room start and finalization, not the old three-hour cutoff", () => {
  assert.match(migration, /now\(\) < scoring_window\.room_start_at/)
  assert.match(migration, /day\.scoring_finalized_at is not null/)
  assert.match(migration, /create or replace function public\.save_my_major_scorecard/)
  assert.match(migration, /create or replace function public\.submit_my_major_scorecard/)
  assert.match(migration, /when day\.scoring_finalized_at is null then 'open'/)
  assert.doesNotMatch(migration, /now\(\) > scoring_window\.round_closes_at/)
  assert.doesNotMatch(migration, /now\(\) <= scoring_window\.round_closes_at/)
})

test("public Masters schedule reads do not execute protected admin policies as anonymous", () => {
  for (const table of ["major_play_days", "major_time_slots", "major_entry_day_choices"]) {
    assert.match(adminPolicyMigration, new RegExp("on public\\." + table + "[\\s\\S]*?for all[\\s\\S]*?to authenticated"))
  }
  assert.doesNotMatch(adminPolicyMigration, /grant execute[\s\S]*is_current_user_site_admin/i)
  assert.doesNotMatch(adminPolicyMigration, /to anon|to public/i)
  assert.doesNotMatch(adminPolicyMigration, /insert into|update public\.|delete from/i)
})

test("Masters courses use the accepted Easy and Hard pars for each round", () => {
  assert.deepEqual(MAJOR_COURSES.CBE.pars, [3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7])
  assert.deepEqual(MAJOR_COURSES.CBH.pars, [3,4,3,4,3,3,3,4,3,8,3,3,2,4,3,4,4,6])
  assert.equal(MAJOR_COURSES.CBH.pars.length, 18)
  assert.equal(MAJOR_COURSES.CBH.pars.reduce((sum, par) => sum + par, 0), 67)
  assert.equal(MAJOR_COURSES.CBH.pars[9], 8)
  assert.equal(MAJOR_COURSES.CBH.pars[11], 3)
  assert.equal(mastersCourseForRound(1), MAJOR_COURSES.CBE)
  assert.equal(mastersCourseForRound(2), MAJOR_COURSES.CBE)
  assert.equal(mastersCourseForRound(3), MAJOR_COURSES.CBH)
  assert.equal(mastersCourseForRound(4), MAJOR_COURSES.CBH)
})

test("compact score entry renders 18 fields, totals scores, and advances through hole 17 only", () => {
  assert.match(scoringPage, /<table className=\{styles\.scorecard\}>/)
  assert.match(scoringPage, /course\.pars\.map/)
  assert.match(scoringPage, /player_screen_name_snapshot/)
  assert.match(scoringPage, /SAVE DRAFT/)
  assert.match(scoringPage, /SUBMIT SCORECARD/)
  assert.equal(mastersScoreTotal(["1", "2", "", "3"]), 6)
  assert.equal(shouldAdvanceMastersHole("4", 0), true)
  assert.equal(shouldAdvanceMastersHole("4", 17), false)
  assert.equal(shouldAdvanceMastersHole("10", 0), false)
})

test("shared room proof renders only an uploaded API image and has an honest empty state", () => {
  assert.match(scorecardPhoto, /payload\.proof\.image_url/)
  assert.match(scorecardPhoto, /VIEW SCORECARD/)
  assert.match(scorecardPhoto, /aria-modal="true"/)
  assert.match(scorecardPhoto, /Close enlarged scorecard/)
  assert.match(scorecardPhoto, /event\.key === "Escape"/)
  assert.match(scorecardPhoto, /ScorecardZoomControls/)
  assert.match(scorecardPhoto, /ScorecardPanViewport/)
  assert.match(scorecardPhoto, /masters-room-scorecard-viewer/)
  assert.match(sharedViewer, /Zoom in/)
  assert.match(sharedViewer, /Zoom out/)
  assert.match(sharedViewer, /Fit \/ reset/)
  assert.match(sharedViewer, /setPointerCapture/)
  assert.match(sharedViewer, /PointerEvent/)
  assert.match(scorecardPhoto, /No room scorecard has been uploaded yet\./)
  assert.match(scorecardPhoto, /SUBMIT ROOM SCORECARD PHOTO/)
  assert.match(scorecardPhoto, /ROOM SCORECARD PHOTO ISSUE/)
  assert.match(scorecardPhoto, /You can still enter and submit your 18-hole scores\./)
  assert.doesNotMatch(scorecardPhoto, /masters-large-scorecard|placeholder|approved-pages\/the masters/i)
  assert.doesNotMatch(scoringPage, /masters-large-scorecard|placeholder.*scorecard/i)
})

test("existing individual lifecycle and shared room architecture remain wired", () => {
  assert.match(scoringPage, /save_my_major_scorecard/)
  assert.match(scoringPage, /\/api\/majors\/scorecards\/submit/)
  assert.match(scoreSubmitRoute, /submit_my_major_scorecard/)
  assert.match(scoringPage, /MajorRoomScorecardPhoto/)
  assert.match(migration, /Submitted or verified scorecards cannot be silently changed/)
  assert.doesNotMatch(migration, /delete from public\.major_player_scorecards/)
  assert.doesNotMatch(migration, /update public\.major_entries|update public\.major_entry_day_choices|update public\.major_schedule_groups/)
})

test("signed-out scoring stays blocked without calling the protected player RPC", () => {
  const authCheck = scoringPage.indexOf("supabase.auth.getUser()")
  const scorecardRpc = scoringPage.indexOf('supabase.rpc("get_my_major_scorecards"')
  assert.ok(authCheck > -1)
  assert.ok(authCheck < scorecardRpc)
  assert.match(scoringPage.slice(authCheck, scorecardRpc), /if \(!user\.data\.user\)/)
})
