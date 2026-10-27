import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import { exactMappingCandidate, mappingKey } from "./doublesLegacyMapping.ts"

const sql = fs.readFileSync(new URL("../doubles_legacy_canonical_review.sql", import.meta.url), "utf8")

test("legacy mapping uses an explicit source/context key", () => {
  assert.equal(mappingKey({ source: "schedule", key: "g1", name: "Pink", player1Name: null, player2Name: null, player1Id: "p1", player2Id: "p2", seasonId: "s1", division: "D1" }), "schedule|g1|s1|D1")
})

test("only exact canonical team identity is an automatic candidate", () => {
  const team = { name: "Pink", player1Id: "p1", player2Id: "p2" }
  assert.equal(exactMappingCandidate({ source: "doubles_teams", key: "t1", name: "Pink", player1Name: "A", player2Name: "B", player1Id: "p1", player2Id: "p2", seasonId: null, division: null }, team), true)
  assert.equal(exactMappingCandidate({ source: "doubles_teams", key: "t1", name: "Pink", player1Name: "A", player2Name: "B", player1Id: "p1", player2Id: "p3", seasonId: null, division: null }, team), false)
})

test("SQL requires explicit admin approval and preserves ambiguous mappings", () => {
  assert.match(sql, /doubles_legacy_canonical_mapping_review/)
  assert.match(sql, /status in \('needs_review','approved','rejected','ambiguous'\)/)
  assert.match(sql, /is_current_user_site_admin\(\)/)
  assert.match(sql, /Legacy Player 1 does not exactly match/)
  assert.match(sql, /revoke all on table public\.doubles_legacy_canonical_mapping_review/)
})
