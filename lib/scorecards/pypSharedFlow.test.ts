import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("PYP component intake and protected review preserve private two-course workflow", async () => {
  const [server, admin, authorize, upload, reviewer] = await Promise.all([readFile("lib/scorecards/server.ts", "utf8"), readFile("lib/scorecards/adminServer.ts", "utf8"), readFile("app/api/internal/scorecards/discord/authorize/route.ts", "utf8"), readFile("app/api/internal/scorecards/discord/upload/route.ts", "utf8"), readFile("components/admin/scorecards/SharedScorecardReviewer.tsx", "utf8")])
  assert.match(server, /resolvePypScorecardContext/); assert.match(server, /pyp_home_player_id/); assert.match(server, /pyp_division_roster_slots/); assert.match(server, /component_key: options\.componentKey/); assert.match(server, /upsert: false/)
  assert.match(authorize, /componentKey/); assert.match(upload, /x-krys-scorecard-component/); assert.match(admin, /waitingForComponents: true/); assert.match(admin, /pypScorecardAdapter/); assert.match(reviewer, /COURSE 1 SCORECARD/); assert.match(reviewer, /COURSE 2 SCORECARD/)
})
test("manual PYP fallback remains on the same authoritative writer", async () => { const page = await readFile("app/admin/pyp/results/page.tsx", "utf8"); assert.match(page, /save_pyp_result/); assert.match(page, /rebuild_pyp_standings/) })
