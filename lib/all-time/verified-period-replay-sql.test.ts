import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync(new URL("../../supabase/migrations/20260915123530_verified_period_climbers_replay.sql", import.meta.url), "utf8")
const replay = sql.slice(
  sql.indexOf("create or replace function public.replay_climbers_verified_period_v2("),
  sql.indexOf("create or replace function public.preview_all_time_verified_period_entry_v2("),
)
const record = sql.slice(
  sql.indexOf("create or replace function public.record_all_time_verified_period_entry_v2("),
  sql.lastIndexOf("commit;"),
)

test("install preserves the reviewed Production legacy replay and 12/281 invariant", () => {
  assert.match(sql, /to_regprocedure\('public\._replay_climbers_verified_period\(uuid,uuid\)'\)/)
  assert.match(sql, /to_regprocedure\('public\.assign_all_time_verified_period_sequence\(\)'\)/)
  assert.match(sql, /to_regprocedure\('public\.guard_all_time_verified_period_sequence\(\)'\)/)
  assert.match(sql, /v_observations<>12 or v_audits<>12 or v_events<>12 or v_passes<>281/)
  assert.match(sql, /v_min_sequence<>1 or v_max_sequence<>12 or v_distinct_sequence<>12/)
  assert.match(sql, /'Cherry Blossom Hard','Easy',-18,73/)
  assert.match(sql, /'Cherry Blossom Hard','Easy',-10,35/)
  assert.match(sql, /'Shangri-La Easy','Easy',-26,75/)
  assert.match(sql, /'Shangri-La Easy','Easy',-29,98/)
  assert.doesNotMatch(sql, /create or replace function public\._replay_climbers_verified_period\(/i)
  assert.doesNotMatch(sql, /create or replace function public\.replay_climbers_verified_period\(/i)
  assert.doesNotMatch(sql, /create or replace function public\.sync_all_time_verified_period_audit\(/i)
})

test("installation is DDL-only and does not relabel historical rows", () => {
  const beforeFirstFunction = sql.slice(0, sql.indexOf("create or replace function"))
  assert.match(sql, /add column if not exists calculation_version text[,;]/i)
  assert.doesNotMatch(sql, /calculation_version text not null/i)
  assert.doesNotMatch(sql, /calculation_version text[^\n]*default/i)
  assert.doesNotMatch(beforeFirstFunction, /\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\./i)
  assert.doesNotMatch(sql, /drop table|drop column|alter column[\s\S]{0,80}set not null/i)
})

test("SOURCE V2 uses separate non-overloaded RPC names", () => {
  assert.match(sql, /create or replace function public\.preview_all_time_verified_period_entry_v2\(/)
  assert.match(sql, /create or replace function public\.record_all_time_verified_period_entry_v2\(/)
  assert.match(sql, /create or replace function public\.replay_climbers_verified_period_v2\(/)
  assert.doesNotMatch(sql, /create or replace function public\.preview_all_time_verified_period_entry\(/)
  assert.doesNotMatch(sql, /create or replace function public\.record_all_time_verified_period_entry\(/)
  assert.match(sql, /revoke all on function public\._verified_period_replay_mode_v2\(uuid\) from public,anon,authenticated,service_role/)
  assert.match(sql, /grant execute on function public\.record_all_time_verified_period_entry_v2/)
})

test("legacy and SOURCE V2 entries cannot be mixed", () => {
  assert.match(sql, /return 'LEGACY_V1'/)
  assert.match(sql, /return 'MIXED_OR_INVALID'/)
  assert.match(sql, /This period contains legacy posting-order entries and cannot safely mix source-date replay without chronology reconciliation\./)
  assert.match(sql, /a\.posting_sequence is not null/)
  assert.match(sql, /a\.calculation_version is null or a\.calculation_version='climbers-verified-period-posting-v1'/)
})

test("verified backlog stores source chronology instead of the admin entry time", () => {
  assert.match(sql, /p_authoritative_submitted_date date/)
  assert.match(sql, /p_authoritative_submission_order integer/)
  assert.match(sql, /p_authoritative_time_precision text/)
  assert.match(sql, /verified_source_batch_id uuid/)
  assert.match(sql, /Source chronology is outside the selected Climbers period/)
  assert.match(record, /p_authoritative_submitted_at,\(v_preview->>'authoritative_submitted_date'\)::date/)
  assert.doesNotMatch(record, /authoritative_submitted_at[^\n]*v_recorded_at/)
})

test("verified save automatically replays and returns actual calculated points", () => {
  assert.match(record, /perform public\.replay_climbers_verified_period_v2\(p_period_id\)/)
  assert.match(record, /'climbers_points',v_audit\.climbers_points/)
  assert.match(record, /'passed_player_ids',to_jsonb\(v_audit\.passed_player_ids\)/)
  assert.doesNotMatch(record, /'climbers_points',0/)
})

test("replay is admin-only, completed-period-only, and cannot finalize", () => {
  assert.match(replay, /not public\.is_current_user_site_admin\(\)/)
  assert.match(replay, /v_season\.status='finalized'/)
  assert.match(replay, /v_season\.ends_at>clock_timestamp\(\)/)
  assert.doesNotMatch(replay, /update public\.climbers_seasons/i)
})

test("replay aborts before reducing events, points, or passed evidence", () => {
  assert.match(replay, /v_effect\.climbers_points<v_existing_points/)
  assert.match(replay, /Replay would reduce a previously earned Climbers event; no changes were saved/)
  assert.match(replay, /not \(old_pass\.passed_player_id=any\(v_effect\.passed_player_ids\)\)/)
  assert.match(replay, /Replay would remove previously earned passed-player evidence; no changes were saved/)
  assert.ok(replay.indexOf("Replay would remove previously earned passed-player evidence") < replay.indexOf("delete from public.climbers_event_passes"))
})

test("same-card rows share a pre-card PB snapshot and ties do not pass", () => {
  assert.match(replay, /create temp table if not exists pg_temp\.verified_period_effects_v2/)
  assert.match(replay, /Apply the whole scorecard\/source unit only after every row was calculated/)
  assert.ok(replay.indexOf("for v_row in") < replay.lastIndexOf("insert into pg_temp.verified_period_pb_v2(course_id,player_id,score)"))
  assert.match(replay, /elsif v_row\.score=v_old then v_classification:='EQUAL'/)
  assert.match(replay, /score>v_row\.score/)
  assert.doesNotMatch(replay, /score>=v_row\.score/)
})

test("replay remains idempotent through canonical uniqueness paths", () => {
  assert.match(replay, /where observation_id=v_effect\.observation_id/)
  assert.match(replay, /if v_event_id is null then[\s\S]+insert into public\.climbers_events/)
  assert.match(replay, /on conflict\(course_id,player_id\) do update/)
  assert.match(sql, /where o\.entry_key=p_entry_key or o\.fingerprint=lower\(p_fingerprint\)/)
  assert.match(replay, /insert into public\.climbers_event_passes\(event_id,passed_player_id\)/)
})
