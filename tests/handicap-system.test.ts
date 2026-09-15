import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("handicap storage is forward-only and locked to service role", async () => {
  const migration = await readFile("20260915_handicap_system_forward.sql", "utf8")
  assert.match(migration, /create table if not exists public\.handicap_qualifying_rounds/i)
  assert.match(migration, /revoke all on public\.handicap_qualifying_rounds from anon, authenticated/i)
  assert.match(migration, /2026-09-15T00:00:00Z/)
  assert.doesNotMatch(migration, /insert\s+into|update\s+public\.|delete\s+from/i)
})

test("public and admin readers never use browser-side public.players reads", async () => {
  const publicRoute = await readFile("app/api/handicaps/public/route.ts", "utf8")
  const adminRoute = await readFile("app/api/admin/handicaps/route.ts", "utf8")
  assert.doesNotMatch(`${publicRoute}\n${adminRoute}`, /createBrowserClient|NEXT_PUBLIC_SUPABASE_ANON_KEY|from\(["']players["']\)/)
  assert.match(adminRoute, /authorizeSiteAdminMutation/)
})

test("handicap pages use canonical display names and expose no UUID fallback", async () => {
  const pages = await Promise.all([readFile("app/handicaps/page.tsx", "utf8"), readFile("app/admin/handicaps/page.tsx", "utf8")])
  assert.match(pages.join("\n"), /playerName/)
  assert.doesNotMatch(pages.join("\n"), /playerId\}\}|player_id\}\}/)
})

test("public Handicap Ladder is explicitly registered as live", async () => {
  const registry = await readFile("lib/featureVisibility/registry.ts", "utf8")
  assert.match(registry, /key: "handicaps", path: "\/handicaps", visibility: "live"/)
})
