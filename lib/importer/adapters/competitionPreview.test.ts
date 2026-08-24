import assert from "node:assert/strict"
import test from "node:test"
import { previewCompetitionRows } from "./competitionPreview.ts"

const players = [
  { id: "player-1", screenName: "Current Name", verifiedAliases: ["Old Name"] },
]

test("KWT preview gets season and week from filename and resolves verified aliases", () => {
  const preview = previewCompetitionRows([{
    Player: "Old Name", "Easy Code": "zze", Easy: "-3", "Hard Code": "qvh", Hard: "2", Total: "-1",
  }], { kind: "kwt", filename: "kwt59w1.csv", players })
  assert.equal(preview.rows[0].canonicalPlayerId, "player-1")
  assert.equal(preview.rows[0].season, "59")
  assert.equal(preview.rows[0].week, 1)
  assert.deepEqual(preview.rows[0].rounds.map((round) => round.score), [-3, 2])
  assert.equal(preview.summary.safeToApply, 1)
})

test("competition preview preserves only supplied facts and blocks unresolved players", () => {
  const preview = previewCompetitionRows([{
    "Event Name": "Summer Invitational", Player: "Unknown", Placement: "2nd", Year: "2024",
  }], { kind: "invitational", players })
  assert.equal(preview.rows[0].eventType, null)
  assert.equal(preview.rows[0].division, null)
  assert.equal(preview.rows[0].placement, "2nd")
  assert.equal(preview.summary.unresolvedPlayers, 1)
  assert.equal(preview.summary.blocked, 1)
})

test("ambiguous aliases are never guessed", () => {
  const preview = previewCompetitionRows([{ Player: "Shared", Tournament: "Cup" }], {
    kind: "tournament",
    players: [
      { id: "one", screenName: "One", verifiedAliases: ["Shared"] },
      { id: "two", screenName: "Two", verifiedAliases: ["Shared"] },
    ],
  })
  assert.equal(preview.rows[0].identityStatus, "ambiguous")
  assert.equal(preview.rows[0].canonicalPlayerId, null)
  assert.equal(preview.rows[0].identityCandidates.length, 2)
})

test("duplicate rows are blocked within a preview", () => {
  const row = { Player: "Current Name", Tournament: "Cup", Placement: "Winner", Year: "2025" }
  const preview = previewCompetitionRows([row, row], { kind: "tournament", players })
  assert.equal(preview.summary.duplicates, 2)
  assert.equal(preview.summary.safeToApply, 0)
})

test("authoritative Easy and Hard KWT scores are safe without division or placement", () => {
  const preview = previewCompetitionRows([{ Player: "Old Name", "Easy Code": "GBE", Easy: "-23", "Hard Code": "ATH", Hard: "-18" }], { kind: "kwt", filename: "kwt12w10_ful_results.csv", players })
  const row = preview.rows[0]
  assert.equal(row.issues.length, 0)
  assert.equal(row.division, null)
  assert.equal(row.placement, null)
  assert.equal(row.historicalPlayerName, "Old Name")
  assert.equal(preview.summary.safeWithOptionalFieldsMissing, 1)
})

test("archived and Memorial canonical players remain valid KWT history targets", () => {
  const preview = previewCompetitionRows([
    { Player: "Archived", Easy: "-10", Hard: "-8" },
    { Player: "Memorial", Easy: "-12", Hard: "-9" },
  ], { kind: "kwt", filename: "kwt12w1.csv", players: [
    { id: "archived", screenName: "Archived", verifiedAliases: [], status: "archived", active: false },
    { id: "memorial", screenName: "Memorial", verifiedAliases: [], status: "archived", active: false, memorial: true },
  ] })
  assert.equal(preview.summary.archivedPlayersResolved, 1)
  assert.equal(preview.summary.memorialPlayersResolved, 1)
  assert.equal(preview.summary.safeToApply, 2)
})

test("source-backed Rank Code and published Pos are preserved without inference", () => {
  const preview = previewCompetitionRows([{ Player: "Current Name", "Rank Code": "ELITE", Pos: "1", Easy: "-20", Hard: "-15" }], { kind: "kwt", filename: "kwt14w1.csv", players })
  assert.equal(preview.rows[0].division, "ELITE")
  assert.equal(preview.rows[0].publishedPosition, "1")
  assert.equal(preview.rows[0].placement, null)
  assert.equal(preview.rows[0].warnings.length, 0)
})

test("exact KWT re-import fingerprints are deterministic and idempotently blocked", () => {
  const row = { Player: "Current Name", "Rank Code": "PRO", Pos: "2", "Easy Code": "AME", Easy: "-20", "Hard Code": "AMH", Hard: "-10" }
  const first = previewCompetitionRows([row], { kind: "kwt", filename: "kwt14w1.csv", players })
  const repeated = previewCompetitionRows([row, row], { kind: "kwt", filename: "kwt14w1.csv", players })
  assert.equal(first.rows[0].sourceFingerprint, repeated.rows[0].sourceFingerprint)
  assert.equal(repeated.summary.duplicates, 2)
  assert.equal(repeated.summary.safeToApply, 0)
})

test("conflicting KWT observations are reported instead of deleting provenance", () => {
  const base = { Player: "Current Name", "Easy Code": "AME", "Hard Code": "AMH" }
  const preview = previewCompetitionRows([{ ...base, Easy: "-20", Hard: "-10" }, { ...base, Easy: "-21", Hard: "-10" }], { kind: "kwt", filename: "kwt14w1.csv", players })
  assert.equal(preview.summary.conflicts, 2)
  assert.match(preview.rows[0].issues.join(" "), /Conflicting observation/)
})
