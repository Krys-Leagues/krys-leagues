import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const schema = readFileSync("supabase/proposals/20261018_handicap_review_snapshots.proposed.sql", "utf8")
const harness = readFileSync("scripts/phase74_handicap_quarantine_local.mjs", "utf8")

test("synthetic index fixture matches the installed array column types", () => {
  assert.match(schema, /source_round_ids text\[\]/i)
  assert.match(schema, /rating_snapshot_ids uuid\[\]/i)
  assert.match(schema, /rating_version_ids text\[\]/i)
  assert.match(schema, /latest_ten_source_round_ids text\[\]/i)
  assert.match(schema, /best_five_source_round_ids text\[\]/i)

  assert.match(harness, /array\['\$\{approvedRating\}'::uuid\]\s*::uuid\[\]/)
  assert.match(harness, /array\['\$\{approvedRating\}'\]\s*::text\[\]/)
  assert.match(harness, /array\['KWT\|approved\|101\|BHE\|1'\]\s*::text\[\]/)
})

test("synthetic fixture does not rely on untyped arrays for snapshot/index inserts", () => {
  const approvedInsert = harness.slice(harness.indexOf("insert into public.handicap_rating_snapshots"))
  assert.doesNotMatch(approvedInsert, /source_evidence_refs[^\n]*,array\['KWT\|approved\|101\|BHE\|1'\],/)
  assert.doesNotMatch(approvedInsert, /source_round_ids[^\n]*,array\['KWT\|approved\|101\|BHE\|1'\],array\[/)
})
