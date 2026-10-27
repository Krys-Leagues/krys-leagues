import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { isInstructionOnlyPublishedRoomRepublish, MASTERS_ROOM_MAX_PLAYERS, validateMastersRoomPlayerIds } from "./mastersRoomScheduling.ts"

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
]

test("one-player Masters rooms are accepted only as incomplete private drafts", () => {
  assert.equal(MASTERS_ROOM_MAX_PLAYERS, 4)
  assert.equal(validateMastersRoomPlayerIds(ids.slice(0, 1), { finalized: false, published: false }), null)
  assert.match(validateMastersRoomPlayerIds(ids.slice(0, 1), { finalized: false, published: true }) || "", /incomplete/i)
  assert.match(validateMastersRoomPlayerIds(ids.slice(0, 1), { finalized: true, published: false }) || "", /incomplete/i)
})

test("two-, three-, and four-player Masters rooms support private and published saves", () => {
  for (let size = 2; size <= MASTERS_ROOM_MAX_PLAYERS; size += 1) {
    assert.equal(validateMastersRoomPlayerIds(ids.slice(0, size), { finalized: false, published: false }), null)
    assert.equal(validateMastersRoomPlayerIds(ids.slice(0, size), { finalized: true, published: true }), null)
  }
})

test("Masters rooms reject empty, duplicate, and five-player rosters", () => {
  const privateDraft = { finalized: false, published: false }
  assert.match(validateMastersRoomPlayerIds([], privateDraft) || "", /at least one player/i)
  assert.match(validateMastersRoomPlayerIds(ids, privateDraft) || "", /maximum of 4 players/i)
  assert.match(validateMastersRoomPlayerIds([ids[0], ids[0]], privateDraft) || "", /only once/i)
})

test("admin private save and publish both use the validated four-player roster", () => {
  const page = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")
  assert.match(page, /const entryIds = data\.getAll\("entry"\)\.map\(String\)/)
  assert.match(page, /validateMastersRoomPlayerIds\(entryIds, \{ finalized, published: publish \}\)/)
  assert.match(page, /p_is_published: publish/)
  assert.match(page, /p_entry_ids: entryIds/)
  assert.match(page, />Save privately</)
  assert.match(page, /disabled=\{hasPreservedHistory \|\| selectedCount < 2 \|\| selectedCount > 4\}[\s\S]{0,200}>Save & publish</)
  assert.match(page, /disabled=\{selectedCount < 2 \|\| hasPreservedHistory\} \/> Room composition finalized/)
})

test("database RPC keeps solo rooms private and accepts playable rooms up to four", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260930155336_allow_four_player_masters_rooms.sql", import.meta.url), "utf8")
  assert.match(migration, /member_count := cardinality\(coalesce\(p_entry_ids,array\[\]::uuid\[\]\)\)/i)
  assert.match(migration, /member_count not between 1 and 4/i)
  assert.match(migration, /member_count = 1 and \(coalesce\(p_is_finalized,false\) or coalesce\(p_is_published,false\)\)/i)
  assert.match(migration, /one-player Masters room is incomplete and may only be saved privately without finalizing/i)
  assert.match(migration, /Masters rooms require 1 to 4 players\./)
  assert.match(migration, /security definer set search_path to ''/i)
})

test("room reload and player schedule render every persisted roster member", () => {
  const admin = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")
  const player = readFileSync(new URL("../app/majors/[slug]/page.tsx", import.meta.url), "utf8")
  const rosterSql = readFileSync(new URL("../major_player_room_roster.sql", import.meta.url), "utf8")

  assert.match(admin, /major_schedule_group_members"\)\.select\("\*"\)/)
  assert.match(admin, /members\.filter\(\(member\) => member\.group_id === group\.id\)/)
  assert.match(admin, /Incomplete room:/)
  assert.match(player, /assignment\.room_roster\?\.map\(\(member\)/)
  assert.doesNotMatch(player, /room_roster\?\.(?:slice|splice)\(/)
  assert.match(rosterSql, /where room_member\.group_id = g\.id/)
  assert.doesNotMatch(rosterSql, /limit\s+[1-3]\b/i)
})

test("instruction-only republish is detected only when published room identity, roster, and scheduling stay unchanged", () => {
  const before = {
    groupLabel: "KMGM7",
    competition: "qualifying",
    location: "Lobby seven",
    instructions: null,
    adminNotes: "Private",
    finalized: true,
    published: true,
    entryIds: ids.slice(0, 4),
  }
  const after = { ...before, instructions: "Meet in the lobby 10 minutes early.", entryIds: [...before.entryIds].reverse() }
  assert.equal(isInstructionOnlyPublishedRoomRepublish(before, after), true)
  assert.equal(isInstructionOnlyPublishedRoomRepublish(before, { ...after, groupLabel: "KMGM8" }), false)
  assert.equal(isInstructionOnlyPublishedRoomRepublish(before, { ...after, entryIds: ids.slice(0, 3) }), false)
  assert.equal(isInstructionOnlyPublishedRoomRepublish(before, { ...after, published: false }), false)
})

test("published instruction-only save uses the narrow RPC and keeps the full save path for other edits", () => {
  const page = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")
  const migration = readFileSync(new URL("../supabase/migrations/20260930175447_masters_room_instructions_shared_scorecard.sql", import.meta.url), "utf8")

  assert.match(page, /isInstructionOnlyPublishedRoomRepublish/)
  assert.match(page, /republish_major_schedule_group_instructions/)
  assert.match(page, /Room instructions/)
  assert.match(migration, /update public\.major_schedule_groups\s+set instructions = nullif\(btrim\(p_instructions\), ''\),\s+updated_at = now\(\)\s+where id = p_group_id/i)
  assert.doesNotMatch(migration.match(/create or replace function public\.republish_major_schedule_group_instructions[\s\S]*?\$function\$;/i)?.[0] || "", /delete from public\.major_schedule_group_members|update public\.major_entry_day_choices|group_label\s*=/i)
})

test("weekend rooms can be prepared privately before player classifications are finalized", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261002230000_masters_weekend_room_publication_independent_of_classification.sql", import.meta.url), "utf8")
  const saveRoom = migration.match(/create or replace function public\.save_major_schedule_group[\s\S]*?\n\$function\$;/i)?.[0] || ""

  assert.match(saveRoom, /p_is_published boolean/i)
  assert.doesNotMatch(saveRoom, /major_entry_weekend_status|competition_status|staged competition classification/i)
  assert.doesNotMatch(saveRoom, /weekend\.competition_status\s*=\s*p_competition/i)
  assert.doesNotMatch(saveRoom, /Weekend room assignments must match each player/i)
})

test("physical weekend room publication is independent while field publication remains classified", () => {
  const roomMigration = readFileSync(new URL("../supabase/migrations/20261002230000_masters_weekend_room_publication_independent_of_classification.sql", import.meta.url), "utf8")
  const baseSchema = readFileSync(new URL("../major_masters_signup_groups_and_cut.sql", import.meta.url), "utf8")
  const saveRoom = roomMigration.match(/create or replace function public\.save_major_schedule_group[\s\S]*?\n\$function\$;/i)?.[0] || ""
  assert.doesNotMatch(saveRoom, /Weekend rooms may be published only after/i)
  assert.match(roomMigration, /weekend field publication still requires classification finalization/i)
  assert.match(baseSchema, /Every active entrant must have a staged Main Event or secondary-field decision before publication/i)
})

test("public and player Masters room readers use publication state, not weekend classification", () => {
  const visibilityMigration = readFileSync(new URL("../supabase/migrations/20261003090000_masters_published_room_visibility_independent_of_classification.sql", import.meta.url), "utf8")
  const publicReader = visibilityMigration.match(/create or replace function public\.get_public_major_published_rooms[\s\S]*?\$function\$;/i)?.[0] || ""
  const playerReader = visibilityMigration.match(/create or replace function public\.get_my_major_signup_schedule[\s\S]*?as \$function\$[\s\S]*?\$function\$/i)?.[0] || ""
  assert.match(publicReader, /room\.is_published/)
  assert.doesNotMatch(publicReader, /weekend_status_published_at|competition_status|major_entry_weekend_status/)
  assert.match(playerReader, /room\.is_published/)
  assert.match(playerReader, /weekend_competition_status/)
  assert.doesNotMatch(playerReader, /day\.day_number <= 2 or event\.weekend_status_published_at is not null/)
  assert.match(playerReader, /'group_label', room\.group_label/)
  assert.match(playerReader, /'room_roster', case\s+when room\.id is not null/)
})

test("mixed weekend classifications may share one physical room without changing selected times", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261002205037_masters_weekend_rooms_independent_of_classification.sql", import.meta.url), "utf8")
  const validateMember = migration.match(/create or replace function public\.validate_major_group_member_row[\s\S]*?\n\$function\$;/i)?.[0] || ""
  const setWeekendStatus = migration.match(/create or replace function public\.set_major_weekend_status[\s\S]*?\n\$function\$;/i)?.[0] || ""

  assert.match(validateMember, /major_entry_day_choices/i)
  assert.match(validateMember, /choice\.play_day_id = new\.play_day_id/i)
  assert.match(validateMember, /choice\.time_slot_id = new\.time_slot_id/i)
  assert.doesNotMatch(validateMember, /major_entry_weekend_status|competition_status|room_competition/i)
  assert.doesNotMatch(setWeekendStatus, /delete from public\.major_schedule_group_members/i)
  assert.match(setWeekendStatus, /insert into public\.major_entry_weekend_status/i)
  assert.match(setWeekendStatus, /update public\.major_final_placements/i)
})

test("weekend classification publication safety and room classification guidance remain explicit", () => {
  const baseSchema = readFileSync(new URL("../major_masters_signup_groups_and_cut.sql", import.meta.url), "utf8")
  const page = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")

  assert.match(baseSchema, /Every active entrant must have a staged Main Event or secondary-field decision before publication/i)
  assert.match(page, /Room competition display/)
  assert.match(page, /Player classifications remain individual and do not limit who may share this physical room\./)
})

test("Round 3 and Final Round score entry use published rooms, not weekend classification publication", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261003093000_masters_score_entry_independent_of_classification.sql", import.meta.url), "utf8")
  const scoringWindow = migration.match(/create or replace function public\.major_player_round_scoring_window[\s\S]*?\$function\$;/i)?.[0] || ""

  assert.match(scoringWindow, /room\.is_published/)
  assert.match(scoringWindow, /between 2 and 4/)
  assert.doesNotMatch(scoringWindow, /weekend_status_published_at|major_entry_weekend_status|competition_status/)
  assert.doesNotMatch(scoringWindow, /day\.day_number\s*<=\s*2\s+or/i)
  assert.match(scoringWindow, /interval '3 hours'/i)
})
