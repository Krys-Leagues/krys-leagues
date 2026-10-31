import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { historicalPypCommitBlockers, historicalPypCommitRows, type HistoricalPypIdentityReview } from "./historicalPypCommit.ts"
import { parseHistoricalPypPackage } from "./adapters/historicalPypParser.ts"

const root = "docs/historical-sources/pyp/google-sheets-recovery"
const preview = parseHistoricalPypPackage(
  readFileSync(`${root}/historical-pyp-normalized.csv`, "utf8"),
  readFileSync(`${root}/historical-pyp-opponent-evidence.csv`, "utf8"),
  readFileSync(`${root}/historical-pyp-rank-conflicts.csv`, "utf8"),
)

function identityReviews(): HistoricalPypIdentityReview[] {
  return [...new Set(preview.rows.map((row) => row.historicalPlayerName))].map((historicalPlayerName, index) => ({
    historicalPlayerName,
    status: "resolved",
    canonicalPlayerId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    canonicalPlayerName: `Canonical ${index + 1}`,
  }))
}

test("PYP commit readiness does not block unknown or unusable opponents", () => {
  assert.deepEqual(
    historicalPypCommitBlockers(preview, true, identityReviews(), {}, {}),
    [],
  )
})

test("PYP commit readiness blocks only unresolved identities and actionable ambiguity", () => {
  const identities = identityReviews()
  identities[0] = { ...identities[0], canonicalPlayerId: null, canonicalPlayerName: null, status: "unresolved" }
  const withActionableReview = {
    ...preview,
    pairingReviews: [{
      reviewKey: "pyp-pairing|synthetic",
      seasonNumber: 1,
      division: "1",
      gameNumber: 1,
      historicalPlayerName: "PLAYER A",
      opponentHistoricalPlayerName: null,
      pairingState: "AMBIGUOUS" as const,
      candidateOpponentHistoricalPlayerNames: ["PLAYER B"],
      pairingEvidence: "MULTIPLE PLAUSIBLE OPPONENTS — NEEDS REVIEW",
      sourceRange: "A1:I1",
      sourceCells: "A1;C1",
      sourceUrl: "https://example.test",
      sourceRows: [1],
    }],
  }
  const blockers = historicalPypCommitBlockers(withActionableReview, true, identities, {}, {})
  assert.ok(blockers.some((blocker) => blocker.includes("Resolve the canonical Global Player")))
  assert.ok(blockers.some((blocker) => blocker.includes("actionable PYP pairing review")))
  const resolved = historicalPypCommitBlockers(withActionableReview, true, identityReviews(), {}, {
    "pyp-pairing|synthetic": {
      reviewKey: "pyp-pairing|synthetic",
      status: "confirmed",
      opponentHistoricalPlayerName: "PLAYER B",
      opponentCanonicalPlayerId: null,
    },
  })
  assert.deepEqual(resolved, [])
})

test("PYP commit rows preserve era, raw holes-won tokens, states, and provenance", () => {
  const row = historicalPypCommitRows(preview, identityReviews(), {}, {})[0]
  assert.equal(row.sourceEra, "legacy_aggregate")
  assert.equal(row.sourceState, "PLAYED")
  assert.equal(row.course1Raw, "")
  assert.equal(row.course2Raw, "")
  assert.equal(row.totalHolesWon, 6)
  assert.equal(row.historicalPlayerName, "KRYS")
  assert.equal(row.sourceUrl.includes("docs.google.com/spreadsheets"), true)
})
