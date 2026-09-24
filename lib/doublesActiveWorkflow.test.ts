import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const files = [
  "app/api/admin/doubles/roster/route.ts",
  "app/api/admin/doubles/schedule/route.ts",
  "app/api/admin/doubles/results/route.ts",
  "app/api/admin/doubles/legacy-mapping/route.ts",
]
const source = files.map((file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
const arrangeRoute = fs.readFileSync(new URL("../app/api/doubles/arrange/route.ts", import.meta.url), "utf8")
const participantServer = fs.readFileSync(new URL("../lib/doublesParticipantServer.ts", import.meta.url), "utf8")
const boardRoute = fs.readFileSync(new URL("../app/api/admin/doubles/boards/route.ts", import.meta.url), "utf8")

test("active Doubles admin routes authorize before canonical reads/writes", () => {
  for (const route of source) {
    const auth = route.indexOf("await authorizeSiteAdminMutation()")
    assert.notEqual(auth, -1)
    assert.ok(route.indexOf("authorization.supabase") > auth)
    assert.doesNotMatch(route, /doubles_teams|\.from\("schedule"\)|\.from\("results"\)/)
  }
})

test("active workflow SQL keeps privileged mutations database-authorized", () => {
  const sql = fs.readFileSync(new URL("../doubles_active_workflow.sql", import.meta.url), "utf8")
  assert.match(sql, /security definer set search_path to ''/gi)
  assert.match(sql, /is_current_user_site_admin\(\)/g)
  assert.match(sql, /revoke all on function public\.create_doubles_managed_fixture/)
  assert.match(sql, /grant execute on function public\.list_doubles_admin_roster/)
  assert.match(sql, /list_doubles_legacy_mapping_review/)
})

test("participant Arrange route resolves the session identity before service-side access", () => {
  assert.match(arrangeRoute, /authorizeDoublesParticipant\(fixtureId\)/)
  assert.match(participantServer, /Only the four scheduled Doubles players may access this fixture/)
  assert.match(arrangeRoute, /player_master_availability/)
  assert.match(arrangeRoute, /doubles_fixture_chat/)
  assert.match(arrangeRoute, /onConflict: "fixture_id,recipient_player_id,reminder_key"/)
})

test("board recovery exposes explicit retry and rebind without automatic replacement", () => {
  assert.match(boardRoute, /authorizeSiteAdminMutation\(\)/)
  assert.match(boardRoute, /body\.action === "retry"/)
  assert.match(boardRoute, /body\.action === "rebind"/)
  assert.doesNotMatch(boardRoute, /create.*message|create.*board/i)
})
