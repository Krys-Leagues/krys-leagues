import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync(
  new URL("../../supabase/migrations/20260915154010_legacy_period_verified_entry_append.sql", import.meta.url),
  "utf8",
)
const beforeFunctions = sql.slice(0, sql.indexOf("create or replace function"))
const record = sql.slice(sql.indexOf("create or replace function public.record_all_time_verified_period_entry_v3("))

test("migration install is forward-only and preserves the protected 12/281 baseline", () => {
  assert.match(sql, /posting_sequence between 1 and 12/)
  assert.match(sql, /v_observations<>12 or v_audits<>12 or v_events<>12/)
  assert.match(sql, /v_points<>281 or v_passes<>281/)
  assert.match(sql, /observation\.entry_type='verified_period'[\s\S]*posting_sequence between 1 and 12\)<>12/)
  assert.match(sql, /from public\.climbers_events as event[\s\S]*posting_sequence between 1 and 12\)<>12/)
  assert.doesNotMatch(beforeFunctions, /\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\./i)
  assert.doesNotMatch(sql, /alter table|drop table|drop column|update public\.climbers_seasons/i)
})

test("V3 routes SOURCE V2 separately and permits only append-safe LEGACY V1 chronology", () => {
  assert.match(sql, /return 'SOURCE_V2'/)
  assert.match(sql, /return 'LEGACY_V1_APPEND'/)
  assert.match(sql, /return 'MIXED_OR_INVALID'/)
  assert.match(sql, /The next safe source-backed period order is %/)
  assert.match(sql, /chronology reconciliation is required and nothing was saved/i)
  assert.match(sql, /public\.record_all_time_verified_period_entry_v2\(/)
})

test("legacy saves use source order, retain same-card snapshots, and never use admin time as chronology", () => {
  assert.match(sql, /audit\.posting_sequence<v_batch_start/)
  assert.match(sql, /verified_source_batch_id=p_verified_source_batch_id/)
  assert.match(sql, /legacy_source_submitted_date/)
  assert.match(sql, /legacy_source_posting_order/)
  assert.match(record, /null,p_authoritative_submitted_date,p_authoritative_submission_order,'date_ordered'/)
  assert.match(record, /effective_date,[\s\S]*p_authoritative_submitted_date/)
  assert.match(record, /effective_order,[\s\S]*p_authoritative_submission_order/)
  assert.doesNotMatch(record, /effective_(?:at|date|order)[\s\S]{0,80}v_recorded_at/)
})

test("legacy calculation preserves PB and passing rules", () => {
  assert.match(sql, /v_classification:='FIRST'/)
  assert.match(sql, /v_score<v_old_pb then v_classification:='BETTER'/)
  assert.match(sql, /v_score=v_old_pb then v_classification:='EQUAL'/)
  assert.match(sql, /else v_classification:='WORSE'/)
  assert.match(sql, /score>v_score/)
  assert.doesNotMatch(sql, /score>=v_score/)
  assert.match(record, /if v_classification in \('FIRST','BETTER'\) then/)
})

test("legacy save is atomic, idempotent, admin-only, and never finalizes or rewrites existing events", () => {
  assert.match(record, /not public\.is_current_user_site_admin\(\)/)
  assert.match(record, /v_period\.status='finalized'/)
  assert.match(sql, /v_base->>'action'='already_saved'/)
  assert.match(record, /posting order changed after preview; no rows were saved/i)
  assert.doesNotMatch(record, /update public\.climbers_events|delete from public\.climbers_events|delete from public\.climbers_event_passes/i)
  assert.doesNotMatch(record, /update public\.climbers_seasons/i)
})

test("recording uses the installed legacy sequence lock before the season row lock", () => {
  const advisory = record.indexOf("krys-leagues:verified-period-posting-sequence:")
  const seasonRow = record.indexOf("from public.climbers_seasons where id=p_period_id for update")
  assert.ok(advisory >= 0 && seasonRow > advisory)
})

test("same-card additions are allowed only while that source remains the immutable tail", () => {
  assert.match(sql, /This canonical player is already present on the retained scorecard/)
  assert.match(sql, /This retained scorecard is no longer the latest legacy source/)
  assert.match(sql, /audit\.posting_sequence<v_batch_start/)
})
