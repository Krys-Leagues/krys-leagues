import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = process.cwd()
const read = (path) => readFileSync(`${root}/${path}`, "utf8")

test("changed-source admin boundary audit passes", () => {
  execFileSync(process.execPath, ["scripts/audit-admin-data-boundary.mjs", "--changed"], { cwd: root, stdio: "pipe" })
})

test("player merge browser page has no direct Supabase access", () => {
  const source = read("app/admin/players/merge/page.tsx")
  assert.doesNotMatch(source, /supabase\.(from|rpc)\(/)
  assert.match(source, /\/api\/admin\/players\/merge/)
})

test("protected merge route authorizes before service-role client creation", () => {
  const source = read("app/api/admin/players/merge/route.ts")
  assert.match(source, /authorizeSiteAdminMutation\(\)/)
  assert.ok(source.indexOf("authorizeSiteAdminMutation()") < source.indexOf("createAdminIdentityClient()"))
})

test("site-admin contract is centralized and identity independent", () => {
  const source = read("lib/auth/siteAdminMutation.test.ts")
  assert.match(source, /401/)
  assert.match(source, /403/)
  assert.match(source, /assert\.equal\(result\.authorized, true\)/)
  assert.doesNotMatch(source, /Krys|Paul|Dawn|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
})
