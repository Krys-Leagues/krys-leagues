import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const browserMutationFiles = [
  "app/admin/players/page.tsx",
  "app/admin/waitlist/page.tsx",
  "app/admin/results/page.tsx",
  "app/admin/doubles/results/page.tsx",
  "app/admin/pro/results/page.tsx",
]

for (const file of browserMutationFiles) {
  test(`${file} has no direct players/results writes`, async () => {
    const source = await readFile(file, "utf8")
    assert.doesNotMatch(source, /from\(["']players["']\)[\s\S]{0,220}\.(insert|update|delete)\(/i)
    assert.doesNotMatch(source, /from\(["']results["']\)[\s\S]{0,220}\.(insert|update|delete)\(/i)
  })
}

test("Phase 1 mutations use the site-admin server routes", async () => {
  const [playersRoute, resultsRoute] = await Promise.all([
    readFile("app/api/admin/players/route.ts", "utf8"),
    readFile("app/api/admin/results/route.ts", "utf8"),
  ])
  assert.match(playersRoute, /authorizeSiteAdminMutation/)
  assert.match(resultsRoute, /authorizeSiteAdminMutation/)
  assert.match(playersRoute, /admin_create_player|admin_update_player_status/)
  assert.match(resultsRoute, /admin_insert_result/)
  assert.doesNotMatch(playersRoute, /SUPABASE_SERVICE_ROLE|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/i)
  assert.doesNotMatch(resultsRoute, /SUPABASE_SERVICE_ROLE|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/i)
})

test("Phase 1 support tables are RLS-protected with narrow policies", async () => {
  const migration = await readFile(
    "supabase/migrations/20260910190000_rls_phase1_support_tables.sql",
    "utf8",
  )
  const supportTables = [
    "season_standings",
    "player_league_memberships",
    "player_tournament_entries",
    "player_identity_links",
    "seasons",
    "schedule",
    "match_roster_versions",
    "match_division_roster_slots",
    "match_schedule_state",
    "match_final_scorecards",
    "stroke_roster_versions",
    "stroke_division_roster_slots",
    "stroke_schedule_state",
    "stroke_final_scorecards",
  ]

  for (const table of supportTables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(migration, /using \(\(select public\.is_current_user_site_admin\(\)\)\)/)
  assert.match(migration, /with check \(\(select public\.is_current_user_site_admin\(\)\)\)/)
  assert.match(migration, /alter function public\.get_public_player_canonical_identity\(uuid\) security invoker/)
  assert.doesNotMatch(migration, /create policy [^\n]+ on public\.(?:schedule|seasons|season_standings|player_league_memberships) for (?:insert|update|delete) to (?:anon|authenticated)[\s\S]{0,220}using \(true\)/i)
})
