import { readFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"

const read = (path: string) => readFileSync(path, "utf8")
const targetTables = [
  "pyp_division_roster_slots",
  "pyp_final_scorecard_entries",
  "pyp_final_scorecards",
  "pyp_final_scorecard_fixture_details",
  "pyp_final_scorecard_player_decisions",
  "pyp_managed_results",
  "pyp_schedule_state",
  "pyp_roster_versions",
]

test("PYP admin data route is site-admin protected and service-role backed", () => {
  const route = read("app/api/admin/pyp/data/route.ts")
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY\s*\|\|\s*process\.env\.SUPABASE_SECRET_KEY/)
  for (const table of targetTables) assert.match(route, new RegExp(`from\\(\\"${table}\\"\\)`))
})

test("PYP browser/admin code has no direct target-table reads", () => {
  const files = [
    "app/admin/pyp/page.tsx",
    "app/admin/pyp/season/edit/page.tsx",
    "app/admin/pyp/setup/page.tsx",
    "app/admin/pyp/schedule/page.tsx",
    "app/admin/pyp/results/page.tsx",
    "app/admin/pyp/standings/page.tsx",
    "app/admin/pyp/transition/page.tsx",
    "components/admin/ManagedLeaguePlayersPage.tsx",
  ]
  const source = files.map(read).join("\n")
  for (const table of targetTables) assert.doesNotMatch(source, new RegExp(`\\.from\\(\\"${table}\\"\\)`))
})

test("public PYP readers remain RPC-based", () => {
  const standings = read("app/pyp-standings/page.tsx")
  const profile = read("app/players/[id]/page.tsx")
  assert.match(standings, /list_public_pyp_final_scorecard_seasons/)
  assert.match(standings, /get_public_pyp_final_scorecard/)
  assert.match(profile, /get_public_pyp_player_history/)
})
