import test from "node:test"
import assert from "node:assert/strict"

import { validateCurrentKwtRoster } from "./currentSeasonRoster.ts"

const row = {
  sourceRow: 34,
  rawPlayerName: "Stephen1D47",
  canonicalName: "Stephen1D47",
  canonicalPlayerId: "player-1",
  division: "Semi Pro",
} as const

test("current KWT roster validation reports a missing exact-season membership", () => {
  const issue = validateCurrentKwtRoster(row, [])
  assert.equal(issue?.status, "MISSING")
  assert.match(issue?.message ?? "", /not enrolled on the Season 15 KWT roster/)
})

test("current KWT roster validation rejects a membership in the wrong division", () => {
  const issue = validateCurrentKwtRoster(row, [{ playerId: "player-1", division: "Pro" }])
  assert.equal(issue?.status, "DIVISION_MISMATCH")
  assert.equal(issue?.rosterDivision, "Pro")
  assert.match(issue?.message ?? "", /do not reclassify silently/)
})

test("current KWT roster validation accepts the exact player and division", () => {
  assert.equal(validateCurrentKwtRoster(row, [{ playerId: "player-1", division: "Semi Pro" }]), null)
})
