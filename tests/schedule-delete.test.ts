import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("public schedule deletion uses the protected site-admin endpoint", async () => {
  const page = await readFile("app/schedule/page.tsx", "utf8")
  const route = await readFile("app/api/delete-schedule/route.ts", "utf8")

  assert.match(page, /fetch\("\/api\/delete-schedule"/)
  assert.doesNotMatch(page, /from\("schedule"\)\s*\.delete\(\)/)
  assert.match(route, /authorizeSiteAdminMutation\(\)/)
  assert.match(route, /\.from\("schedule"\)/)
  assert.match(route, /\.delete\(\)/)
  assert.match(route, /\.eq\("id", id\)/)
})

test("schedule deletion does not introduce player-owned authorization", async () => {
  const route = await readFile("app/api/delete-schedule/route.ts", "utf8")
  assert.doesNotMatch(route, /screen_name|player1_id|player2_id|canonical_player_id/)
})
