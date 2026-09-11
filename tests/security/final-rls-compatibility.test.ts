import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("dashboard and public profile do not read protected tables in the browser", () => {
  const dashboard = read("app/dashboard/page.tsx") + read("app/player-dashboard/page.tsx")
  const profile = read("app/players/[id]/page.tsx")
  const browserSource = `${dashboard}\n${profile}`

  assert.doesNotMatch(browserSource, /\.from\("(?:players|player_league_memberships|results)"\)/)
  assert.match(dashboard, /\/api\/player-dashboard/)
  assert.match(profile, /\/api\/public\/player-profile\?id=/)
})

test("compatibility routes use bounded RPC contracts", () => {
  const dashboardRoute = read("app/api/player-dashboard/route.ts")
  const profileRoute = read("app/api/public/player-profile/route.ts")
  const migration = read("supabase/migrations/20260911231000_final_dashboard_profile_read_paths.sql")

  assert.match(dashboardRoute, /get_current_user_dashboard_data/)
  assert.match(dashboardRoute, /createServerSupabaseClient/)
  assert.match(profileRoute, /get_public_player_profile_data/)
  assert.match(profileRoute, /createTrustedSupabaseClient/)
  assert.match(migration, /set search_path to ''/)
  assert.match(migration, /get_current_user_dashboard_data/)
  assert.match(migration, /get_public_player_profile_data\(p_player_id uuid\)/)
  assert.match(migration, /grant execute on function public\.get_current_user_dashboard_data\(\) to authenticated, service_role/)
  assert.match(migration, /grant execute on function public\.get_public_player_profile_data\(uuid\) to anon, authenticated, service_role/)
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all) on table public\.(?:players|player_league_memberships|results)/i)
})
