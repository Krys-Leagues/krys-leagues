import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync(new URL("../../supabase/migrations/20260915123530_verified_period_climbers_replay.sql", import.meta.url), "utf8")

test("verified backlog stores source chronology instead of the admin entry time", () => {
  assert.match(sql, /p_authoritative_submitted_date date/)
  assert.match(sql, /p_authoritative_submission_order integer/)
  assert.match(sql, /p_authoritative_time_precision text/)
  assert.match(sql, /verified_source_batch_id uuid/)
  assert.match(sql, /Source chronology is outside the selected Climbers period/)
  assert.match(sql, /'verified_period'[\s\S]+p_authoritative_submitted_at/)
  assert.doesNotMatch(sql, /authoritative_submitted_at[^\n]*v_recorded_at/)
})

test("verified save automatically replays and returns the calculated points", () => {
  const record = sql.slice(sql.indexOf("create or replace function public.record_all_time_verified_period_entry("), sql.indexOf("-- The old signatures"))
  assert.match(record, /perform public\.replay_climbers_verified_period\(p_period_id\)/)
  assert.match(record, /'climbers_points',v_audit\.climbers_points/)
  assert.match(record, /'climbers_status',v_audit\.climbers_status/)
  assert.doesNotMatch(record, /'climbers_points',0/)
})

test("replay is admin-only, completed-period-only, and never finalizes", () => {
  assert.match(sql, /not public\.is_current_user_site_admin\(\)/)
  assert.match(sql, /v_season\.status='finalized'/)
  assert.match(sql, /v_season\.ends_at>clock_timestamp\(\)/)
  assert.doesNotMatch(sql, /update public\.climbers_seasons[\s\S]{0,200}finalized/i)
})

test("replay is idempotent and cannot reduce earned events", () => {
  assert.match(sql, /where observation_id=v_effect\.observation_id/)
  assert.match(sql, /if v_event_id is null then[\s\S]+insert into public\.climbers_events/)
  assert.match(sql, /v_effect\.climbers_points<v_existing_points/)
  assert.match(sql, /Replay would reduce a previously earned Climbers event; no changes were saved/)
  assert.match(sql, /delete from public\.climbers_event_passes where event_id=v_event_id/)
})

test("same-source rows use one PB snapshot and points remain actual canonical passes", () => {
  assert.match(sql, /create temp table verified_period_effects/)
  assert.match(sql, /for v_effect in select \* from verified_period_effects/)
  assert.match(sql, /count\(\*\)::integer[\s\S]+player_id<>v_row\.player_id and score>v_row\.score/)
  assert.match(sql, /insert into public\.climbers_event_passes\(event_id,passed_player_id\)/)
  assert.match(sql, /Verified and existing sources share the same date\/order/)
  assert.match(sql, /Exact-time and date\/order sources are mixed on one date/)
})

test("old chronology-free RPC signatures are blocked instead of silently awarding zero", () => {
  assert.match(sql, /Verified-period source chronology is required; reload the updated All-Time entry page/)
  assert.match(sql, /revoke all on function public\.record_all_time_verified_period_entry/)
  assert.match(sql, /grant execute on function public\.record_all_time_verified_period_entry/)
})
