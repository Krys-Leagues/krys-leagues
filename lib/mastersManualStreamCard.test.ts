import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  canToggleManualStreamSlot,
  formatManualGolfScore,
  normalizeManualStreamCard,
  parseManualGolfScore,
  updateManualStreamSlot,
  visibleManualStreamSlots,
  type MastersManualStreamSlot,
} from "./mastersManualStreamCard.ts"

const fixture: MastersManualStreamSlot[] = [
  { slot: 1, enabled: true, name: "YUK1N", score: -10 },
  { slot: 2, enabled: true, name: "DUARDY", score: -4 },
  { slot: 3, enabled: true, name: "EL JORGE", score: 0 },
  { slot: 4, enabled: true, name: "BADWOLF", score: 2 },
]

const migration = readFileSync(new URL("../supabase/migrations/20261001225028_masters_manual_stream_card.sql", import.meta.url), "utf8")
const controller = readFileSync(new URL("../app/admin/majors/manual-stream-scorecard/page.tsx", import.meta.url), "utf8")
const controllerCss = readFileSync(new URL("../app/admin/majors/manual-stream-scorecard/page.module.css", import.meta.url), "utf8")
const obsPage = readFileSync(new URL("../app/majors/masters-stream/manual/page.tsx", import.meta.url), "utf8")
const obsCard = readFileSync(new URL("../components/masters/MastersManualStreamCard.tsx", import.meta.url), "utf8")
const obsCss = readFileSync(new URL("../components/masters/MastersManualStreamCard.module.css", import.meta.url), "utf8")

test("manual golf scores preserve negative, even, positive, and direct input", () => {
  assert.equal(formatManualGolfScore(-25), "-25")
  assert.equal(formatManualGolfScore(0), "E")
  assert.equal(formatManualGolfScore(4), "+4")
  assert.equal(parseManualGolfScore("-25"), -25)
  assert.equal(parseManualGolfScore("0"), 0)
  assert.equal(parseManualGolfScore("E"), 0)
  assert.equal(parseManualGolfScore("+4"), 4)
  assert.equal(parseManualGolfScore("1.5"), null)
})

test("minus and plus update only the selected manual slot", () => {
  const decreased = updateManualStreamSlot(fixture, 1, { score: fixture[0].score - 1 })
  assert.equal(decreased[0].score, -11)
  assert.equal(decreased[1].score, -4)
  const restored = updateManualStreamSlot(decreased, 1, { score: decreased[0].score + 1 })
  assert.equal(restored[0].score, -10)
})

test("typed names are preserved exactly without lookup or canonicalization", () => {
  const exact = "  YuK1N_v2  "
  const updated = updateManualStreamSlot(fixture, 1, { name: exact })
  assert.equal(updated[0].name, exact)
  assert.doesNotMatch(controller, /global players|public-search|canonical/i)
  assert.match(controller, /name: event\.target\.value/)
})

test("two, three, and four enabled players reflow without blank panels", () => {
  assert.equal(visibleManualStreamSlots(fixture).length, 4)
  const three = updateManualStreamSlot(fixture, 4, { enabled: false })
  assert.equal(visibleManualStreamSlots(three).length, 3)
  const two = updateManualStreamSlot(three, 3, { enabled: false })
  assert.equal(visibleManualStreamSlots(two).length, 2)
  assert.equal(canToggleManualStreamSlot(two, 2), false)
  assert.equal(canToggleManualStreamSlot(two, 3), true)
  assert.match(obsCss, /repeat\(var\(--player-count\)/)
})

test("public state parser accepts the exact four-player fixture", () => {
  assert.deepEqual(normalizeManualStreamCard({ slots: fixture, revision: 7, updated_at: "2026-10-01T00:00:00Z" }), {
    slots: fixture,
    revision: 7,
    updated_at: "2026-10-01T00:00:00Z",
  })
})

test("persistent admin state is revision-locked and public OBS is read-only", () => {
  assert.match(migration, /create table if not exists public\.masters_manual_stream_cards/i)
  assert.match(migration, /STALE_MANUAL_STREAM_REVISION/)
  assert.match(migration, /public\.is_current_user_site_admin\(\)/)
  assert.match(migration, /enabled_count not between 2 and 4/)
  assert.match(migration, /grant execute on function public\.get_public_masters_manual_stream_card\(\) to anon, authenticated/)
  assert.match(controller, /update_masters_manual_stream_card/)
  assert.match(controller, /setInterval\(\(\) => void loadCard\(\)/)
  assert.match(obsPage, /get_public_masters_manual_stream_card/)
  assert.match(obsPage, /setInterval\(\(\) => void refresh\(\), 400\)/)
  assert.doesNotMatch(obsPage, /update_masters_manual_stream_card/)
})

test("manual stream storage cannot write official Masters state", () => {
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_player_scorecards/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_player_scorecard_holes/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_results/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_schedule_groups/i)
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.major_schedule_group_members/i)
  assert.doesNotMatch(controller, /major_player_scorecards|major_results|major_schedule_groups/)
})

test("controller is large, mobile-safe, and contains only manual score operations", () => {
  assert.match(controller, /Masters Manual Scorecard/)
  assert.match(controller, /direct golf score/)
  assert.match(controller, /toggleSlot/)
  assert.match(controllerCss, /@media \(max-width: 760px\)/)
  assert.match(controllerCss, /min-height: 86px/)
  assert.doesNotMatch(controller, /major_hole_scores|current_hole|hole_pars|LOAD ROOM|global players|public-search/i)
})

test("OBS source has locked identity, approved logo, compact transparency, and no scoring math", () => {
  assert.match(obsCard, /KRYS LEAGUES/)
  assert.match(obsCard, /THE MINI-GOLF MASTERS/)
  assert.match(obsCard, /CHERRY BLOSSOM/)
  assert.match(obsCard, /krys-leagues-logo-source\.png/)
  assert.match(obsCss, /background: transparent !important/)
  assert.match(obsCss, /width: min\(1484px/)
  assert.match(obsCss, /height: min\(234px/)
  assert.doesNotMatch(obsCard, /CHERRY MASTERS|hole|par|room|player_id|fireworks/i)
  assert.match(controller, /1500 × 250/)
})
