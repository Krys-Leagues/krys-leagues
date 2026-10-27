import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync("20260908_kwt_course_records_overall_rank.sql", "utf8")

test("KWT records migration exposes explicit overall and proven-rank scopes", () => {
  assert.match(sql, /record_scope text/)
  assert.match(sql, /'overall'::text as record_scope/)
  assert.match(sql, /'rank'::text/)
  assert.match(sql, /historical_rank in \('Amateur', 'Semi-Pro', 'Pro', 'Elite'\)/)
  assert.match(sql, /resolve_canonical_player_id\(score\.canonical_player_id\)/)
  assert.match(sql, /min\(scoped\.score\) over/)
})

test("KWT records migration preserves unknown-rank rows for Overall and does not infer ranks", () => {
  assert.match(sql, /where resolved\.historical_rank in \('Amateur', 'Semi-Pro', 'Pro', 'Elite'\)/)
  assert.doesNotMatch(sql, /current_rank|inferred_rank|reputation/i)
  assert.doesNotMatch(sql, /update public\.historical_kwt_scorecards|delete from public\.historical_kwt_scorecards/i)
})

test("KWT records migration keeps Easy and Hard as separate course runs and preserves negative/zero scores", () => {
  assert.match(sql, /score\.easy_course_code/)
  assert.match(sql, /score\.hard_course_code/)
  assert.match(sql, /score\.easy_score/)
  assert.match(sql, /score\.hard_score/)
  assert.doesNotMatch(sql, /greatest\(|abs\(/i)
})
