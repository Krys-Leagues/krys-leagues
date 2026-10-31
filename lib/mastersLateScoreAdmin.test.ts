import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  isMastersLateScoreUnfinished,
  mastersAdminScoreTotals,
  mastersLateScoreState,
  type MastersLateScoreAdminRow,
} from "./mastersLateScoreAdmin.ts"
import { mastersRoundAccessState } from "./mastersPlayerExperience.ts"

const migration = readFileSync(new URL("../supabase/migrations/20261002143000_masters_late_score_admin_tools.sql", import.meta.url), "utf8")
const overrideMigration = readFileSync(new URL("../supabase/migrations/20261003160000_masters_admin_score_entry_open_window.sql", import.meta.url), "utf8")
const playerCutoffMigration = readFileSync(new URL("../supabase/migrations/20261003100000_masters_remove_player_score_cutoff.sql", import.meta.url), "utf8")
const originalScoringMigration = readFileSync(new URL("../supabase/migrations/20260930190131_masters_player_rooms_rules_and_scoring_access.sql", import.meta.url), "utf8")
const route = readFileSync(new URL("../app/api/admin/majors/late-scores/route.ts", import.meta.url), "utf8")
const adminPanel = readFileSync(new URL("../components/admin/majors/MastersLateScoreAdmin.tsx", import.meta.url), "utf8")
const verificationPage = readFileSync(new URL("../app/admin/majors/verification/page.tsx", import.meta.url), "utf8")

function row(overrides: Partial<MastersLateScoreAdminRow> = {}): MastersLateScoreAdminRow {
  return {
    eventId: "event", entryId: "entry", playerId: "player", playerName: "PLAYER",
    playDayId: "day", dayNumber: 1, playDate: "2026-10-01", roomId: "room",
    roomLabel: "KMGM1", scheduledAt: "2026-10-01T12:00:00Z",
    normalClosesAt: "2026-10-01T15:00:00Z", scoringFinalizedAt: null,
    scorecardId: null, scorecardStatus: null, holes: [], reopenedUntil: null,
    ...overrides,
  }
}

test("normal scoring stays open only inside the established window", () => {
  assert.equal(mastersLateScoreState(row(), Date.parse("2026-10-01T14:00:00Z")), "open")
  assert.equal(mastersLateScoreState(row(), Date.parse("2026-10-01T16:00:00Z")), "expired")
})

test("a one-player one-round reopen expires without changing submitted states", () => {
  const reopened = row({ reopenedUntil: "2026-10-01T17:00:00Z" })
  assert.equal(mastersLateScoreState(reopened, Date.parse("2026-10-01T16:30:00Z")), "reopened")
  assert.equal(mastersLateScoreState(reopened, Date.parse("2026-10-01T17:00:01Z")), "expired")
  assert.equal(mastersLateScoreState(row({ scorecardStatus: "submitted" }), Date.parse("2026-10-01T20:00:00Z")), "submitted")
  assert.equal(mastersLateScoreState(row({ scorecardStatus: "verified" }), Date.parse("2026-10-01T20:00:00Z")), "verified")
})

test("player scoring stays open after the old deadline without needing an admin exception", () => {
  const scoringRound = {
    room_start_at: "2026-10-01T12:00:00Z",
    round_closes_at: "2026-10-01T15:00:00Z",
    admin_reopened_until: "2026-10-01T17:00:00Z",
  }
  assert.equal(mastersRoundAccessState(scoringRound, Date.parse("2026-10-01T16:30:00Z")), "open")
  assert.equal(mastersRoundAccessState(scoringRound, Date.parse("2026-10-02T17:00:01Z")), "open")
})

test("draft, reopened, and missing cards are unfinished while submitted and verified are protected", () => {
  assert.equal(isMastersLateScoreUnfinished(null), true)
  assert.equal(isMastersLateScoreUnfinished("draft"), true)
  assert.equal(isMastersLateScoreUnfinished("reopened"), true)
  assert.equal(isMastersLateScoreUnfinished("submitted"), false)
  assert.equal(isMastersLateScoreUnfinished("verified"), false)
})

test("admin totals reuse authoritative course pars and support negative golf", () => {
  const values = Array(18).fill("2")
  const result = mastersAdminScoreTotals(1, values)
  assert.deepEqual(result, { complete: true, total: 36, toPar: -27 })
  assert.equal(mastersAdminScoreTotals(1, [...values.slice(0, 17), ""]).complete, false)
})

test("migration preserves the global three-hour rule and adds only scoped exceptions", () => {
  assert.match(originalScoringMigration, /max\(last_slot\.starts_at\) \+ interval '3 hours'/)
  assert.doesNotMatch(migration, /create or replace function public\.major_player_round_scoring_window/)
  assert.match(migration, /now\(\) \+ interval '1 hour'/)
  assert.match(migration, /major_active_score_reopen_until\(entry\.id, day\.id\)/)
  assert.match(migration, /Submitted or verified scorecards cannot be overwritten/)
  assert.match(migration, /'admin_score_entry_reopen'/)
  assert.match(migration, /'admin_score_entry'/)
  assert.doesNotMatch(migration, /update public\.major_time_slots|update public\.major_schedule_groups|delete from public\.major_entries/i)
})

test("player cutoff removal preserves finalization and submitted-score protections", () => {
  assert.match(playerCutoffMigration, /when day\.scoring_finalized_at is null then 'open'/)
  assert.match(playerCutoffMigration, /Submitted or verified scorecards cannot be silently changed/)
  assert.match(playerCutoffMigration, /This scorecard cannot be submitted/)
  assert.doesNotMatch(playerCutoffMigration, /now\(\) > scoring_window\.round_closes_at/)
  assert.doesNotMatch(playerCutoffMigration, /now\(\) <= scoring_window\.round_closes_at/)
})

test("late-score reopen remains deadline-bound while admin score entry may override an open window", () => {
  assert.equal((migration.match(/slug = 'masters'/g) || []).length, 2)
  assert.match(overrideMigration, /admin_submit_major_scorecard_service[\s\S]*?normal_window_open/)
  assert.doesNotMatch(overrideMigration, /if now\(\) <= scoring_window\.round_closes_at then raise exception 'This player is still inside the normal scoring window'/)
  assert.match(migration, /admin_reopen_major_score_entry_service[\s\S]*?if now\(\) <= scoring_window\.round_closes_at then raise exception 'This player is still inside the normal scoring window'/)
  assert.match(route, /eventResult\.data\.slug !== "masters"/)
})

test("privileged late-score mutations remain behind the protected server route", () => {
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /createScorecardServiceClient/)
  assert.match(migration, /grant execute on function public\.admin_reopen_major_score_entry_service[\s\S]*?to service_role/)
  assert.match(overrideMigration, /grant execute on function public\.admin_submit_major_scorecard_service[\s\S]*?to service_role/)
  assert.doesNotMatch(migration, /grant execute on function public\.admin_(?:reopen|submit)_major_score[\s\S]*?to authenticated/)
})

test("Masters verification exposes the two distinct late-score admin actions without polling", () => {
  assert.match(verificationPage, /<MastersLateScoreAdmin eventId=\{eventId\} \/>/)
  assert.match(adminPanel, /REOPEN FOR PLAYER/)
  assert.match(adminPanel, /ADMIN ENTER SCORE/)
  assert.match(adminPanel, /SUBMIT FOR VERIFICATION/)
  assert.match(adminPanel, /ENTERED BY ADMIN ON BEHALF OF PLAYER/)
  assert.match(adminPanel, /PLAYER ENTRY IS CURRENTLY OPEN/)
  assert.match(adminPanel, /\["open", "expired", "reopened"\]/)
  assert.match(adminPanel, /REOPENED UNTIL:/)
  assert.doesNotMatch(adminPanel, /setInterval|setTimeout/)
})
