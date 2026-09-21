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

for (const [page, endpoint] of [
  ["app/admin/player-matching/page.tsx", "/api/admin/player-matching"],
  ["app/admin/player-tracker/page.tsx", "/api/admin/player-tracker"],
  ["app/admin/waitlist/page.tsx", "/api/admin/waitlist"],
  ["components/admin/ManagedLeaguePlayersPage.tsx", "/api/admin/managed-league-players"],
]) {
  test(`${page} uses its protected server route`, () => {
    const source = read(page)
    assert.doesNotMatch(source, /supabase\.(from|rpc)\(/)
    assert.match(source, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  })
}

for (const page of [
  "app/admin/pyp/setup/page.tsx",
  "app/admin/pyp/season/page.tsx",
  "app/admin/pyp/season/edit/page.tsx",
  "app/admin/pyp/schedule/page.tsx",
  "app/admin/pyp/results/page.tsx",
  "app/admin/pyp/standings/page.tsx",
  "app/admin/pyp/transition/page.tsx",
]) {
  test(`${page} has no direct protected Supabase access`, () => {
    const source = read(page)
    assert.doesNotMatch(source, /supabase\.(from|rpc)\(/)
    assert.match(source, /adminPypRequest/)
  })
}

for (const route of ["app/api/admin/pyp/route.ts", "app/api/admin/managed-season/route.ts"]) {
  test(`${route} authorizes before managed-league protected access`, () => {
    const source = read(route)
    const postSource = source.slice(source.indexOf("export async function POST"))
    const authIndex = postSource.indexOf("authorizeSiteAdminMutation()")
    assert.ok(authIndex >= 0)
    assert.ok(authIndex < postSource.indexOf("authorization.supabase"))
  })
}

for (const page of ["app/admin/stroke/results/page.tsx", "app/admin/match/results/page.tsx"]) {
  test(`${page} uses the managed-league server boundary`, () => {
    const source = read(page)
    assert.doesNotMatch(source, /supabase\.(from|rpc)\(/)
    assert.match(source, /adminManagedLeagueRequest/)
  })
}

test("managed-league route authorizes before protected access", () => {
  const source = read("app/api/admin/managed-league/route.ts")
  const postSource = source.slice(source.indexOf("export async function POST"))
  assert.ok(postSource.indexOf("authorizeSiteAdminMutation()") < postSource.indexOf("createAdminServiceClient()"))
})

for (const route of [
  "app/api/admin/player-matching/route.ts",
  "app/api/admin/player-tracker/route.ts",
  "app/api/admin/waitlist/route.ts",
  "app/api/admin/managed-league-players/route.ts",
]) {
  test(`${route} authorizes before protected access`, () => {
    const source = read(route)
    assert.ok(source.indexOf("authorizeSiteAdminMutation()") >= 0)
    const authIndex = source.indexOf("authorizeSiteAdminMutation()")
    const protectedIndex = Math.min(...["createAdminServiceClient()", ".from(\"players\")", ".from(\"player_waitlist\")"].map((marker) => {
      const index = source.indexOf(marker)
      return index < 0 ? Number.MAX_SAFE_INTEGER : index
    }))
    assert.ok(authIndex < protectedIndex)
  })
}

test("site-admin contract is centralized and identity independent", () => {
  const source = read("lib/auth/siteAdminMutation.test.ts")
  assert.match(source, /401/)
  assert.match(source, /403/)
  assert.match(source, /assert\.equal\(result\.authorized, true\)/)
  assert.doesNotMatch(source, /Krys|Paul|Dawn|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
})
