import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const sql = readFileSync(new URL("../../all_time_normal_entry_climbers.sql", import.meta.url), "utf8")

test("normal entry migration keeps the best record derived and adds audited history", () => {
  assert.match(sql, /create table if not exists public\.all_time_correction_audit/i)
  assert.match(sql, /create or replace function public\.record_all_time_normal_entry/i)
  assert.match(sql, /create or replace function public\.correct_all_time_record_entry/i)
  assert.match(sql, /create or replace function public\.void_all_time_record_entry/i)
  assert.match(sql, /refresh_all_time_best_record/i)
  assert.match(sql, /v_score\s*<\s*v_existing_score|if not found/i)
  assert.doesNotMatch(sql, /delete from public\.all_time_record_observations/i)
})

test("Climbers only counts strictly passed scores and protects finalized seasons", () => {
  assert.match(sql, /best\.score > v_(?:score|new_score)/i)
  assert.match(sql, /status\s*=\s*'finalized'/i)
  assert.match(sql, /where status='active' and starts_at<=now\(\) and ends_at>now\(\)/i)
  assert.match(sql, /no Climbers season\/event is[\s\S]*created implicitly/i)
  assert.doesNotMatch(sql, /v_season_id:=public\.ensure_active_climbers_season\(\)/i)
  assert.match(sql, /create table if not exists public\.climbers_events/i)
  assert.match(sql, /create table if not exists public\.climbers_event_passes/i)
  assert.match(sql, /calculation_version/i)
})

test("normal entry cannot treat an imported historical observation as a live Climbers entry", () => {
  assert.match(sql, /p_entry_type not in \('full_card','quick_score'\)/i)
  assert.match(sql, /entry_type text not null default 'historical_import'/i)
  assert.match(sql, /entry_type in \('historical_import','full_card','quick_score','authoritative_league_source'\)/i)
})
