import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

test("admin review API authorizes before service-role access", () => {
  const source = read("app/api/admin/scorecards/route.ts")
  for (const method of ["GET", "PATCH"]) {
    const start = source.indexOf(`export async function ${method}`)
    const next = source.indexOf("export async function", start + 1)
    const body = source.slice(start, next < 0 ? undefined : next)
    assert.ok(body.indexOf("await authorizeSiteAdminMutation()") >= 0)
    assert.ok(body.indexOf("authorizeSiteAdminMutation") < body.indexOf("createScorecardServiceClient"))
  }
})

test("Discord bridge uses a dedicated secret and never accepts destination configuration", () => {
  const bridge = read("lib/scorecards/bridge.ts")
  const authorize = read("app/api/internal/scorecards/discord/authorize/route.ts")
  const upload = read("app/api/internal/scorecards/discord/upload/route.ts")
  assert.match(bridge, /SCORECARD_BRIDGE_SECRET/)
  assert.doesNotMatch(`${bridge}${authorize}${upload}`, /DISCORD_BOT_TOKEN|NEXT_PUBLIC_SCORECARD|channelId|discordApiUrl/)
  assert.match(bridge, /timingSafeEqual/)
  assert.match(bridge, /MAX_CLOCK_SKEW_SECONDS = 300/)
})

test("exact participant authorization is canonical and does not trust browser player IDs", () => {
  const server = read("lib/scorecards/server.ts")
  const upload = read("app/api/internal/scorecards/discord/upload/route.ts")
  assert.match(server, /resolveCanonicalDiscordPlayer/)
  assert.match(server, /context\.participants\.some\(\(participant\) => participant\.playerId === playerId\)/)
  assert.doesNotMatch(upload, /playerId|channelId|storagePath/)
  assert.match(server, /upsert: false/)
})

test("public league pages do not contain shared scorecard admin or Discord controls", () => {
  for (const path of ["app/match-play/page.tsx", "app/stroke/page.tsx"]) {
    const source = read(path)
    assert.doesNotMatch(source, /SUBMIT SCORECARD|VERIFY \/ SAVE RESULT|SCORECARD_BRIDGE_SECRET/)
  }
})
