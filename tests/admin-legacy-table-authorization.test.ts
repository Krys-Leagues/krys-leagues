import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = "supabase/migrations/20260930024801_protect_legacy_admin_league_operations.sql"

test("legacy browser-admin writes require canonical site-admin authorization", async () => {
  const sql = await readFile(migrationPath, "utf8")

  for (const table of ["seasons", "schedule", "results", "doubles_teams", "player_tracker", "combined_course_records"]) {
    assert.match(sql, new RegExp(`on public\\.${table} for (?:insert|update|delete|all)`, "i"), table)
  }

  assert.ok((sql.match(/is_current_user_site_admin\(\)/g) || []).length >= 12)
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/i)
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i)
})

test("dangerous legacy public and truncate grants are removed", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.match(sql, /revoke all privileges on table public\.player_waitlist from anon/i)
  assert.match(sql, /revoke all privileges on table public\.player_tracker from anon/i)
  assert.match(sql, /revoke all privileges on table public\.doubles_teams from anon/i)
  assert.match(sql, /revoke truncate[^;]+from authenticated/gi)
  assert.match(sql, /grant select on table public\.player_waitlist to authenticated/i)
  assert.match(sql, /create sequence if not exists public\.doubles_teams_id_seq/i)
  assert.match(sql, /alter column id set default nextval\('public\.doubles_teams_id_seq'/i)
})

test("registration is preserved through the protected Discord-player RPC", async () => {
  const registration = await readFile("app/register/page.tsx", "utf8")

  assert.match(registration, /rpc\("register_current_discord_player"/)
  assert.doesNotMatch(registration, /from\(["']player_waitlist["']\)/)
})
