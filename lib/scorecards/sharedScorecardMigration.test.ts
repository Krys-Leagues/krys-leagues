import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260918170000_shared_scorecard_core.sql"), "utf8")

test("shared scorecard migration is additive, private, and preserves all eighteen holes", () => {
  assert.match(sql, /create table if not exists public\.shared_scorecard_holes/)
  assert.match(sql, /hole_number between 1 and 18/)
  assert.match(sql, /jsonb_array_length\(p_holes\) <> 18/)
  assert.match(sql, /par_snapshot smallint\[\].*array_length\(par_snapshot, 1\) = 18/)
  assert.doesNotMatch(sql, /drop\s+(table|column|policy)/i)
  assert.doesNotMatch(sql, /alter table public\.(players|schedule|results|season_standings).*disable row level security/i)
})

test("evidence is private and no anonymous or authenticated table access is granted", () => {
  assert.match(sql, /'shared-scorecard-evidence',[\s\S]*?false,/)
  assert.match(sql, /revoke all on table public\.shared_scorecard_evidence from public, anon, authenticated/)
  assert.doesNotMatch(sql, /grant\s+select[^;]*\s+to\s+(anon|authenticated)/i)
  assert.match(sql, /force row level security/g)
  assert.doesNotMatch(sql, /delete from storage\.objects/i)
})

test("player history is authenticated self-only and cannot accept a player argument", () => {
  assert.match(sql, /create or replace function public\.get_my_verified_scorecard_history_v1\(\)/)
  assert.match(sql, /v_auth_user_id uuid := auth\.uid\(\)/)
  assert.match(sql, /public\.current_user_canonical_player_id\(\)/)
  assert.match(sql, /participant\.player_id = v_player_id/)
  assert.match(sql, /revoke all on function public\.get_my_verified_scorecard_history_v1\(\)[\s\S]*?grant execute[\s\S]*?to authenticated/)
})

test("service functions use an empty search path and are not browser executable", () => {
  for (const functionName of [
    "save_shared_scorecard_draft_service",
    "begin_shared_scorecard_verification_service",
    "complete_shared_scorecard_verification_service",
  ]) {
    const start = sql.indexOf(`create or replace function public.${functionName}`)
    const end = sql.indexOf("$function$;", start)
    const body = sql.slice(start, end)
    assert.match(body, /security definer/)
    assert.match(body, /set search_path = ''/)
  }
  assert.match(sql, /to service_role/g)
})

test("date fields preserve raw card text without parsing it", () => {
  assert.match(sql, /arranged_played_date date/)
  assert.match(sql, /event_played_date date/)
  assert.match(sql, /played_date date not null/)
  assert.match(sql, /card_date_text text/)
  assert.doesNotMatch(sql, /to_date\(.*card_date_text/i)
})

test("corrections preserve revisions and require a reason for verified cards", () => {
  assert.match(sql, /create table if not exists public\.shared_scorecard_revisions/)
  assert.match(sql, /previous_snapshot jsonb/)
  assert.match(sql, /new_snapshot jsonb not null/)
  assert.match(sql, /A correction reason is required for a verified scorecard/)
})
