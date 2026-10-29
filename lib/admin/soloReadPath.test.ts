import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = process.cwd()
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8")

const adminPages = [
  "app/admin/solo/page.tsx",
  "app/admin/solo/season/page.tsx",
  "app/admin/solo/setup/page.tsx",
  "app/admin/solo/weeks/page.tsx",
  "app/admin/solo/standings/page.tsx",
  "app/admin/solo/results/page.tsx",
]

const targetTables = [
  "solo_admin_users",
  "solo_player_pool",
  "solo_weeks",
  "solo_trophies",
  "solo_week_snapshot_entries",
  "solo_week_snapshots",
  "solo_score_attempts",
  "solo_roster_versions",
  "solo_roster_entries",
]

test("Solo admin pages do not directly query protected base tables", () => {
  for (const path of adminPages) {
    const source = read(path)
    for (const table of targetTables) {
      assert.doesNotMatch(source, new RegExp(`from\\(\\s*["']${table}["']`), `${path} directly queries ${table}`)
    }
  }
})

test("Solo admin data route is site-admin protected and trusted-server backed", () => {
  const source = read("app/api/admin/solo/data/route.ts")
  assert.match(source, /authorizeSiteAdminMutation\(\)/)
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(source, /createClient\(/)
})

test("Public Solo pages use the protected public reader", () => {
  assert.match(read("app/solo/page.tsx"), /get_public_solo/)
  assert.match(read("app/solo/hall-of-fame/page.tsx"), /get_public_solo/)
})

test("Solo mutation RPC workflows remain unchanged", () => {
  assert.match(read("app/admin/solo/setup/page.tsx"), /save_solo_roster/)
  assert.match(read("app/admin/solo/weeks/page.tsx"), /close_solo_week/)
  assert.match(read("app/admin/solo/weeks/page.tsx"), /reopen_solo_week/)
  assert.match(read("app/admin/solo/results/page.tsx"), /save_solo_card/)
  assert.match(read("app/admin/solo/results/page.tsx"), /delete_solo_score_attempt/)
})
