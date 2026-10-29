import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const sql = readFileSync(new URL("../../all_time_late_backfill_batch.sql", import.meta.url), "utf8")

test("batch migration adds a shared card identity and per-player audit linkage", () => {
  assert.match(sql, /create table if not exists public\.all_time_late_backfill_batches/)
  assert.match(sql, /batch_fingerprint text not null unique/)
  assert.match(sql, /add column if not exists card_batch_id uuid references public\.all_time_late_backfill_batches/)
  assert.match(sql, /all_time_late_backfill_audit[\s\S]*add column if not exists card_batch_id/)
})

test("batch preview and save expose atomic RPCs with explicit confirmation and a serialization lock", () => {
  assert.match(sql, /create or replace function public\.preview_all_time_late_backfill_batch\(/)
  assert.match(sql, /create or replace function public\.record_all_time_late_backfill_batch\(/)
  assert.match(sql, /p_confirmation_token text/)
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('all-time-late-card:'/)
  assert.match(sql, /if p_confirmation_token is null or p_confirmation_token<>v_preview->>'confirmation_token'/)
  assert.doesNotMatch(sql, /ensure_active_climbers_season\(\)/)
})

test("preview computes every card player from a pre-card snapshot and never requires hole pars", () => {
  assert.match(sql, /create temp table late_card_pb/)
  assert.match(sql, /create temp table late_card_effects/)
  assert.match(sql, /-- Every effect in this unit was calculated before any unit PB was changed\./)
  assert.match(sql, /'same_card_snapshot',true/)
  assert.match(sql, /jsonb_array_length\(hole_strokes\)<>18/)
  assert.match(sql, /if v_course\.par is null then raise exception/)
  assert.match(sql, /'hole_par_stats_available',v_hole_stats/)
  assert.match(sql, /update late_card_input set player_id=[^;]+where player_id is not null/)
  assert.match(sql, /update late_card_input set total_strokes=[^;]+where total_strokes is null/)
})

test("batch replay groups observations by card and applies PB changes after all card effects", () => {
  assert.match(sql, /coalesce\(o\.card_batch_id::text,o\.id::text\)/)
  assert.match(sql, /for v_unit in select \* from late_batch_units/)
  assert.match(sql, /for v_effect in select \* from late_batch_effects/)
  assert.match(sql, /climbers-late-backfill-v2/)
  assert.match(sql, /score>v_input\.score/)
})

test("batch migration protects duplicates, preserves raw holes, and supports audited correction", () => {
  assert.match(sql, /entry key is already saved/)
  assert.match(sql, /fingerprint is already saved/)
  assert.match(sql, /entry_type,?\s*hole_strokes/) // raw 18-hole evidence is inserted
  assert.match(sql, /create or replace function public\.correct_all_time_late_backfill_batch_entry\(/)
  assert.match(sql, /all_time_correction_audit\(observation_id,course_id,player_id,action,old_values,new_values/)
  assert.match(sql, /replay_climbers_late_backfill_season\(v_season_id\)/)
})
