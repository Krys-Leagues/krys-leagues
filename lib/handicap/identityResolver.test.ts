import assert from "node:assert/strict"
import test from "node:test"
import {
  buildIdentityIndex,
  dryRunIdentityReconciliation,
  normalizeIdentityName,
  resolveHistoricalIdentity,
} from "./identityResolver.ts"

const players = [
  { id: "11111111-1111-4111-8111-111111111111", screenName: "Princess_Bankshot", aliases: ["Princess Bankshot"] },
  { id: "22222222-2222-4222-8222-222222222222", screenName: "Skeeter78", aliases: ["Skeeter 78"] },
]

test("identity normalization is conservative and preserves punctuation", () => {
  assert.equal(normalizeIdentityName("  Princess_Bankshot  "), "princess_bankshot")
  assert.equal(normalizeIdentityName("Princess  Bankshot"), "princess bankshot")
})

test("existing Discord/global player linkage resolves by canonical id", () => {
  const result = resolveHistoricalIdentity(
    { historicalName: "changed display name", playerId: players[0].id },
    players,
  )
  assert.equal(result.status, "resolved")
  assert.equal(result.playerId, players[0].id)
  assert.equal(result.reason, "STORED_PLAYER_ID")
})

test("known alias resolves to the same canonical player without creating a person", () => {
  const result = resolveHistoricalIdentity({ historicalName: "Princess Bankshot" }, players)
  assert.equal(result.status, "resolved")
  assert.equal(result.playerId, players[0].id)
  assert.equal(result.reason, "EXACT_ALIAS")
  assert.equal(buildIdentityIndex(players).size, 4)
})

test("unmatched names are reported and never synthesized", () => {
  const result = resolveHistoricalIdentity({ historicalName: "Unknown Historical Name" }, players)
  assert.equal(result.status, "unresolved")
  assert.equal(result.reason, "NO_EXACT_MATCH")
  assert.equal(result.playerId, undefined)
})

test("ambiguous exact names do not guess", () => {
  const ambiguousPlayers = [
    ...players,
    { id: "33333333-3333-4333-8333-333333333333", screenName: "Skeeter 78" },
  ]
  const result = resolveHistoricalIdentity({ historicalName: "Skeeter 78" }, ambiguousPlayers)
  assert.equal(result.status, "ambiguous")
  assert.deepEqual(result.candidates, [players[1].id, ambiguousPlayers[2].id].sort())
})

test("dry-run reconciliation reports resolved, unresolved, and ambiguous rows", () => {
  const report = dryRunIdentityReconciliation(
    [
      { historicalName: "Princess_Bankshot" },
      { historicalName: "Unknown" },
      { historicalName: "Skeeter 78" },
    ],
    [
      ...players,
      { id: "33333333-3333-4333-8333-333333333333", screenName: "Skeeter 78" },
    ],
  )
  assert.deepEqual(
    { total: report.total, resolved: report.resolved, unresolved: report.unresolved, ambiguous: report.ambiguous },
    { total: 3, resolved: 1, unresolved: 1, ambiguous: 1 },
  )
})
