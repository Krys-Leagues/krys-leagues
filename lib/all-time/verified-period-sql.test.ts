import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync(new URL("../../all_time_verified_period_entry.sql", import.meta.url), "utf8")

test("verified Previous Period entries are scoped without fabricated chronology", () => {
  assert.match(sql, /verified_period_id uuid references public\.climbers_seasons/i)
  assert.match(sql, /entry_type='verified_period'/i)
  assert.match(sql, /authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,\s*authoritative_time_precision,verified_period_id/i)
  assert.match(sql, /null,null,null,'unknown',p_period_id/i)
  assert.match(sql, /recorded_at:=clock_timestamp\(\)/i)
  assert.doesNotMatch(sql, /now\(\)\s*\+\s*interval\s*'14 days'/i)
})

test("verified Previous Period path is protected, idempotent, and never awards unproven Climbers points", () => {
  assert.match(sql, /preview_all_time_verified_period_entry/i)
  assert.match(sql, /record_all_time_verified_period_entry/i)
  assert.match(sql, /p_confirmation_token/i)
  assert.match(sql, /fingerprint=lower\(p_fingerprint\)/i)
  assert.match(sql, /climbers_status','pending_period_replay'/i)
  assert.match(sql, /'climbers_points',0,'climbers_status','pending_period_replay'/i)
  assert.match(sql, /status<>'finalized'\s+and ends_at<=clock_timestamp\(\)/i)
  assert.doesNotMatch(sql, /insert into public\.climbers_events/i)
  assert.doesNotMatch(sql, /create_climbers_season/i)
})

test("verified Previous Period correction and void remain audited", () => {
  assert.match(sql, /all_time_verified_period_audit/i)
  assert.match(sql, /sync_all_time_verified_period_audit/i)
  assert.match(sql, /after update on public\.all_time_record_observations/i)
  assert.match(sql, /all_time_correction_audit/i)
  assert.match(sql, /climbers_status=case when new\.voided_at is null then 'pending_period_replay' else 'voided' end/i)
})
