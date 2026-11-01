import assert from "node:assert/strict"
import test from "node:test"
import { filterTrophiesForScope, isKwtTrophy } from "./championScope.ts"

const trophies = [
  { id: "kwt-1", league_type: "kwt" },
  { id: "kwt-2", league_type: " KWT " },
  { id: "stroke-1", league_type: "stroke" },
  { id: "unknown-1", league_type: null },
]

test("KWT scope keeps only KWT trophies", () => {
  assert.deepEqual(filterTrophiesForScope(trophies, "kwt").map((trophy) => trophy.id), ["kwt-1", "kwt-2"])
  assert.equal(isKwtTrophy(trophies[2]), false)
})

test("full Hall scope preserves every trophy", () => {
  assert.deepEqual(filterTrophiesForScope(trophies, "all"), trophies)
})
