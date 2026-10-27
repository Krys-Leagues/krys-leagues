import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const proposal = "supabase/proposals/20261018_handicap_review_snapshots.proposed.sql"

test("handicap persistence proposal is clearly unapplied and scoped", async () => {
  const source = await readFile(proposal, "utf8")
  assert.match(source, /PROPOSAL ONLY — NOT A MIGRATION/)
  for (const table of [
    "handicap_calculation_runs",
    "handicap_rating_snapshots",
    "handicap_index_snapshots",
    "handicap_review_evidence",
    "handicap_review_decisions",
    "handicap_source_provenance",
  ]) {
    assert.match(source, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(source, /enable row level security/)
  }
  assert.match(source, /references public\.players\(id\)/)
  assert.match(source, /revoke all on table public\.%I from public, anon, authenticated/)
  assert.match(source, /handicap_private\.reject_history_mutation/)
  assert.match(source, /before update or delete on public\.%I/)
  assert.match(source, /grant select, insert on table public\.handicap_rating_snapshots to service_role/)
  assert.match(source, /revoke update, delete, truncate on table public\.handicap_rating_snapshots from service_role/)
  assert.match(source, /incompatible definition/)
  assert.doesNotMatch(source, /create or replace function/i)
  assert.doesNotMatch(source, /\b(drop|delete|update|truncate)\s+from\s+public\./i)
})
