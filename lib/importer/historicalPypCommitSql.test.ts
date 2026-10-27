import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync("historical_pyp_import_foundation.sql", "utf8")

test("Historical PYP migration is additive, admin-protected, and idempotent", () => {
  assert.match(sql, /create table if not exists public\.historical_pyp_imports/)
  assert.match(sql, /create table if not exists public\.historical_pyp_observations/)
  assert.match(sql, /source_sha256 text not null/)
  assert.match(sql, /unique \(historical_pyp_import_id, source_fingerprint\)/)
  assert.match(sql, /canonical_player_id uuid not null references public\.players/)
  assert.match(sql, /opponent_historical_player_name text null/)
  assert.match(sql, /is_current_user_site_admin\(\)/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /commit_historical_pyp_preview/)
  assert.match(sql, /where source\.source_sha256 = p_source_sha256/)
  assert.match(sql, /Season 15|between 1 and 14/)
  assert.doesNotMatch(sql, /drop table|truncate table|delete from public\.pyp_/i)
})
