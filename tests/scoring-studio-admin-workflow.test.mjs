import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (path) => readFileSync(new URL(path, `file://${root.replaceAll("\\", "/")}/`), "utf8")

test("admin score entry is selected-player only and saves through the audited Studio RPC", () => {
  const source = read("components/liveScoring/LiveStudio.tsx")
  assert.match(source, /adminView === "scores"/)
  assert.match(source, /Search registered Global Players/)
  assert.match(source, /aria-label="Scoring round" value=\{roundId\}/)
  assert.match(source, /players\.filter\(\(player\) => player\.screenName\.toLocaleLowerCase\(\)\.includes\(adminPlayerSearch/)
  assert.match(source, /setPlayerId\(exactMatches\.length === 1 \? exactMatches\[0\]\.id : ""\)/)
  assert.match(source, /const fieldKey = `\$\{roundId\}:\$\{currentPlayer\.id\}`; const rowValues = adminFieldHoles\[fieldKey\] \?\? Array\.from\(\{ length: 18 \}/)
  assert.match(source, /activeRound\.par_by_hole\.map/)
  assert.match(source, /rowValues\.map\(\(value, index\)/)
  assert.match(source, /saveFieldScore\(currentPlayer\.id, rowValues, false\)/)
  assert.match(source, /saveFieldScore\(currentPlayer\.id, rowValues, true\)/)
  assert.match(source, /scoring_studio_save_score_v1/)
  assert.match(source, /adminView === "rooms" \? <label className=\{styles\.playerPicker\}>Registered Global Player/)
  assert.doesNotMatch(source, /players\.map\(\(fieldPlayer\)/)
})

test("score-entry player and round selectors live in the score card instead of the page toolbar", () => {
  const source = read("components/liveScoring/LiveStudio.tsx")
  assert.match(source, /adminView === "scores" && <section className=\{styles\.panel\}>[\s\S]*?className=\{styles\.adminScoreSelectors\}[\s\S]*?className=\{styles\.adminScoreEntry\}/)
  assert.match(source, /\(!adminOnly \|\| adminView === "rooms" \|\| adminView === "leaderboard"\) && <section className=\{styles\.toolbar\}/)
  assert.match(source, /<button type="button" disabled=\{busy \|\| !running\.holes\} onClick=\{\(\) => void saveFieldScore\(currentPlayer\.id, rowValues, false\)\}>Save provisional/)
  assert.match(source, /<button type="button" className=\{styles\.primary\} disabled=\{busy \|\| !running\.holes\} onClick=\{\(\) => void saveFieldScore\(currentPlayer\.id, rowValues, true\)\}>Save verified/)
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

test("Admin Leaderboard renders one board while other Admin views retain their current board rendering", () => {
  const source = read("components/liveScoring/LiveStudio.tsx")
  assert.match(source, /\(adminOnly \? adminView !== "leaderboard" : tab === "leaderboard"\) && <section id="scoring-board"/)
  assert.match(source, /\(\(!adminOnly && tab === "leaderboard"\) \|\| \(adminOnly && adminView === "leaderboard"\)\) && <section id="scoring-board"/)
})

test("room RLS migration removes the recursive subqueries and grants only own canonical identity resolution", () => {
  const sql = read("supabase/migrations/20261113180000_scoring_studio_admin_access_and_room_rls_fix.sql")
  assert.match(sql, /drop policy if exists scoring_studio_rooms_read/i)
  assert.match(sql, /drop policy if exists scoring_studio_room_members_read/i)
  assert.equal((sql.match(/scoring_studio_room_access_v1\(/g) || []).length, 2)
  assert.match(sql, /grant execute on function public\.current_major_player_id\(\) to authenticated/i)
  assert.doesNotMatch(sql, /\b(delete from|truncate|drop table|alter table|update public\.)/i)
})

test("Room Builder lists rooms from every round and selects the room's round before editing", () => {
  const source = read("components/liveScoring/LiveStudio.tsx")
  assert.match(source, /rooms\.map\(\(room\) => <option key=\{room\.id\} value=\{room\.id\}>R\{rounds\.find\(\(round\) => round\.id === room\.round_id\)\?\.round_number \?\? "\?"\}/)
  assert.doesNotMatch(source, /rooms\.filter\(\(room\) => room\.round_id === roundId\)/)
  assert.match(source, /setRoomId\(event\.target\.value\); if \(room\) \{ setRoundId\(room\.round_id\); setRoomName\(room\.room_name\)/)
  assert.match(source, /setRoundId\(r\.id\); if \(selectedRoom && selectedRoom\.round_id !== r\.id\) \{ setRoomId\(""\)/)
})
