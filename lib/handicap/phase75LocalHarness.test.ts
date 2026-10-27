import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const harness = readFileSync("scripts/phase74_handicap_quarantine_local.mjs", "utf8")

test("local quarantine harness seeds every synthetic canonical player before provenance", () => {
  assert.match(harness, /\.\.\.correctedRows\.filter\(\(row\) => row\.source_type === "KWT"\)/)
  assert.match(harness, /\n\s*playerId,\n\]\)\]\.sort\(\)/)
  assert.match(harness, /create temporary table players_import \(id uuid primary key\)/)
  assert.match(harness, /insert into public\.players \(id\) select id from players_import/)
  assert.match(harness, /synthetic player fixture persisted/)

  const playerCopy = harness.indexOf('copy("players_import"')
  const provenanceInsert = harness.indexOf("insert into public.handicap_source_provenance")
  assert.notEqual(playerCopy, -1)
  assert.notEqual(provenanceInsert, -1)
  assert.ok(playerCopy < provenanceInsert, "players must be copied before provenance rows")
  assert.doesNotMatch(harness, /copy\("public\.players"/)
})

test("fixture correction preserves the foreign-key constraint", () => {
  assert.doesNotMatch(harness, /session_replication_role/i)
  assert.doesNotMatch(harness, /disable\s+trigger/i)
  assert.doesNotMatch(harness, /\\copy[^\r\n]*;\s*\n/)
  assert.match(harness, /canonical_player_id/)
  assert.match(harness, /'\$\{playerId\}'/)
})
