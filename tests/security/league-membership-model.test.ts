import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)

async function source(path: string) {
  return readFile(new URL(path, root), "utf8")
}

test("league hubs do not use the global player manager for league Players", async () => {
  const hubs = [
    ["app/admin/pro/page.tsx", "/admin/pro/players"],
    ["app/admin/doubles/page.tsx", "/admin/doubles/players"],
    ["app/admin/kwt/page.tsx", "/admin/kwt/players"],
    ["app/admin/skins/page.tsx", "/admin/skins/players"],
    ["app/admin/match/page.tsx", "/admin/match/members"],
    ["app/admin/stroke/page.tsx", "/admin/stroke/members"],
    ["app/admin/pyp/page.tsx", "/admin/pyp/members"],
  ] as const

  for (const [path, expectedHref] of hubs) {
    const text = await source(path)
    assert.match(text, new RegExp(`href="${expectedHref.replaceAll("/", "\\/")}"`))
    assert.doesNotMatch(text, /href="\/admin\/players"/) 
  }
})

test("league membership route is admin-only and preserves canonical membership semantics", async () => {
  const route = await source("app/api/admin/league-memberships/route.ts")
  assert.match(route, /authorizeSiteAdminMutation\(\)/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.SUPABASE_SECRET_KEY/)
  assert.match(route, /from\("player_league_memberships"\)/)
  assert.match(route, /Canonical player was not found/)
  assert.match(route, /already enrolled in this league division/)
  assert.match(route, /from\("player_identity_links"\)/)
  assert.match(route, /delete\(\)\.eq\("id", body\.membership_id\)/)
})

test("league picker code no longer loads the full active players directory", async () => {
  const paths = [
    "app/admin/pro/schedule/page.tsx",
    "app/admin/doubles/teams/page.tsx",
    "app/admin/match/setup/page.tsx",
    "app/admin/stroke/setup/page.tsx",
    "app/admin/pyp/setup/page.tsx",
  ]

  for (const path of paths) {
    const text = await source(path)
    assert.match(text, /api\/admin\/league-memberships/)
    assert.doesNotMatch(text, /from\("players"\)[\s\S]{0,180}\.eq\("active", true\)/)
  }
})

test("approved Solo rosters reconcile canonical current memberships", async () => {
  const migration = await source("supabase/migrations/20260911210000_sync_solo_approved_roster_memberships.sql")

  assert.match(migration, /create or replace function public\.approve_solo_roster_version/)
  assert.match(migration, /can_current_user_admin_solo\(\)/)
  assert.match(migration, /set search_path to ''/i)
  assert.match(migration, /solo_roster_entries/)
  assert.match(migration, /player_league_memberships/)
  assert.match(migration, /resolve_canonical_player_id/)
  assert.match(migration, /on conflict \(player_id, league_type, season_number, division\) do nothing/i)
  assert.doesNotMatch(migration, /solo_historical_/i)
})
