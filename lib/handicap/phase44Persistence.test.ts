import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const proposalPath = "supabase/proposals/20261018_handicap_review_snapshots.proposed.sql"
const preflightPath = "docs/handicap/phase44-schema-preflight-readonly.sql"

test("persistence proposal covers Phase 42 snapshot and review contracts", async () => {
  const source = await readFile(proposalPath, "utf8")
  for (const field of [
    "calculation_run_id",
    "course_id",
    "difficulty",
    "sample_size",
    "distinct_canonical_player_count",
    "source_evidence_refs",
    "canonical_player_id",
    "source_round_ids",
    "rating_snapshot_ids",
    "rating_version_ids",
    "latest_ten_source_round_ids",
    "best_five_source_round_ids",
    "source_fingerprint",
  ]) assert.match(source, new RegExp(`\\b${field}\\b`))
  assert.match(source, /unique \(calculation_run_id, course_id, difficulty, model_version\)/)
  assert.match(source, /unique \(calculation_run_id, canonical_player_id, differential_model_version\)/)
  assert.match(source, /references public\.players\(id\)/)
  assert.match(source, /references public\.handicap_calculation_runs\(id\)/)
  assert.match(source, /enable row level security/)
  assert.match(source, /revoke all on table public\.%I from public, anon, authenticated/)
})

test("preflight is catalog-only and includes compatibility/security checks", async () => {
  const source = await readFile(preflightPath, "utf8")
  assert.match(source, /pg_catalog\.pg_class/)
  assert.match(source, /information_schema\.columns/)
  assert.match(source, /pg_catalog\.pg_constraint/)
  assert.match(source, /pg_catalog\.pg_policies/)
  assert.match(source, /information_schema\.role_table_grants/)
  assert.match(source, /pg_catalog\.pg_trigger/)
  assert.doesNotMatch(source, /\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i)
})
