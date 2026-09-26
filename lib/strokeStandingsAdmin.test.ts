import { readFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"

const page = readFileSync(new URL("../app/admin/stroke/standings/page.tsx", import.meta.url), "utf8")
const route = readFileSync(new URL("../app/api/admin/stroke/standings/route.ts", import.meta.url), "utf8")

test("Stroke standings do not read public.players from the browser", () => {
  assert.doesNotMatch(page, /from\("players"\)/)
  assert.match(page, /\/api\/admin\/stroke\/standings\?seasonId=/)
})

test("Stroke standings name resolution is server-side and admin-protected", () => {
  assert.match(route, /is_current_user_site_admin/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.SUPABASE_SECRET_KEY/)
  assert.match(route, /get_public_player_canonical_identity/)
  assert.match(route, /private, no-store/)
  assert.doesNotMatch(route, /Response\.json\(.*SUPABASE_SERVICE_ROLE_KEY/)
})
