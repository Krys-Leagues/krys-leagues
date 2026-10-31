import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)

async function source(path: string) {
  return readFile(new URL(path, root), "utf8")
}

test("admin Add Player uses protected server authorization and RPC", async () => {
  const route = await source("app/api/admin/players/route.ts")
  const page = await source("app/admin/players/page.tsx")
  assert.match(route, /authorizeSiteAdminMutation\(\)/)
  assert.match(route, /rpc\("admin_create_player"/)
  assert.doesNotMatch(page, /from\("players"\)\.insert/)
})

test("new-player migration protects canonical creation and participation", async () => {
  const migration = await source("supabase/migrations/20260928160000_new_player_identity_and_masters_access.sql")
  assert.match(migration, /create or replace function public\.admin_create_player/)
  assert.match(migration, /if not public\.is_current_user_site_admin\(\)/)
  assert.match(migration, /security definer[\s\S]*set search_path to ''/i)
  assert.match(migration, /ensure_current_discord_player_for_participation/)
  assert.match(migration, /resolve_canonical_player_id/)
  assert.match(migration, /status = 'active'/)
  assert.match(migration, /join_major_with_new_discord_player/)
  assert.match(migration, /join_major_waitlist_with_slots/)
  assert.match(migration, /signup_for_major_with_slots/)
  assert.match(migration, /revoke all on function public\.ensure_current_discord_player_for_participation/)
})

test("player registration and Masters use the transactional protected paths", async () => {
  const register = await source("app/register/page.tsx")
  const masters = await source("app/majors/[slug]/page.tsx")
  assert.match(register, /rpc\("register_current_discord_player"/)
  assert.doesNotMatch(register, /from\("player_waitlist"\)\.insert/)
  assert.match(masters, /rpc\("join_major_with_new_discord_player"/)
  assert.doesNotMatch(masters, /rpc\("join_major_waitlist_with_slots"/)
  assert.doesNotMatch(masters, /rpc\("signup_for_major_with_slots"/)
  assert.match(masters, /resolution_status/)
})

test("Masters no-match path uses Discord name automatically without a dead-end input", async () => {
  const masters = await source("app/majors/[slug]/page.tsx")
  assert.match(masters, /getAuthenticatedDiscordName\(user\.data\.user\)/)
  assert.match(masters, /p_screen_name: newPlayerName/)
  assert.match(masters, /Your Discord name will be used as your initial Krys Leagues screen name/)
  assert.doesNotMatch(masters, /Enter your Krys Leagues screen name to continue\./)
  assert.doesNotMatch(masters, /placeholder="Your exact player name"/)
})
