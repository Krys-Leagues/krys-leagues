import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("runtime mode is resolved from Supabase and live routes still skip tester lookup", async () => {
  const source = await readFile("proxy.ts", "utf8")
  assert.match(source, /resolveSiteAccessMode\(session\.supabase\)/)
  assert.match(source, /const needsAccess = mode === "prelaunch" \|\| Boolean\(feature && feature\.visibility !== "live"\)/)
  assert.match(source, /if \(session\.user && needsAccess\)/)
})

test("proxy protects nested player and API routes by default", async () => {
  const source = await readFile("proxy.ts", "utf8")
  assert.match(source, /testingAccessRedirect\(original\)/)
  assert.match(source, /pathname\.startsWith\("\/api\/"\)/)
  assert.match(source, /getFeatureRoute\(pathname\)/)
})

test("launch-only screens are removed from the public live surface", async () => {
  const proxySource = await readFile("proxy.ts", "utf8")
  const adminSource = await readFile("app/admin/page.tsx", "utf8")
  const launchSource = await readFile("app/admin/launch/page.tsx", "utf8")
  assert.match(proxySource, /pathname === "\/testing-access"[\s\S]*?NextResponse\.redirect\(new URL\("\/", request\.url\)\)/)
  assert.doesNotMatch(adminSource, /href: "\/admin\/launch"/)
  assert.match(launchSource, /redirect\("\/admin"\)/)
})

test("launch SQL is private by default, admin-only, audited, and idempotent", async () => {
  const sql = await readFile("site_launch_control.sql", "utf8")
  assert.match(sql, /values \('site', 'prelaunch'\)/)
  assert.match(sql, /if not public\.is_current_user_site_admin\(\)/)
  assert.match(sql, /for update/)
  assert.match(sql, /insert into public\.site_access_audit/)
  assert.match(sql, /if v_current\.mode = p_new_mode then/)
  assert.match(sql, /revoke all on table public\.site_access_control/)
  assert.match(sql, /grant execute on function public\.get_site_access_mode\(\) to anon, authenticated/)
  assert.doesNotMatch(sql, /alter table .* enable row level security/i)
  assert.match(sql, /p_new_mode is null or p_new_mode not in/)
})

test("launch route never uses a service-role credential and validates the requested mode", async () => {
  const source = await readFile("app/api/admin/site-access/route.ts", "utf8")
  assert.match(source, /is_current_user_site_admin/)
  assert.match(source, /mode !== "public" && mode !== "prelaunch"/)
  assert.doesNotMatch(source, /SERVICE_ROLE|service_role|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/i)
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
