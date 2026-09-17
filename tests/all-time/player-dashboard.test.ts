import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")
const migrationPath = "supabase/migrations/20260917124646_player_dashboard_match_reader.sql"

test("Player Dashboard remains available only from the signed-in player's own profile", () => {
  const profile = read("app/players/[id]/page.tsx")
  const homepage = read("app/page.tsx")

  assert.match(profile, /canEditProfile && <Link href="\/player-dashboard"/)
  assert.doesNotMatch(homepage, /href="\/player-dashboard"|Player Dashboard/)
})

test("dashboard browser code uses one protected reader and no protected table reads", () => {
  const route = read("app/player-dashboard/page.tsx")
  const client = read("app/player-dashboard/PlayerDashboardClient.tsx")

  assert.match(route, /export \{ default \} from "\.\/PlayerDashboardClient"/)
  assert.match(client, /getSession\(\)/)
  assert.match(client, /rpc\("get_player_dashboard_v1"\)/)
  assert.doesNotMatch(client, /\.from\(/)
  assert.doesNotMatch(client, /current_user_canonical_player_id|get_public_player_canonical_identity/)
})

test("dashboard reader is self-only and authenticated-only", () => {
  const sql = read(migrationPath)

  assert.match(sql, /function public\.get_player_dashboard_v1\(\)/)
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/)
  assert.match(sql, /v_player_id := public\.current_user_canonical_player_id\(\)/)
  assert.match(sql, /revoke all on function public\.get_player_dashboard_v1\(\) from anon/)
  assert.match(sql, /grant execute on function public\.get_player_dashboard_v1\(\) to authenticated/)
  assert.doesNotMatch(sql, /p_player_id|grant\s+select/i)
})

test("current approved Match roster and active slot determine membership", () => {
  const sql = read(migrationPath)

  assert.match(sql, /public\.match_roster_versions/)
  assert.match(sql, /roster\.status in \('approved', 'locked'\)/)
  assert.match(sql, /public\.match_division_roster_slots/)
  assert.match(sql, /slot\.slot_status = 'active'/)
  assert.match(sql, /public\.resolve_canonical_player_id\(slot\.player_id\) = v_player_id/)
  assert.doesNotMatch(sql, /players\.division|player_league_memberships/)
})

test("dashboard Match rank follows roster order until division results begin", () => {
  const sql = read(migrationPath)

  assert.match(sql, /slot\.slot_number::integer as starting_rank/)
  assert.match(sql, /coalesce\(standing\.wins, 0\)[\s\S]*coalesce\(standing\.losses, 0\)[\s\S]*coalesce\(standing\.ties, 0\) > 0/)
  assert.match(sql, /'current_rank', case when state\.results_started then standing\.rank else null end/)
  assert.match(sql, /'displayed_rank', coalesce\(case when state\.results_started then standing\.rank else null end, slot\.starting_rank\)/)
})

test("dashboard returns only the caller's Match fixtures and safe display fields", () => {
  const sql = read(migrationPath)

  assert.match(sql, /fixture\.player1_id = slot\.player_id or fixture\.player2_id = slot\.player_id/)
  assert.match(sql, /opponent_screen_name/)
  assert.match(sql, /fixture\.course/)
  assert.match(sql, /fixture\.due_date/)
  assert.match(sql, /player_holes_won/)
  assert.match(sql, /opponent_holes_won/)
  assert.match(sql, /'rostered', false/)
  assert.doesNotMatch(sql, /'email'|'auth_user_id'|'discord_id'|'player_id'/)
})

test("reader adds no broad access and client never exposes raw database errors", () => {
  const sql = read(migrationPath)
  const client = read("app/player-dashboard/PlayerDashboardClient.tsx")

  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path to ''/)
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete)/i)
  assert.match(client, /DASHBOARD_ERROR/)
  assert.doesNotMatch(client, /response\.error\?\.message|sessionError\.message|permission denied for table players/)
})

test("dashboard gates Join Now behind authoritative global membership coverage", () => {
  const client = read("app/player-dashboard/PlayerDashboardClient.tsx")

  assert.match(client, /membershipView === "coverage-pending"[\s\S]*<MembershipCoveragePending/)
  assert.match(client, /membershipView === "authoritative-empty"[\s\S]*<GlobalJoinState/)
  assert.match(client, /function GlobalJoinState\(\)[\s\S]*href="\/join"[\s\S]*JOIN NOW/)
  assert.match(client, /Your current league information is still being connected\./)
})

test("reader failure uses the friendly error branch before membership rendering", () => {
  const client = read("app/player-dashboard/PlayerDashboardClient.tsx")

  assert.match(client, /message \?[\s\S]*role="alert"[\s\S]*dashboard && match/)
  assert.match(client, /DASHBOARD_ERROR/)
  assert.doesNotMatch(client, /response\.error\?\.message|sessionError\.message|permission denied for table players/)
})
