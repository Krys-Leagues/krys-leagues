import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync(new URL("../../all_time_verified_period_replay.sql", import.meta.url), "utf8")

test("verified Previous Period replay assigns immutable automatic posting sequence", () => {
  assert.match(sql, /add column if not exists posting_sequence integer/i)
  assert.match(sql, /unique index if not exists all_time_verified_period_audit_period_sequence_uidx/i)
  assert.match(sql, /assign_all_time_verified_period_sequence/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(sql, /Posting sequence is immutable/i)
  assert.match(sql, /before insert on public\.all_time_verified_period_audit/i)
  assert.match(sql, /before update on public\.all_time_verified_period_audit/i)
})

test("replay uses the preserved PB state and current Climbers pass semantics", () => {
  assert.match(sql, /_replay_climbers_verified_period/i)
  assert.match(sql, /historical_import/i)
  assert.match(sql, /v_row\.score < v_old_pb/i)
  assert.match(sql, /replay\.score > v_row\.score/i)
  assert.match(sql, /FIRST','BETTER/i)
  assert.match(sql, /climbers-verified-period-posting-v1/i)
  assert.match(sql, /climbers_event_passes/i)
  assert.doesNotMatch(sql, /all_time_best_records.*starting/i)
})

test("replay is idempotent and never changes Current Period scoring", () => {
  assert.match(sql, /where event\.observation_id = v_row\.observation_id/i)
  assert.match(sql, /if v_event_id is null then/i)
  assert.match(sql, /delete from public\.climbers_event_passes/i)
  assert.match(sql, /climbers_status = 'replayed'/i)
  assert.match(sql, /pending_period_replay/i)
  assert.doesNotMatch(sql, /ensure_active_climbers_season/i)
  assert.doesNotMatch(sql, /record_all_time_normal_entry/i)
})

test("approved twelve-entry replay is guarded to the verified 281-point result", () => {
  assert.match(sql, /v_replayed_count <> 12/i)
  assert.match(sql, /v_total_points <> 281/i)
  assert.match(sql, /2026-08-15T00:00:00Z/i)
  assert.match(sql, /2026-08-29T00:00:00Z/i)
  assert.match(sql, /v_actor_id uuid := '0d93ca19-289a-4929-a093-c7556e6d51ed'/i)
  assert.match(sql, /15892/i)
})

test("migration preserves observations and records date-ordered event chronology without inventing timestamps", () => {
  assert.match(sql, /observations_preserved/i)
  assert.match(sql, /effective_at,\s*effective_date,\s*effective_order,\s*effective_time_precision/i)
  assert.match(sql, /null,\s*v_period\.starts_at::date,\s*v_row\.posting_sequence,\s*'date_ordered'/i)
  assert.match(sql, /legacy_baseline_untouched/i)
})
