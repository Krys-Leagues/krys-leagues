import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync(new URL("../../all_time_verified_period_entry.sql", import.meta.url), "utf8")

test("verified Previous Period entries are scoped without fabricated chronology", () => {
  assert.match(sql, /verified_period_id uuid references public\.climbers_seasons/i)
  assert.match(sql, /entry_type\s*=\s*'verified_period'/i)
  assert.match(sql, /authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,\s*authoritative_time_precision,verified_period_id/i)
  assert.match(sql, /null,null,null,'unknown',p_period_id/i)
  assert.match(sql, /recorded_at\s*:=\s*clock_timestamp\(\)/i)
  assert.doesNotMatch(sql, /now\(\)\s*\+\s*interval\s*'14 days'/i)
})

test("verified period SQL uses parser-safe casts and comparisons", () => {
  assert.doesNotMatch(sql, /::[A-Za-z0-9_]+\s*[<>]=?\s*[0-9]/i)
  assert.doesNotMatch(sql, /::text::integer\s*[<>]=?/i)
  assert.match(sql, /from jsonb_array_elements\(p_hole_strokes\) as hole\(value\)/i)
  assert.match(sql, /cast\(cast\(hole\.value as text\) as integer\) < 1/i)
  assert.match(sql, /\) <> v_course\.par/i)
})

test("verified Previous Period path is protected, idempotent, and never awards unproven Climbers points", () => {
  assert.match(sql, /preview_all_time_verified_period_entry/i)
  assert.match(sql, /record_all_time_verified_period_entry/i)
  assert.match(sql, /p_confirmation_token/i)
  assert.match(sql, /fingerprint\s*=\s*lower\(p_fingerprint\)/i)
  assert.match(sql, /climbers_status'\s*,\s*'pending_period_replay'/i)
  assert.match(sql, /'climbers_points'\s*,\s*0\s*,\s*'climbers_status'\s*,\s*'pending_period_replay'/i)
  assert.match(sql, /status\s*<>\s*'finalized'\s+and ends_at\s*<=\s*clock_timestamp\(\)/i)
  assert.doesNotMatch(sql, /insert into public\.climbers_events/i)
  assert.doesNotMatch(sql, /create_climbers_season/i)
})

test("verified Previous Period correction and void remain audited", () => {
  assert.match(sql, /all_time_verified_period_audit/i)
  assert.match(sql, /sync_all_time_verified_period_audit/i)
  assert.match(sql, /after update on public\.all_time_record_observations/i)
  assert.match(sql, /all_time_correction_audit/i)
  assert.match(sql, /climbers_status\s*=\s*case when new\.voided_at is null then 'pending_period_replay' else 'voided' end/i)
})
