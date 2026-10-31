import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const schedulingPath = "app/admin/majors/scheduling/page.tsx"
const scoringPath = "app/admin/majors/scoring/page.tsx"
const eventEditorPath = "app/admin/majors/page.tsx"
const verificationPath = "app/admin/majors/verification/page.tsx"
const clientPath = "lib/identity/adminGlobalPlayerClient.ts"
const routePath = "app/api/admin/records/player-search/route.ts"
const lookupPath = "lib/identity/adminGlobalPlayerLookup.ts"

test("Majors admin player consumers use the protected admin reader instead of browser table access", async () => {
  const [scheduling, scoring, eventEditor, verification, client] = await Promise.all([
    readFile(schedulingPath, "utf8"),
    readFile(scoringPath, "utf8"),
    readFile(eventEditorPath, "utf8"),
    readFile(verificationPath, "utf8"),
    readFile(clientPath, "utf8"),
  ])

  assert.match(scheduling, /loadProtectedAdminGlobalPlayers/)
  assert.match(scoring, /loadProtectedAdminGlobalPlayers/)
  assert.doesNotMatch(scheduling, /loadGlobalPlayerDirectory/)
  assert.doesNotMatch(scoring, /loadGlobalPlayerDirectory/)
  assert.doesNotMatch(scheduling, /from\(["']players["']\)/)
  assert.doesNotMatch(scoring, /from\(["']players["']\)/)
  assert.doesNotMatch(eventEditor, /from\(["']players["']\)/)
  assert.doesNotMatch(verification, /from\(["']players["']\)/)
  assert.match(client, /\/api\/admin\/records\/player-search\?q=/)
  assert.match(client, /details=identity/)
  assert.doesNotMatch(client, /from\(["']players["']\)/)
})

test("the shared lookup remains site-admin protected and canonical", async () => {
  const [route, lookup] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(lookupPath, "utf8"),
  ])

  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /return authorization\.response/)
  assert.match(route, /loadAdminGlobalPlayerDirectory/)
  assert.match(lookup, /from\("players"\)/)
  assert.match(lookup, /resolveCanonicalId/)
  assert.match(lookup, /screenName: player\.screen_name/)
})

test("the protected reader does not expose browser credentials or make mutation calls", async () => {
  const [client, route] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(routePath, "utf8"),
  ])

  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/)
  assert.doesNotMatch(client, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
})
