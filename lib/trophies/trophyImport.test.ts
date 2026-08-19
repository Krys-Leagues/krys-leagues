import assert from "node:assert/strict"
import test from "node:test"
import { parseTrophyAsset, trophySemanticKey } from "./trophyImport.ts"

test("parses a named monthly trophy asset", () => {
  const result = parseTrophyAsset("/league-media/trophies/Monthly/2026/June/SEMI%20PRO%201/KrysMonthly_2026_June_SemiPro1_2nd_Audrey.webp")
  assert.equal(result?.playerName, "Audrey")
  assert.equal(result?.division, "Semi Pro 1")
  assert.equal(result?.placement, "2nd")
  assert.equal(result?.month, "June 2026")
  assert.equal(result?.sourceKey, "asset:/league-media/trophies/Monthly/2026/June/SEMI%20PRO%201/KrysMonthly_2026_June_SemiPro1_2nd_Audrey.webp")
})

test("semantic duplicate keys use canonical player ownership and achievement fields", () => {
  const left = trophySemanticKey({ playerId: "canonical-id", playerName: "Old Name", eventName: "June Monthly", division: "Pro 1", placement: "1st", season: "2026", month: "June" })
  const right = trophySemanticKey({ playerId: "canonical-id", playerName: "Current Name", eventName: "  JUNE   MONTHLY ", division: "PRO 1", placement: "1ST", season: "2026", month: "JUNE" })
  assert.equal(left, right)
})

test("keeps opaque legacy assets for manual player review", () => {
  const result = parseTrophyAsset("/league-media/trophies/Monthly/2026/MARCH/ELITE/AB5CB61D.webp")
  assert.equal(result?.playerName, "")
  assert.equal(result?.status, "needs-player")
  assert.equal(result?.division, "Elite")
})
