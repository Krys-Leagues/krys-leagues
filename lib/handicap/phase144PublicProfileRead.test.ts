import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (file: string) => readFile(file, "utf8")

test("Phase 144 eliminates the directly callable private helper", async () => {
  const sql = await read("supabase/proposals/20261022_handicap_public_profile_read_rpc_phase144.proposed.sql")
  assert.match(sql, /create function public\.get_public_published_handicap_for_player\(p_player_id pg_catalog\.uuid\)/)
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /alter function public\.get_public_published_handicap_for_player\(pg_catalog\.uuid\) owner to postgres/i)
  assert.doesNotMatch(sql, /create function handicap_private\./i)
  assert.doesNotMatch(sql, /grant execute on function handicap_private\./i)
  assert.match(sql, /grant execute on function public\.get_public_published_handicap_for_player\(pg_catalog\.uuid\) to anon, authenticated/i)
})

test("Phase 144 public projection excludes private evidence fields", async () => {
  const sql = await read("supabase/proposals/20261022_handicap_public_profile_read_rpc_phase144.proposed.sql")
  assert.match(sql, /public\.handicap_publishable_index_snapshots/)
  assert.doesNotMatch(sql, /source_round_ids|rating_snapshot_ids|rating_version_ids|provenance|review_evidence/i)
})
