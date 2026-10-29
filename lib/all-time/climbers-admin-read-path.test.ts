import { readFile } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"

test("Climbers admin data uses the protected server read path", async () => {
  const page = await readFile(new URL("../../app/admin/records/climbers/page.tsx", import.meta.url), "utf8")
  const route = await readFile(new URL("../../app/api/admin/records/climbers/route.ts", import.meta.url), "utf8")

  assert.match(page, /fetch\("\/api\/admin\/records\/climbers"/)
  assert.doesNotMatch(page, /from\("climbers_(seasons|events|event_passes)"\)/)
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/)
  assert.match(route, /from\("climbers_seasons"\)/)
  assert.match(route, /from\("climbers_events"\)/)
  assert.match(route, /from\("climbers_event_passes"\)/)
})
