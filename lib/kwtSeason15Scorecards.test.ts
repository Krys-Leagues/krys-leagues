import assert from "node:assert/strict"
import test from "node:test"
import { aceLeaders, parseKwtSeason15Week01 } from "./kwtSeason15Scorecards.ts"

const row = (overrides: Record<string, string> = {}) => ({
  Pos: "1", Player: "Player", "Rank Code": "PRO", "Easy Code": "RCE", "Hard Code": "RCH",
  ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`E${i + 1}`, i === 0 ? "1" : "2"])),
  ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`H${i + 1}`, i === 1 ? "1" : "2"])),
  Easy: "-5", Hard: "-4", "Total Score": "-9", Points: "25", Badges: "", ...overrides,
})

test("Week 01 preserves both 18-hole raw cards and counts actual aces", () => {
  const result = parseKwtSeason15Week01([row()], "kwt15w01_ful_results.csv")
  assert.equal(result.errors.length, 0)
  assert.equal(result.rows[0].easyHoles.length, 18)
  assert.equal(result.rows[0].hardHoles.length, 18)
  assert.equal(result.rows[0].easyAces, 1)
  assert.equal(result.rows[0].hardAces, 1)
  assert.equal(result.rows[0].combinedAces, 2)
  assert.equal(result.rows[0].identityStatus, "UNRESOLVED")
})

test("Week 01 blocks malformed holes and conflicting totals", () => {
  const result = parseKwtSeason15Week01([row({ E4: "", "Total Score": "-8" })], "kwt15w01_ful_results.csv")
  assert.ok(result.errors.length >= 1)
})

test("ace leaders require separately verified NET divisions and preserve ties", () => {
  const parsed = parseKwtSeason15Week01([row({ Player: "A" }), row({ Player: "B" })], "kwt15w01_ful_results.csv")
  const leaders = aceLeaders(parsed.rows, new Map([["A", "PRO"], ["B", "PRO"]]))
  const pro = leaders.find((item) => item.division === "PRO")!
  assert.deepEqual(pro.easy.players, ["A", "B"])
  assert.deepEqual(pro.hard.players, ["A", "B"])
})
