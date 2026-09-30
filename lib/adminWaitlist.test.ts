import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = "supabase/migrations/20260930023357_admin_approve_player_waitlist.sql"

test("wait-list approval is one authorized canonical transaction", async () => {
  const sql = await readFile(migrationPath, "utf8")
  const authorization = sql.indexOf("if not public.is_current_user_site_admin()")
  const lockedEntry = sql.indexOf("for update;")
  const firstMutation = sql.indexOf("insert into public.players")

  assert.ok(authorization >= 0)
  assert.ok(lockedEntry > authorization)
  assert.ok(firstMutation > lockedEntry)
  assert.match(sql, /security definer\s+set search_path = ''/i)
  assert.match(sql, /public\.resolve_canonical_player_id\(v_waitlist\.player_id\)/)
  assert.match(sql, /Discord identity matches multiple canonical players/)
  assert.match(sql, /screen name matches multiple canonical players/)
  assert.match(sql, /lower\(coalesce\(v_player\.status, 'active'\)\) = 'memorial'/)
  assert.match(sql, /insert into public\.player_league_memberships/)
  assert.match(sql, /on conflict \(player_id, league_type, season_number, division\) do nothing/)
  assert.match(sql, /set player_id = v_player_id,[\s\S]*status = 'approved'/)
  assert.doesNotMatch(sql, /delete from public\.player_waitlist/)
})

test("wait-list functions are restricted and removal preserves the historical row", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.match(sql, /revoke all on function public\.admin_approve_player_waitlist_entry\(uuid, text, integer\) from public, anon/)
  assert.match(sql, /grant execute on function public\.admin_approve_player_waitlist_entry\(uuid, text, integer\) to authenticated, service_role/)
  assert.match(sql, /admin_remove_player_waitlist_entry/)
  assert.match(sql, /set status = 'removed'/)
})

test("wait-list admin uses only the protected API and requires an explicit season", async () => {
  const [page, route] = await Promise.all([
    readFile("app/admin/waitlist/page.tsx", "utf8"),
    readFile("app/api/admin/waitlist/route.ts", "utf8"),
  ])

  assert.doesNotMatch(page, /@\/lib\/supabase/)
  assert.doesNotMatch(page, /\.from\(["']players["']\)/)
  assert.match(page, /Exact season number/)
  assert.match(page, /action: "approve"/)
  assert.match(page, /action: "remove"/)

  const authorization = route.indexOf("await authorizeSiteAdminMutation()")
  assert.ok(authorization >= 0)
  assert.ok(route.indexOf("createAdminDataClient()") > authorization)
  assert.ok(route.indexOf('rpc("admin_approve_player_waitlist_entry"') > authorization)
  assert.ok(route.indexOf('rpc("admin_remove_player_waitlist_entry"') > authorization)
})
