import assert from "node:assert/strict"
import test from "node:test"
import { classifyMonthlyProductionOverlap, isMonthlyScoreImportable, monthlyRepairLogicalKey, monthlyRepairPreflight, summarizeMonthlyIdentityStatuses } from "./monthlyRepairedHistory.ts"

const row = (overrides: Partial<Parameters<typeof classifyMonthlyProductionOverlap>[0][number]> = {}) => ({
  logicalObservationKey: "221|22|id:8108|Atlantis|easy",
  score: -26,
  playedState: "PLAYED" as const,
  ...overrides,
})

test("repaired logical keys use source IDs and preserve difficulty", () => {
  assert.equal(monthlyRepairLogicalKey({ periodId: 221, divisionId: "22", division: "Elite", sourcePlayerId: "8108", historicalPlayerName: "PETERK9FLORIDA", courseName: "Atlantis", difficulty: "easy" }), "221|22|id:8108|Atlantis|easy")
  assert.equal(monthlyRepairLogicalKey({ periodId: 221, divisionId: null, division: "Elite", sourcePlayerId: null, historicalPlayerName: "Exact Name", courseName: "Atlantis", difficulty: "hard" }), "221|label:Elite|name:Exact Name|Atlantis|hard")
})

test("Production overlap distinguishes exact, missing, production-only, and true conflict", () => {
  const result = classifyMonthlyProductionOverlap(
    [row(), row({ logicalObservationKey: "1|22|id:2|Course|easy", score: 2 })],
    [row(), row({ logicalObservationKey: "production-only", score: 0 }), row({ logicalObservationKey: "1|22|id:2|Course|easy", score: 1 })],
  )
  assert.equal(result.exactDuplicateRows, 1)
  assert.equal(result.missingFromProductionRows, 0)
  assert.equal(result.productionOnlyRows, 1)
  assert.equal(result.trueConflictRows, 1)
})

test("negative, zero, and positive numeric scores are importable while blank is evidence-only", () => {
  assert.equal(isMonthlyScoreImportable({ score: -5, playedState: "PLAYED" }), true)
  assert.equal(isMonthlyScoreImportable({ score: 0, playedState: "PLAYED" }), true)
  assert.equal(isMonthlyScoreImportable({ score: 3, playedState: "PLAYED" }), true)
  assert.equal(isMonthlyScoreImportable({ score: null, playedState: "UNPLAYED" }), false)
  const result = classifyMonthlyProductionOverlap(
    [row({ logicalObservationKey: "blank", score: null, playedState: "UNPLAYED" }), row({ logicalObservationKey: "zero", score: 0 }), row({ logicalObservationKey: "negative", score: -1 })],
    [row({ logicalObservationKey: "blank", score: null, playedState: "UNPLAYED" }), row({ logicalObservationKey: "zero", score: 0 }), row({ logicalObservationKey: "negative", score: -1 })],
  )
  assert.equal(result.trueConflictRows, 0)
  assert.equal(result.exactDuplicateRows, 2)
})

test("repair preflight blocks only explicit safety blockers and reports quarantine", () => {
  const overlap = classifyMonthlyProductionOverlap([row()], [], true)
  const result = monthlyRepairPreflight({ overlap, playedRows: 1, blankUnplayedRows: 1, identityBlockedRows: 0, quarantinedRows: 1, malformedRows: 0, logicalDuplicateRows: 0, requiredIdentityRows: 0 })
  assert.equal(result.ready, true)
  assert.deepEqual(result.blockedReasons, [])
})

test("identity preview counts exact, mapped, ambiguous, and unresolved separately", () => {
  assert.deepEqual(summarizeMonthlyIdentityStatuses(["exact", "alias", "ambiguous", "unresolved", "alias"]), { exact: 1, mapped: 2, ambiguous: 1, unresolved: 1 })
})
