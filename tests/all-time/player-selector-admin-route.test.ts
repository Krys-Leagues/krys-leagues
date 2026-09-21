import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { canonicalAdminPlayerChoices } from "../../lib/identity/adminGlobalPlayerCore.ts"

const pagePath = "app/admin/records/entry/page.tsx"
const routePath = "app/api/admin/records/player-search/route.ts"

test("admin Global Player choices resolve canonical ids and preserve screen-name search", () => {
  const choices = canonicalAdminPlayerChoices(
    [
      { id: "canonical", screen_name: "Krys", status: "active", active: true },
      { id: "historical", screen_name: "Old Krys", status: "active", active: true },
      { id: "inactive", screen_name: "Inactive", status: "inactive", active: true },
    ],
    [{ historical_player_id: "historical", canonical_player_id: "canonical" }],
    "kry",
  )

  assert.deepEqual(choices, [{ id: "canonical", screen_name: "Krys" }])
})

test("admin Global Player choices support punctuation-safe screen-name search", () => {
  const choices = canonicalAdminPlayerChoices(
    [{ id: "player-1", screen_name: "5.0JIM", status: "active", active: true }],
    [],
    "5 0",
  )

  assert.deepEqual(choices, [{ id: "player-1", screen_name: "5.0JIM" }])
})

test("All-Time selector uses the protected admin lookup and keeps PB/period readers", async () => {
  const [page, route, recordsRoute] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(routePath, "utf8"),
    readFile("app/api/admin/records/route.ts", "utf8"),
  ])

  assert.match(page, /fetch\(`\/api\/admin\/records\/player-search\?q=/)
  assert.doesNotMatch(page, /from\(["']players["']\)/)
  assert.match(page, /adminRecordsRequest[\s\S]{0,120}entry_bests/)
  assert.match(recordsRoute, /all_time_best_records/)
  assert.match(page, /value="current"/)
  assert.match(page, /value="previous"/)
  assert.match(page, /value="two_periods_ago"/)
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /return authorization\.response/)
  assert.match(route, /loadAdminGlobalPlayers/)
})

test("admin lookup route cannot be used without the shared site-admin authorization", async () => {
  const route = await readFile(routePath, "utf8")
  const authorization = route.indexOf("await authorizeSiteAdminMutation()")
  const denial = route.indexOf("return authorization.response")
  const dataLookup = route.indexOf("loadAdminGlobalPlayers(search)")

  assert.ok(authorization >= 0)
  assert.ok(denial > authorization)
  assert.ok(dataLookup > denial)
})
