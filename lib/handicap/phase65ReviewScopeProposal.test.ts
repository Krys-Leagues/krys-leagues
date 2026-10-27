import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const proposalPath = join(process.cwd(), "supabase", "proposals", "20261019_handicap_rating_snapshot_review_scope.proposed.sql")

test("Phase 65 proposal adds review scope to snapshot identity without touching data", () => {
  const sql = readFileSync(proposalPath, "utf8")
  assert.match(sql, /add column review_scope text/i)
  assert.match(sql, /'KWT_ONLY'[\s\S]*'WEEKLY_ONLY'[\s\S]*'KWT_PLUS_WEEKLY'/)
  assert.match(sql, /add constraint handicap_rating_snapshots_calculation_run_scope_key\s+unique \(calculation_run_id, course_id, difficulty, model_version, review_scope\)/i)
  assert.match(sql, /drop constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key/i)
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate)\s+into?\b/i)
  assert.doesNotMatch(sql, /\b(grant|revoke)\b/i)
})

test("Phase 65 proposal keeps review scopes separate from mathematical model version", () => {
  const sql = readFileSync(proposalPath, "utf8")
  assert.match(sql, /model_version, review_scope\)/i)
  assert.match(sql, /same mathematical models|not separate mathematical models|preserves existing rows/i)
})
