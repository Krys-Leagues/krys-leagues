import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/proposals/20261022_handicap_rolling20_persistence.proposed.sql", "utf8")
const rpc = fs.readFileSync("supabase/proposals/20261022_handicap_rolling20_player_read_rpc.proposed.sql", "utf8")

test("rolling-20 proposal is additive and fail-closed", () => {
  assert.match(migration, /add column active_twenty_source_round_ids text\[\] not null default '\{\}'/i)
  assert.match(migration, /add column active_round_count integer not null default 0/i)
  assert.match(migration, /add column handicap_status text not null default 'LEGACY_BEST_FIVE'/i)
  assert.match(migration, /add column effective_from date/i)
  assert.match(migration, /differential_model_version = 'krys-handicap-candidate-a-v1'/i)
  assert.match(migration, /handicap_status = 'OFFICIAL_ELIGIBLE'/i)
  assert.match(migration, /handicap_status = 'PROVISIONAL' and active_round_count between 1 and 19/i)
  assert.match(migration, /i\.handicap_status in \('PROVISIONAL', 'OFFICIAL_ELIGIBLE'\)/i)
  assert.match(migration, /active_round_count = 20/i)
  assert.match(migration, /effective_from is not null/i)
  assert.match(migration, /security_invoker = true/i)
  assert.match(migration, /revoke all on table public\.handicap_publishable_index_snapshots from public, anon, authenticated/i)
  assert.doesNotMatch(migration, /\b(update|delete|truncate)\s+public\./i)
})

test("player reader is identity-bound and does not expose source evidence", () => {
  assert.match(rpc, /canonical_id := public\.current_user_canonical_player_id\(\)/i)
  assert.match(rpc, /p_player_id is distinct from canonical_id/i)
  assert.match(rpc, /handicap_publishable_index_snapshots/i)
  assert.match(rpc, /grant execute on function public\.get_published_handicap_for_player\(uuid\) to authenticated/i)
  assert.match(rpc, /revoke all on function public\.get_published_handicap_for_player\(uuid\) from public, anon/i)
  assert.doesNotMatch(rpc, /source_round_ids|rating_snapshot_ids|source_provenance/i)
})
