import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("PUBLIC live routes do not require the tester database lookup", async () => {
  const source = await readFile("proxy.ts", "utf8")
  assert.match(source, /const needsAccess = mode === "prelaunch" \|\| Boolean\(feature && feature\.visibility !== "live"\)/)
  assert.match(source, /if \(session\.user && needsAccess\)/)
})

test("proxy protects nested player and API routes by default", async () => {
  const source = await readFile("proxy.ts", "utf8")
  assert.match(source, /testingAccessRedirect\(original\)/)
  assert.match(source, /pathname\.startsWith\("\/api\/"\)/)
  assert.match(source, /getFeatureRoute\(pathname\)/)
})

test("testing boundary supports sign in and authenticated sign out", async () => {
  const source = await readFile("app/testing-access/DiscordTestingAccessActions.tsx", "utf8")
  assert.match(source, /signInWithOAuth/)
  assert.match(source, /supabase\.auth\.signOut\(\)/)
  assert.match(source, /Sign Out \/ Try Another Discord Account/)
})

test("SQL stores canonical player IDs and never email or display names", async () => {
  const sql = await readFile("site_prelaunch_access.sql", "utf8")
  assert.match(sql, /player_id uuid primary key references public\.players\(id\)/)
  assert.match(sql, /resolve_canonical_player_id\(p_player_id\) is distinct from p_player_id/)
  assert.match(sql, /current_user_canonical_player_id\(\)/)
  assert.match(sql, /is_current_user_site_admin\(\)/)
  assert.doesNotMatch(sql, /email|discord_name|discord_username|screen_name\s*=/i)
})
