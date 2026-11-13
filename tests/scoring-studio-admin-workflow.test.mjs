import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (path) => readFileSync(new URL(path, `file://${root.replaceAll("\\", "/")}/`), "utf8")

test("admin score entry is selected-player only and saves through the audited Studio RPC", () => {
  const source = read("components/liveScoring/LiveStudio.tsx")
  assert.match(source, /adminView === "scores"/)
  assert.match(source, /Registered Global Player<select value=\{playerId\}/)
  assert.match(source, /activeRound\.par_by_hole\.map/)
  assert.match(source, /rowValues\.map\(\(value, index\)/)
  assert.match(source, /saveFieldScore\(currentPlayer\.id, rowValues, false\)/)
  assert.match(source, /saveFieldScore\(currentPlayer\.id, rowValues, true\)/)
  assert.match(source, /scoring_studio_save_score_v1/)
  assert.doesNotMatch(source, /players\.map\(\(fieldPlayer\)/)
})

test("Admin workflow routes are distinct and continue using instance-scoped Admin authorization", () => {
  const routes = [
    ["app/scoring-studio/[slug]/admin/page.tsx", "scores"],
    ["app/scoring-studio/[slug]/admin/rooms/page.tsx", "rooms"],
    ["app/scoring-studio/[slug]/admin/leaderboard/page.tsx", "leaderboard"],
  ]
  for (const [path, view] of routes) {
    const source = read(path)
    assert.match(source, /LiveStudio adminOnly/)
    if (view !== "scores") assert.ok(source.includes(`adminView="${view}"`))
    assert.match(source, /instanceSlug=\{slug\}/)
  }
  assert.match(read("components/liveScoring/LiveStudio.tsx"), /scoring_studio_is_admin/)
})

test("room RLS migration removes the recursive subqueries and grants only own canonical identity resolution", () => {
  const sql = read("supabase/migrations/20261113180000_scoring_studio_admin_access_and_room_rls_fix.sql")
  assert.match(sql, /drop policy if exists scoring_studio_rooms_read/i)
  assert.match(sql, /drop policy if exists scoring_studio_room_members_read/i)
  assert.equal((sql.match(/scoring_studio_room_access_v1\(/g) || []).length, 2)
  assert.match(sql, /grant execute on function public\.current_major_player_id\(\) to authenticated/i)
  assert.doesNotMatch(sql, /\b(delete from|truncate|drop table|alter table|update public\.)/i)
})
