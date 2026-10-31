import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../supabase/migrations/20261004120000_masters_emergency_final_room_assignment.sql", import.meta.url), "utf8")
const replacementMigration = readFileSync(new URL("../supabase/migrations/20261004123000_masters_protected_final_round_player_replacement.sql", import.meta.url), "utf8")
const route = readFileSync(new URL("../app/api/admin/majors/emergency-room-assignment/route.ts", import.meta.url), "utf8")
const roomReader = readFileSync(new URL("../major_player_room_roster.sql", import.meta.url), "utf8")

test("emergency Final Round assignment is an audited, admin-only membership operation", () => {
  assert.match(migration, /admin_assign_major_player_to_existing_final_room/i)
  assert.match(migration, /actor_user := auth\.uid\(\);[\s\S]*?actor_user is null or\s+not public\.is_current_user_site_admin\(\)/i)
  assert.match(migration, /slug = 'masters'/i)
  assert.match(migration, /target_day\.day_number <> 4/i)
  assert.match(migration, /target_room\.is_published or not target_room\.is_finalized/i)
  assert.match(migration, /choice\.time_slot_id = target_slot\.id/i)
  assert.match(migration, /major_player_scorecards/i)
  assert.match(migration, /major_score_entry_admin_actions/i)
  assert.match(migration, /for update/i)
  assert.match(migration, /insert into public\.major_schedule_group_members/i)
  assert.match(migration, /insert into public\.major_entry_participation_audit/i)
  assert.match(migration, /emergency_room_assignment/i)
  assert.match(migration, /source_membership_removed/i)
  assert.match(migration, /revoke all on function/i)
  assert.match(migration, /grant execute on function[\s\S]*to authenticated/i)
})

test("the assignment preserves room identity and proof history instead of using full room save", () => {
  const functionBody = migration.match(/create or replace function public\.admin_assign_major_player_to_existing_final_room[\s\S]*?end\s*\$function\$/i)?.[0] || ""
  assert.doesNotMatch(functionBody, /save_major_schedule_group/i)
  assert.doesNotMatch(functionBody, /delete from public\.major_schedule_groups/i)
  assert.doesNotMatch(functionBody, /delete from public\.major_room_scorecard_proofs/i)
  assert.match(functionBody, /has_target then[\s\S]*already_assigned/i)
  assert.match(functionBody, /target_count >= 4/i)
  assert.match(functionBody, /source_count > 1/i)
})

test("the server route validates an authorized admin request and delegates to the protected RPC", () => {
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /export async function POST/)
  assert.match(route, /targetGroupId/)
  assert.match(route, /reason\.length < 8/)
  assert.match(route, /admin_assign_major_player_to_existing_final_room/)
  assert.match(route, /p_major_event_id: eventId/)
  assert.match(route, /p_entry_id: entryId/)
  assert.match(route, /p_target_group_id: targetGroupId/)
})

test("the existing MGM/player lookup will discover the new destination membership", () => {
  assert.match(roomReader, /major_schedule_group_members/i)
  assert.match(roomReader, /where room_member\.group_id = g\.id/i)
  assert.match(migration, /target_room\.id, event_row\.id, target_day\.id, target_slot\.id, entry_row\.id/i)
})

test("protected Final Round replacement is one audited atomic remove-and-add operation", () => {
  assert.match(replacementMigration, /admin_replace_major_final_round_player/i)
  assert.match(replacementMigration, /auth\.uid\(\)/i)
  assert.match(replacementMigration, /is_current_user_site_admin/i)
  assert.match(replacementMigration, /day_row\.day_number <> 4/i)
  assert.match(replacementMigration, /room_row\.is_published or not room_row\.is_finalized/i)
  assert.match(replacementMigration, /remove_entry\.id/i)
  assert.match(replacementMigration, /add_entry\.id/i)
  assert.match(replacementMigration, /major_player_scorecards/i)
  assert.match(replacementMigration, /major_score_entry_admin_actions/i)
  assert.match(replacementMigration, /delete from public\.major_schedule_group_members/i)
  assert.match(replacementMigration, /insert into public\.major_schedule_group_members/i)
  assert.match(replacementMigration, /insert into public\.major_entry_participation_audit/i)
  assert.match(replacementMigration, /protected_player_replacement/i)
  assert.match(replacementMigration, /operation_id/i)
  assert.match(replacementMigration, /already_replaced/i)
  assert.doesNotMatch(replacementMigration, /delete from public\.major_schedule_groups|delete from public\.major_room_scorecard_proofs|update public\.major_schedule_groups/i)
})

test("protected replacement has a separate authenticated admin route and deliberate UI action", () => {
  const replacementRoute = readFileSync(new URL("../app/api/admin/majors/emergency-room-replacement/route.ts", import.meta.url), "utf8")
  const page = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")
  assert.match(replacementRoute, /authorizeSiteAdminMutation/)
  assert.match(replacementRoute, /admin_replace_major_final_round_player/)
  assert.match(replacementRoute, /p_remove_entry_id: removeEntryId/)
  assert.match(replacementRoute, /p_add_entry_id: addEntryId/)
  assert.match(page, /Replace player in protected room/)
  assert.match(page, /Atomic protected replacement/)
  assert.match(page, /emergency-room-replacement/)
})
