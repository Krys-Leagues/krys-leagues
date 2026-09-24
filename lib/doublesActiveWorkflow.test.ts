import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const files = [
  "app/api/admin/doubles/roster/route.ts",
  "app/api/admin/doubles/schedule/route.ts",
  "app/api/admin/doubles/results/route.ts",
]
const source = files.map((file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))

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
})
