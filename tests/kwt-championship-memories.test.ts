import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const migration = readFileSync("supabase/migrations/20261027010000_kwt_championship_memories.sql", "utf8")
const publicPage = readFileSync("app/kwt/champions/page.tsx", "utf8")
const adminRoute = readFileSync("app/api/admin/kwt/championship-pages/route.ts", "utf8")

test("KWT championship memories are private until explicit publication", () => {
  assert.match(migration, /create table if not exists public\.kwt_championship_pages/)
  assert.match(migration, /alter table public\.kwt_championship_pages enable row level security/)
  assert.match(migration, /status in \('draft', 'approved', 'published', 'archived'\)/)
  assert.match(adminRoute, /authorizeSiteAdminMutation/)
  assert.match(adminRoute, /status === "published"/)
  assert.match(publicPage, /KWT Hall of Champions &amp; Memories/)
})

test("published KWT memories use the canonical award image and profile links", () => {
  const api = readFileSync("app/api/kwt/championships/route.ts", "utf8")
  assert.match(api, /eq\("status", "published"\)/)
  assert.match(api, /api\/trophies\/kwt-awards/)
  assert.match(api, /players\//)
})
