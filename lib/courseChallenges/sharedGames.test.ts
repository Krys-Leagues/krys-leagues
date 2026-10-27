import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

test("shared Course Challenge game migration uses canonical players and an atomic active lock", () => {
  const sql = read("supabase/migrations/20261007170000_course_challenge_shared_games_v2.sql")
  assert.match(sql, /course_challenge_shared_game_player_locks[\s\S]*player_id uuid primary key references public\.players\(id\)/i)
  assert.match(sql, /course_challenge_shared_game_create[\s\S]*current_user_canonical_player_id/i)
  assert.match(sql, /course_challenge_shared_game_join[\s\S]*pg_advisory_xact_lock/i)
  assert.match(sql, /status in \('forming', 'started', 'game_ended', 'completed', 'voided'\)/i)
  assert.match(sql, /course_code text not null references public\.course_challenge_game_catalog/i)
  assert.match(sql, /force row level security/i)
  assert.match(sql, /revoke all on function public\.resolve_course_challenge_discord_player\(text\)/i)
  assert.doesNotMatch(sql, /players\.name|p\.name|nullif\(btrim\(name\)/i)
  assert.doesNotMatch(sql, /shared_game_rounds/i)
})

test("the shared game catalog is data-driven and includes current Course Challenge codes", () => {
  const sql = read("supabase/migrations/20261007170000_course_challenge_shared_games_v2.sql")
  assert.match(sql, /course_challenge_game_catalog/i)
  for (const code of ["TTE", "TTH", "CBE", "CBH", "AWE", "AWH"]) assert.match(sql, new RegExp(`'${code}'`))
  assert.match(sql, /active boolean not null default true/i)
})

test("voiding requires two distinct active participants and releases the lock", () => {
  const sql = read("supabase/migrations/20261007170000_course_challenge_shared_games_v2.sql")
  assert.match(sql, /Exactly two distinct active participants are required/i)
  assert.match(sql, /v_votes >= 2[\s\S]*status = 'voided'/i)
  assert.match(sql, /delete from public\.course_challenge_shared_game_player_locks where game_id = p_game_id/i)
})

test("no-score is recorded as auditable participation and does not call reward logic", () => {
  const sql = read("supabase/migrations/20261007170000_course_challenge_shared_games_v2.sql")
  assert.match(sql, /score_disposition text[\s\S]*no_cc_score/i)
  assert.match(sql, /no_cc_score/i)
  assert.doesNotMatch(sql, /insert into public\.course_challenge_rewards/i)
})

test("the signed Discord bridge exposes canonical shared game operations", () => {
  const route = read("app/api/internal/course-challenges/games/route.ts")
  for (const action of ["create", "join", "leave", "void", "start", "game-ended", "archive", "set-refs", "add-scorecard", "use-score", "requirements", "list"]) assert.match(route, new RegExp(`action === \"${action}\"`))
  assert.match(route, /verifyScorecardBridgeRequest/)
})

test("signed recovery exposes list and get snapshots from the existing shared tables", () => {
  const route = read("app/api/internal/course-challenges/games/route.ts")
  assert.match(route, /action === \"list\" \|\| action === \"get\"/)
  assert.match(route, /course_challenge_shared_game_confirmations/)
  assert.match(route, /score_disposition/)
  assert.match(route, /Cache-Control.*no-store/)
})

test("canonical recovery migration extends V2 instead of creating a parallel game schema", () => {
  const sql = read("supabase/migrations/20261007180000_course_challenge_canonical_active_state.sql")
  assert.match(sql, /alter table public\.course_challenge_shared_games/i)
  assert.match(sql, /sync_course_challenge_canonical_game\(p_snapshot jsonb\)/i)
  assert.match(sql, /score_decided_at/i)
  assert.match(sql, /course_challenge_shared_game_score_decision_timestamp/i)
  assert.match(sql, /grant execute on function public\.sync_course_challenge_canonical_game\(jsonb\) to service_role/i)
  assert.doesNotMatch(sql, /create table public\.course_challenge_games/i)
  assert.doesNotMatch(sql, /create table public\.course_challenge_game_participants/i)
})

test("the website selects one code and does not carry the Match sequence", () => {
  const ui = read("components/course-challenges/CourseChallengeGames.tsx")
  assert.match(ui, /courseCode/)
  assert.doesNotMatch(ui, /EASY.*HARD.*EASY/i)
  assert.doesNotMatch(ui, /first round/i)
})
