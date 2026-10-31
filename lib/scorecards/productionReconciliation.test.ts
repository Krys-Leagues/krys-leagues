import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

test("Production Stroke dashboard support remains intact", async () => {
  const [client, dashboard, migration] = await Promise.all([
    readFile("app/player-dashboard/PlayerDashboardClient.tsx", "utf8"),
    readFile("lib/playerDashboard.ts", "utf8"),
    readFile("supabase/migrations/20260918014650_player_dashboard_stroke_reader.sql", "utf8"),
  ])

  assert.match(client, /activeLeague === "stroke"/)
  assert.match(client, /<StrokeDashboardCard/)
  assert.match(dashboard, /key: "stroke", label: "Stroke"/)
  assert.match(migration, /public\.stroke_roster_versions/)
  assert.match(migration, /public\.current_user_canonical_player_id\(\)/)
})

test("static Stroke Discord sends and reminders are retired", async () => {
  const [resultsPage, strokeHub] = await Promise.all([
    readFile("app/admin/stroke/results/page.tsx", "utf8"),
    readFile("app/admin/stroke/page.tsx", "utf8"),
  ])

  assert.doesNotMatch(resultsPage, /SEND D\$\{division\} TO DISCORD|GAME REMINDER|\/api\/admin\/stroke\/discord|strokeDiscord/)
  assert.match(strokeHub, /Manage Current Season/)

  for (const retiredPath of [
    "app/api/admin/stroke/discord/route.ts",
    "lib/strokeDiscord.ts",
    "lib/strokeDiscordServer.ts",
    "lib/strokeDiscordSnapshot.tsx",
  ]) {
    await assert.rejects(access(retiredPath), { code: "ENOENT" })
  }
})

test("live board bridge remains D1-pilot gated and server-authoritative", async () => {
  const route = await readFile("app/api/internal/scorecards/stroke/boards/route.ts", "utf8")
  assert.match(route, /verifyScorecardBridgeRequest/)
  assert.match(route, /STROKE_SCORECARD_PILOT_DIVISIONS/)
  assert.ok(route.indexOf("await verifyScorecardBridgeRequest") < route.indexOf("body = parseVerifiedScorecardJson"))
  assert.doesNotMatch(route, /discordApiUrl|DISCORD_BOT_TOKEN/)
})
