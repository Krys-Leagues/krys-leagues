import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { MASTERS_ROOM_MAX_PLAYERS, validateMastersRoomPlayerIds } from "./mastersRoomScheduling.ts"

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
  assert.match(page, /disabled=\{selectedCount < 2 \|\| selectedCount > 4\}[\s\S]{0,200}>Save & publish</)
  assert.match(page, /disabled=\{selectedCount < 2\} \/> Room composition finalized/)
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
