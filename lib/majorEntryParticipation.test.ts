import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

import type { MajorEntry } from "./majors.ts"

import {
  isActiveMajorEntryStatus,
  majorEntrantAddState,
  majorRoomStateAfterWithdrawal,
  mayRemoveWithdrawnPlayerFromRoom,
} from "./majorEntryParticipation.ts"

const migrationPath = fileURLToPath(new URL("../supabase/migrations/20261001120717_masters_entry_withdrawal_management.sql", import.meta.url))
const migration = readFileSync(migrationPath, "utf8")
const adminPage = readFileSync(new URL("../app/admin/majors/page.tsx", import.meta.url), "utf8")
const schedulingPage = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")
const scoringMigration = readFileSync(new URL("../supabase/migrations/20260930190131_masters_player_rooms_rules_and_scoring_access.sql", import.meta.url), "utf8")
const adminAddFunction = migration.match(/create or replace function public\.admin_add_major_entrant_exception[\s\S]*?revoke all on function public\.admin_add_major_entrant_exception/)?.[0] || ""

function entry(playerId: string, status: MajorEntry["status"]): MajorEntry {
  return {
    id: `entry-${playerId}`,
    major_event_id: "event-1",
    player_id: playerId,
    player_screen_name_snapshot: playerId,
    status,
    registered_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  }
}

test("registered and confirmed entries are the only active Masters participants", () => {
  assert.equal(isActiveMajorEntryStatus("registered"), true)
  assert.equal(isActiveMajorEntryStatus("confirmed"), true)
  assert.equal(isActiveMajorEntryStatus("withdrawn"), false)
  assert.equal(isActiveMajorEntryStatus("waitlisted"), false)
  assert.equal(isActiveMajorEntryStatus("declined"), false)
})

test("admin add classification blocks duplicates and directs withdrawn entrants to reactivation", () => {
  const entries = [entry("active", "registered"), entry("withdrawn", "withdrawn"), entry("waitlisted", "waitlisted")]
  assert.equal(majorEntrantAddState(entries, "new-player"), "available")
  assert.equal(majorEntrantAddState(entries, "active"), "already_active")
  assert.equal(majorEntrantAddState(entries, "withdrawn"), "reactivate_required")
  assert.equal(majorEntrantAddState(entries, "waitlisted"), "existing_conflict")
})

test("admin exception add uses one canonical player, preserves signup state, and creates no scheduling data", () => {
  assert.match(adminAddFunction, /where id = p_player_id/)
  assert.match(adminAddFunction, /where major_event_id = p_major_event_id[\s\S]*and player_id = p_player_id[\s\S]*for update/)
  assert.match(adminAddFunction, /status,\s*registration_source,[\s\S]*'registered',\s*'admin_exception'/)
  assert.match(adminAddFunction, /'signup_open', event_row\.signup_open/)
  assert.match(adminAddFunction, /'requires_scheduling', true/)
  assert.match(adminAddFunction, /'selected_time_count', 0/)
  assert.match(adminAddFunction, /'room_assignment_count', 0/)
  assert.match(adminAddFunction, /'admin_add',[\s\S]*'not_entered'/)
  assert.match(adminAddFunction, /WITHDRAWN Masters entry\. Use REACTIVATE PLAYER/)
  assert.doesNotMatch(adminAddFunction, /update public\.major_events/i)
  assert.doesNotMatch(adminAddFunction, /major_entry_day_choices/i)
  assert.doesNotMatch(adminAddFunction, /major_schedule_group/i)
  assert.doesNotMatch(adminAddFunction, /insert into public\.players/i)
})

test("late-added active entrants require deliberate time and room placement", () => {
  assert.match(migration, /create or replace function public\.admin_set_major_day_choice/)
  assert.match(migration, /entry\.status in \('registered', 'confirmed'\)/)
  assert.match(schedulingPage, /Active players requiring a \{name\.short\} time/)
  assert.match(schedulingPage, /This does not place them in a room or move anyone else/)
  assert.match(schedulingPage, /Time assignment only; room placement remains deliberate/)
  assert.match(schedulingPage, /save_major_schedule_group/)
  assert.match(migration, /member_count not between 1 and 4/)
})

test("withdrawal keeps two- through four-player rooms playable and marks solo rooms incomplete", () => {
  assert.deepEqual(majorRoomStateAfterWithdrawal(3), {
    playable: true,
    publicationMustBeCleared: false,
    label: "PLAYABLE",
  })
  assert.equal(majorRoomStateAfterWithdrawal(2).playable, true)
  assert.deepEqual(majorRoomStateAfterWithdrawal(1), {
    playable: false,
    publicationMustBeCleared: true,
    label: "NEEDS PLAYER — SOLO PLAY NOT ALLOWED",
  })
})

test("only future rooms without score activity may lose the withdrawn membership", () => {
  assert.equal(mayRemoveWithdrawnPlayerFromRoom({
    roomStartsAt: "2026-10-02T18:00:00Z",
    now: "2026-10-01T18:00:00Z",
    hasScoreActivity: false,
  }), true)
  assert.equal(mayRemoveWithdrawnPlayerFromRoom({
    roomStartsAt: "2026-10-01T17:59:59Z",
    now: "2026-10-01T18:00:00Z",
    hasScoreActivity: false,
  }), false)
  assert.equal(mayRemoveWithdrawnPlayerFromRoom({
    roomStartsAt: "2026-10-02T18:00:00Z",
    now: "2026-10-01T18:00:00Z",
    hasScoreActivity: true,
  }), false)
})

test("migration preserves registration, selections, rooms with history, and all score states", () => {
  assert.match(migration, /admin_set_major_entry_participation/)
  assert.match(migration, /entry\.status in \('registered', 'confirmed'\)/)
  assert.match(migration, /score_activity/)
  assert.match(migration, /room_state\.starts_at <= now\(\) or score_activity/)
  assert.match(migration, /update public\.major_schedule_groups[\s\S]*is_finalized = false[\s\S]*is_published = false/)
  assert.match(migration, /insert into public\.major_entry_participation_audit/)
  assert.match(migration, /alter table public\.major_entry_participation_audit force row level security/)
  assert.match(migration, /grant execute on function public\.admin_set_major_entry_participation\(uuid, text, text\) to authenticated/)
  assert.match(migration, /entry\.status in \('registered', 'confirmed'\)/)
  assert.match(migration, /started Masters room or room with score activity has protected history/)
  assert.match(migration, /started Masters room or room with score activity has protected history and cannot be deleted/)
  assert.doesNotMatch(migration, /delete from public\.major_entries/i)
  assert.doesNotMatch(migration, /delete from public\.major_entry_day_choices/i)
  assert.doesNotMatch(migration, /delete from public\.major_player_scorecards/i)
  assert.doesNotMatch(migration, /update public\.major_player_scorecards/i)
})

test("generic status changes cannot bypass audited withdrawal or reactivation", () => {
  assert.match(migration, /Withdrawal and reactivation require the audited Masters participation action/)
  assert.match(migration, /if current_entry\.status = 'withdrawn' or p_status = 'withdrawn'/)
})

test("admin UI uses explicit confirmed withdrawal and reactivation actions", () => {
  assert.match(adminPage, /WITHDRAW \$\{entry\.player_screen_name_snapshot\} FROM THE MASTERS\?/)
  assert.match(adminPage, /admin_set_major_entry_participation/)
  assert.match(adminPage, /Reactivate player/)
  assert.match(adminPage, /withdrawn_by_screen_name_snapshot/)
  assert.match(adminPage, /withdrawal_reason/)
})

test("admin UI searches canonical Global Players and explains the late-add safety boundary", () => {
  assert.match(adminPage, /loadProtectedAdminGlobalPlayers/)
  assert.match(adminPage, /admin_add_major_entrant_exception/)
  assert.match(adminPage, /ADD PLAYER — ADMIN EXCEPTION/)
  assert.match(adminPage, /Public signup will remain/)
  assert.match(adminPage, /No selected times or rooms will be created/)
  assert.match(adminPage, /Use REACTIVATE PLAYER; do not add a duplicate/)
  assert.doesNotMatch(adminPage, /placeholder="Canonical player UUID"/)
})

test("withdrawn entrants are excluded from active scheduling and preserved historical rooms are locked", () => {
  assert.match(schedulingPage, /isActiveMajorEntryStatus/)
  assert.match(schedulingPage, /Historical room preserved:/)
  assert.match(schedulingPage, /hasPreservedHistory \|\| selectedCount/)
  assert.match(schedulingPage, /NEEDS PLAYER|Incomplete room/)
})

test("existing protected scoring gates deny withdrawn entrants without deleting their cards", () => {
  assert.match(scoringMigration, /entry\.status in \('registered', 'confirmed'\)/)
  assert.match(scoringMigration, /major_player_scorecards\.status in \('draft', 'reopened'\)/)
  assert.doesNotMatch(migration, /delete from public\.major_player_scorecards/i)
})
