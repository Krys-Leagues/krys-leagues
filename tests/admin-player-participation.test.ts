import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = "supabase/migrations/20260930025133_admin_register_player_participation.sql"

test("Global Players league and tournament actions use the protected admin API", async () => {
  const page = await readFile("app/admin/players/page.tsx", "utf8")

  assert.match(page, /fetch\("\/api\/admin\/player-participation"/)
  assert.doesNotMatch(page, /\.from\(["']player_league_memberships["']\)/)
  assert.doesNotMatch(page, /\.from\(["']player_tournament_entries["']\)/)
  assert.doesNotMatch(page, /CURRENT_SEASON/)
  assert.match(page, /Exact season number/)
  assert.match(page, /does not guess from historical imports/)
})

test("player participation API authorizes before calling protected RPCs", async () => {
  const route = await readFile("app/api/admin/player-participation/route.ts", "utf8")
  const authorization = route.indexOf("await authorizeSiteAdminMutation()")
  const leagueRpc = route.indexOf('rpc("admin_add_player_league_membership"')
  const tournamentRpc = route.indexOf('rpc("admin_add_player_tournament_entry"')

  assert.ok(authorization >= 0)
  assert.ok(leagueRpc > authorization)
  assert.ok(tournamentRpc > authorization)
  assert.match(route, /Number\.isInteger\(seasonNumber\)/)
})

test("atomic admin registration resolves canonical identity and blocks Memorial", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.equal((sql.match(/security definer/gi) || []).length, 2)
  assert.equal((sql.match(/set search_path = ''/g) || []).length, 2)
  assert.equal((sql.match(/is_current_user_site_admin\(\)/g) || []).length, 2)
  assert.equal((sql.match(/resolve_canonical_player_id\(p_player_id\)/g) || []).length, 2)
  assert.equal((sql.match(/= 'memorial'/g) || []).length, 2)
  assert.equal((sql.match(/for update/g) || []).length, 2)
  assert.equal((sql.match(/set status = 'active', active = true/g) || []).length, 2)
  assert.match(sql, /on conflict \(player_id, league_type, season_number, division\) do nothing/i)
  assert.match(sql, /on conflict \(player_id, tournament_type, bracket, status\) do nothing/i)
})

test("duplicate registration fails before any status activation can commit", async () => {
  const sql = await readFile(migrationPath, "utf8")
  const membershipConflict = sql.indexOf("if v_membership_id is null")
  const membershipActivation = sql.indexOf("update public.players", membershipConflict)
  const tournamentConflict = sql.indexOf("if v_entry_id is null")
  const tournamentActivation = sql.indexOf("update public.players", tournamentConflict)

  assert.ok(membershipConflict >= 0 && membershipActivation > membershipConflict)
  assert.ok(tournamentConflict >= 0 && tournamentActivation > tournamentConflict)
  assert.match(sql, /revoke all on function public\.admin_add_player_league_membership[^;]+from public, anon/i)
  assert.match(sql, /revoke all on function public\.admin_add_player_tournament_entry[^;]+from public, anon/i)
})
