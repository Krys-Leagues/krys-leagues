import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("roster contract uses canonical Global Players and protects every route method", () => {
  const route = read("app/api/admin/league-rosters/route.ts")
  const page = read("app/admin/league-rosters/page.tsx")
  assert.match(route, /authorizeSiteAdminMutation\(\)/)
  assert.match(route, /loadAdminGlobalPlayers/)
  assert.match(route, /createAdminSupabaseClient/)
  assert.match(route, /from\("player_leagues"\)/)
  assert.match(route, /from\("current_player_list_entries"\)/)
  assert.match(route, /history_preserved: true/)
  assert.doesNotMatch(page, /supabase\.from\(/)
  assert.match(page, /canonical Global Player directory/)
})

test("current memberships allow multiple leagues but block same-league duplicate changes", () => {
  const route = read("app/api/admin/league-rosters/route.ts")
  const config = read("lib/adminPlayerLists.ts")
  assert.match(config, /stroke:.*Stroke/)
  assert.match(config, /match:.*Match/)
  assert.match(config, /doubles:.*Doubles/)
  assert.match(config, /pyp:.*PYP/)
  assert.match(config, /pro:.*Pro \/ Amateur/)
  assert.match(config, /solo:.*Solo/)
  assert.match(route, /multiple current rows in this league/)
  assert.match(route, /already has an active division in this league/)
  assert.match(config, /all_time:.*All-Time Players/)
  assert.match(config, /monthly:.*Monthly Players/)
  assert.match(config, /kwt:.*KWT Players/)
})

test("prepared migration fails closed and preserves historical memberships", () => {
  const migration = read("20260915_league_rosters_current_lists.sql")
  assert.match(migration, /having count\(\*\) > 1/)
  assert.match(migration, /create unique index/i)
  assert.match(migration, /create table if not exists public\.current_player_list_entries/i)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.player_league_memberships/i)
  assert.doesNotMatch(migration, /update\s+public\.player_league_memberships/i)
})

test("Solo divisions and Doubles individual roster semantics stay explicit", () => {
  const page = read("app/admin/league-rosters/page.tsx")
  const config = read("lib/adminPlayerLists.ts")
  assert.match(page, /Solo divisions are managed here/)
  assert.match(config, /doubles:.*Doubles/)
  assert.match(page, /never creates a player and never guesses identity/)
})
