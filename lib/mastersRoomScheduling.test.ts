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

test("Masters rooms accept one through four players", () => {
  assert.equal(MASTERS_ROOM_MAX_PLAYERS, 4)
  for (let size = 1; size <= MASTERS_ROOM_MAX_PLAYERS; size += 1) {
    assert.equal(validateMastersRoomPlayerIds(ids.slice(0, size)), null)
  }
})

test("Masters rooms reject empty, duplicate, and five-player rosters", () => {
  assert.match(validateMastersRoomPlayerIds([]) || "", /at least one player/i)
  assert.match(validateMastersRoomPlayerIds(ids) || "", /maximum of 4 players/i)
  assert.match(validateMastersRoomPlayerIds([ids[0], ids[0]]) || "", /only once/i)
})

test("admin private save and publish both use the validated four-player roster", () => {
  const page = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")
  assert.match(page, /const entryIds = data\.getAll\("entry"\)\.map\(String\)/)
  assert.match(page, /validateMastersRoomPlayerIds\(entryIds\)/)
  assert.match(page, /p_is_published: publish/)
  assert.match(page, /p_entry_ids: entryIds/)
  assert.match(page, />Save privately</)
  assert.match(page, />Save & publish</)
})

test("database RPC accepts up to four and rejects five or more", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260930155336_allow_four_player_masters_rooms.sql", import.meta.url), "utf8")
  assert.match(migration, /cardinality\(coalesce\(p_entry_ids,array\[\]::uuid\[\]\)\) not between 1 and 4/i)
  assert.match(migration, /Masters rooms require 1 to 4 players\./)
  assert.match(migration, /security definer set search_path to ''/i)
})

test("room reload and player schedule render every persisted roster member", () => {
  const admin = readFileSync(new URL("../app/admin/majors/scheduling/page.tsx", import.meta.url), "utf8")
  const player = readFileSync(new URL("../app/majors/[slug]/page.tsx", import.meta.url), "utf8")
  const rosterSql = readFileSync(new URL("../major_player_room_roster.sql", import.meta.url), "utf8")

  assert.match(admin, /major_schedule_group_members"\)\.select\("\*"\)/)
  assert.match(admin, /members\.filter\(\(member\) => member\.group_id === group\.id\)/)
  assert.match(player, /assignment\.room_roster\?\.map\(\(member\)/)
  assert.doesNotMatch(player, /room_roster\?\.(?:slice|splice)\(/)
  assert.match(rosterSql, /where room_member\.group_id = g\.id/)
  assert.doesNotMatch(rosterSql, /limit\s+[1-3]\b/i)
})
