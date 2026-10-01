import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  CHERRY_MASTERS_STREAM_PARS,
  completedThrough,
  formatRunningToPar,
  isStaleRevisionError,
  nineHoleRows,
  runningToPar,
  updateLocalHoleScores,
} from "./mastersStreamScorecard.ts"

const migration = readFileSync(
  new URL("../supabase/migrations/20261001183000_masters_live_stream_scorecard.sql", import.meta.url),
  "utf8"
)
const controller = readFileSync(new URL("../app/admin/majors/scoring/page.tsx", import.meta.url), "utf8")
const display = readFileSync(new URL("../app/majors/live/[sessionId]/[view]/page.tsx", import.meta.url), "utf8")

test("Cherry Blossom stream pars stay authoritative for all 18 holes", () => {
  assert.deepEqual(CHERRY_MASTERS_STREAM_PARS.CBE, [3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7])
  assert.equal(CHERRY_MASTERS_STREAM_PARS.CBE.reduce((sum, par) => sum + par, 0), 63)
  assert.equal(CHERRY_MASTERS_STREAM_PARS.CBH.length, 18)
})

test("running to-par supports negative, even, and positive golf scores", () => {
  const scores = [
    { participant_id: "p1", hole_number: 1, strokes: 2 },
    { participant_id: "p1", hole_number: 2, strokes: 4 },
    { participant_id: "p1", hole_number: 3, strokes: 5 },
  ]
  assert.equal(runningToPar(scores, "p1", CHERRY_MASTERS_STREAM_PARS.CBE), 1)
  assert.equal(formatRunningToPar(-2), "-2")
  assert.equal(formatRunningToPar(0), "E")
  assert.equal(formatRunningToPar(3), "+3")
})

test("front/back nine display and corrections remain deterministic", () => {
  assert.deepEqual(nineHoleRows(1), [1,2,3,4,5,6,7,8,9])
  assert.deepEqual(nineHoleRows(18), [10,11,12,13,14,15,16,17,18])
  const first = updateLocalHoleScores([], 1, { p1: 2, p2: 3 })
  const corrected = updateLocalHoleScores(first, 1, { p1: 1, p2: null })
  assert.deepEqual(corrected, [{ participant_id: "p1", hole_number: 1, strokes: 1 }])
  assert.equal(completedThrough([...corrected, { participant_id: "p1", hole_number: 2, strokes: 4 }], "p1"), 2)
})

test("stale controller conflicts are recognized", () => {
  assert.equal(isStaleRevisionError("STALE_STREAM_REVISION"), true)
  assert.equal(isStaleRevisionError("other failure"), false)
})

test("migration supports 2-4 published-room players and revision-safe admin writes", () => {
  assert.match(migration, /participant_count between 2 and 4/i)
  assert.match(migration, /position between 1 and 4/i)
  assert.match(migration, /room\.is_published/i)
  assert.match(migration, /entry\.status in \('registered', 'confirmed'\)/i)
  assert.match(migration, /session_record\.revision <> p_expected_revision/i)
  assert.match(migration, /STALE_STREAM_REVISION/)
  assert.match(migration, /public\.is_current_user_site_admin\(\)/i)
})

test("broadcast migration never writes official Masters scoring or result tables", () => {
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_player_scorecards/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_scorecard_holes/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_results/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_result_snapshots/i)
})

test("controller deliberately loads a room and display contains no controls or secrets", () => {
  assert.match(controller, /Confirm LOAD ROOM/)
  assert.match(controller, /p_confirmed: true/)
  assert.match(controller, /p_expected_revision: session\.revision/)
  assert.match(controller, /Nothing here writes official player scores or results/)
  assert.doesNotMatch(display, /SUPABASE_SECRET|SERVICE_ROLE|LOAD ROOM|update_masters_stream_scorecard/)
  assert.match(display, /setInterval\(\(\) => void refresh\(\), 850\)/)
  assert.match(display, /FRONT NINE/)
  assert.match(display, /BACK NINE/)
})
