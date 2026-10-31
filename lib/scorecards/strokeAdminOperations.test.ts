import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

test("Stroke admin operations authorize before service mutations", () => {
  const route = read("app/api/admin/stroke/manage/route.ts")
  assert.ok(route.indexOf("await authorizeSiteAdminMutation()") < route.indexOf("createScorecardServiceClient()"))
  assert.match(route, /rebuild_standings/)
  assert.match(route, /rebuild_stroke_standings/)
  assert.match(route, /create_board/)
  assert.match(route, /rebind_board/)
})

test("board binding uses only the exact per-division server environment variable", () => {
  const route = read("app/api/admin/stroke/manage/route.ts")
  assert.match(route, /DISCORD_STROKE_D\$\{board\.division\}_CHANNEL_ID/)
  assert.match(route, /process\.env\[channelKey\]/)
  assert.match(route, /!\/\^\\d\+\$\//)
  assert.doesNotMatch(route, /body\.channelId|body\.discordChannelId/)
})

test("rebind and create reset the same authoritative outbox row", () => {
  const route = read("app/api/admin/stroke/manage/route.ts")
  assert.match(route, /onConflict: "season_id,division_number"/)
  assert.match(route, /discord_message_id: null/)
  assert.match(route, /attempt_count: 0/)
  assert.match(route, /claim_token: null/)
  assert.match(route, /reason: action === "rebind_board" \? "admin_rebind" : "admin_create"/)
})

test("admin UI exposes rebuild and explicit board binding controls", () => {
  const standings = read("app/admin/stroke/standings/page.tsx")
  const manage = read("components/admin/scorecards/ManageStrokeSeasonClient.tsx")
  assert.match(standings, /Rebuild Standings/)
  assert.match(manage, /REBUILD STANDINGS/)
  assert.match(manage, /REBIND BOARD/)
  assert.match(manage, /CREATE \/ BIND BOARD/)
  assert.match(manage, /RETRY LIVE BOARD SYNC/)
})
