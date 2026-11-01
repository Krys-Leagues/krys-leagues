import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const sql = readFileSync(new URL("../../all_time_late_backfill.sql", import.meta.url), "utf8")

test("late backfill stores authoritative time separately from database entry time", () => {
  assert.match(sql, /recorded_at timestamptz/i)
  assert.match(sql, /authoritative_submitted_at timestamptz/i)
  assert.match(sql, /authoritative_submitted_date date/i)
  assert.match(sql, /authoritative_submission_order integer/i)
  assert.match(sql, /authoritative_time_precision text/i)
  assert.match(sql, /entry_type='late_backfill'/i)
  assert.match(sql, /clock_timestamp()/i)
})

test("late backfill has protected preview, explicit confirmation, replay, and audit paths", () => {
  assert.match(sql, /preview_all_time_late_backfill_entry/i)
  assert.match(sql, /p_confirmation_token/i)
  assert.match(sql, /record_all_time_late_backfill_entry/i)
  assert.match(sql, /replay_climbers_late_backfill_season/i)
  assert.match(sql, /all_time_late_backfill_audit/i)
  assert.match(sql, /all_time_correction_audit/i)
  assert.match(sql, /correct_all_time_late_backfill_entry/i)
  assert.match(sql, /void_all_time_late_backfill_entry/i)
  assert.match(sql, /equivalent late\/backfill submission already exists/i)
})

test("replay is chronological, strictly passes lower scores, and never creates a season", () => {
  assert.match(sql, /order by o\.authoritative_submitted_date/i)
  assert.match(sql, /score>v_row\.score/i)
  assert.match(sql, /v_classification in \('FIRST','BETTER'\)/i)
  assert.match(sql, /historical_import/i)
  const lateRecordBody = sql.slice(sql.indexOf("create or replace function public.record_all_time_late_backfill_entry"), sql.indexOf("create or replace function public.correct_all_time_late_backfill_entry"))
  assert.doesNotMatch(lateRecordBody, /create_climbers_season|ensure_active_climbers_season/i)
  assert.doesNotMatch(sql, /now\(\)\s*\+\s*interval\s*'14 days'/i)
})

test("date-only evidence is never converted into a fabricated timestamp", () => {
  assert.match(sql, /date_ordered/i)
  assert.match(sql, /authoritative_submitted_at is null/i)
  assert.match(sql, /effective_at=v_row\.authoritative_submitted_at/i)
  assert.match(sql, /effective_date=v_row\.authoritative_submitted_date/i)
  assert.match(sql, /effective_order=v_row\.authoritative_submission_order/i)
  assert.match(sql, /status='finalized'/i)
})
