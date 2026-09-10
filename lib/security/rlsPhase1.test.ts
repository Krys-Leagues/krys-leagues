import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const browserMutationFiles = [
  "app/admin/players/page.tsx",
  "app/admin/waitlist/page.tsx",
  "app/admin/results/page.tsx",
  "app/admin/doubles/results/page.tsx",
  "app/admin/pro/results/page.tsx",
]

for (const file of browserMutationFiles) {
  test(`${file} has no direct players/results writes`, async () => {
    const source = await readFile(file, "utf8")
    assert.doesNotMatch(source, /from\(["']players["']\)[\s\S]{0,220}\.(insert|update|delete)\(/i)
    assert.doesNotMatch(source, /from\(["']results["']\)[\s\S]{0,220}\.(insert|update|delete)\(/i)
  })
}

test("Phase 1 mutations use the site-admin server routes", async () => {
  const [playersRoute, resultsRoute] = await Promise.all([
    readFile("app/api/admin/players/route.ts", "utf8"),
    readFile("app/api/admin/results/route.ts", "utf8"),
  ])
  assert.match(playersRoute, /authorizeSiteAdminMutation/)
  assert.match(resultsRoute, /authorizeSiteAdminMutation/)
  assert.match(playersRoute, /admin_create_player|admin_update_player_status/)
  assert.match(resultsRoute, /admin_insert_result/)
  assert.doesNotMatch(playersRoute, /SUPABASE_SERVICE_ROLE|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/i)
  assert.doesNotMatch(resultsRoute, /SUPABASE_SERVICE_ROLE|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/i)
})
