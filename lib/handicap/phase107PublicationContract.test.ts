import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("Phase 107 player-read proposal is identity-bound and client-denied", async () => {
  const source = await readFile("supabase/proposals/20261020_handicap_player_read_rpc.proposed.sql", "utf8")
  assert.match(source, /security definer/)
  assert.match(source, /set search_path = ''/)
  assert.match(source, /current_user_canonical_player_id\(\)/)
  assert.match(source, /p_player_id is distinct from canonical_id/)
  assert.match(source, /revoke all on function public\.get_published_handicap_for_player\(uuid\) from public, anon/)
  assert.match(source, /grant execute on function public\.get_published_handicap_for_player\(uuid\) to authenticated/)
  assert.doesNotMatch(source, /grant select on table public\.handicap_publishable_index_snapshots to authenticated/)
})

test("Phase 107 publication preparation remains local and append-only", async () => {
  const readme = await readFile("docs/handicap/phase107/README.md", "utf8")
  assert.match(readme, /local-only/i)
  assert.match(readme, /new.*calculation run/i)
  assert.match(readme, /UNPUBLISHED/i)
  assert.match(readme, /Weekly/i)
})
