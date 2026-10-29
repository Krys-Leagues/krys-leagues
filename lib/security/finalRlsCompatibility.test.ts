import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const browserFiles = [
  "app/schedule/page.tsx",
  "app/admin/doubles/results/page.tsx",
  "app/admin/match/schedule/page.tsx",
  "app/admin/match/results/page.tsx",
  "app/admin/results/page.tsx",
  "app/admin/pro/results/page.tsx",
  "app/admin/players/page.tsx",
  "app/admin/stroke/schedule/page.tsx",
  "app/admin/stroke/results/page.tsx",
  "components/admin/ManagedLeaguePlayersPage.tsx",
]

test("final RLS tables have no direct browser reads", async () => {
  for (const file of browserFiles) {
    const source = await readFile(file, "utf8")
    assert.doesNotMatch(source, /\.from\(["'](?:players|results|player_league_memberships|schedule)["']\)/)
  }
})

test("public and admin schedule readers use bounded protected server paths", async () => {
  const [publicRoute, adminRoute, publicHelper, adminHelper] = await Promise.all([
    readFile("app/api/public/schedule/route.ts", "utf8"),
    readFile("app/api/admin/schedules/route.ts", "utf8"),
    readFile("lib/public/scheduleRead.ts", "utf8"),
    readFile("lib/admin/scheduleRead.ts", "utf8"),
  ])

  assert.match(publicRoute, /createTrustedSupabaseClient/)
  assert.match(publicRoute, /id, league_type, division, season_number, game, course, player1_id, player2_id/)
  assert.match(adminRoute, /authorizeSiteAdminMutation/)
  assert.match(adminRoute, /createClient/)
  assert.doesNotMatch(adminRoute, /select\("\*"\)/)
  assert.match(publicHelper, /\/api\/public\/schedule/)
  assert.match(adminHelper, /\/api\/admin\/schedules/)
})

test("protected final-table server readers use trusted access where required", async () => {
  const sources = await Promise.all([
    readFile("app/api/recalculate-standings/route.ts", "utf8"),
    readFile("app/api/admin/stroke/post-schedule/route.ts", "utf8"),
    readFile("app/api/admin/kwt-website-recovery/route.ts", "utf8"),
    readFile("app/api/admin/monthly-website-recovery/route.ts", "utf8"),
    readFile("app/api/admin/records/arizona-modern/_shared.ts", "utf8"),
  ])
  for (const source of sources) assert.match(source, /createTrustedSupabaseClient/)
})
