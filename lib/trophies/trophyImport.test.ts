import assert from "node:assert/strict"
import test from "node:test"
import { findTrophyDuplicate, parseTrophyAsset, resolveTrophyPlayer, trophySemanticKey, type TrophyDuplicateComparable } from "./trophyImport.ts"

function trophy(overrides: Partial<TrophyDuplicateComparable> = {}): TrophyDuplicateComparable {
  return {
    playerId: "leanin2it-id",
    playerName: "leanin2it",
    trophyTitle: "Hollywood",
    eventType: "1 Day Tournament",
    eventName: "Hollywood",
    leagueType: "one-day",
    division: "",
    placement: "Champion",
    season: "2026",
    month: "",
    sourceKey: "upload:sha256:hollywood",
    imageUrl: "https://example.test/hollywood.webp",
    ...overrides,
  }
}

test("parses a named monthly trophy asset", () => {
  const result = parseTrophyAsset("/league-media/trophies/Monthly/2026/June/SEMI%20PRO%201/KrysMonthly_2026_June_SemiPro1_2nd_Audrey.webp")
  assert.equal(result?.playerName, "Audrey")
  assert.equal(result?.division, "Semi Pro 1")
  assert.equal(result?.placement, "2nd")
  assert.equal(result?.month, "June 2026")
  assert.equal(result?.sourceKey, "asset:/league-media/trophies/Monthly/2026/June/SEMI%20PRO%201/KrysMonthly_2026_June_SemiPro1_2nd_Audrey.webp")
})

test("semantic duplicate keys use canonical player ownership and achievement fields", () => {
  const left = trophySemanticKey(trophy({ playerId: "canonical-id", playerName: "Old Name", trophyTitle: "June Winner", eventType: "Monthly", eventName: "June Monthly", leagueType: "monthly", division: "Pro 1", placement: "1st", season: "2026", month: "June" }))
  const right = trophySemanticKey(trophy({ playerId: "canonical-id", playerName: "Current Name", trophyTitle: " JUNE  WINNER ", eventType: "MONTHLY", eventName: "  JUNE   MONTHLY ", leagueType: "MONTHLY", division: "PRO 1", placement: "1ST", season: "2026", month: "JUNE" }))
  assert.equal(left, right)
})

test("same player may own Hollywood and Tiki a Coco Champion trophies", () => {
  const hollywood = trophy()
  const tiki = trophy({
    trophyTitle: "Tiki a Coco",
    eventName: "Tiki a Coco",
    sourceKey: "upload:sha256:tiki",
    imageUrl: "https://example.test/tiki.webp",
  })
  assert.equal(findTrophyDuplicate(tiki, [hollywood]), null)
  assert.deepEqual(hollywood, trophy())
})

test("same player may win multiple different one-day tournaments", () => {
  const first = trophy()
  const second = trophy({
    trophyTitle: "Desert Classic",
    eventName: "Desert Classic",
    sourceKey: "upload:sha256:desert",
    imageUrl: "https://example.test/desert.webp",
  })
  assert.equal(findTrophyDuplicate(second, [first]), null)
})

test("same player and generic Champion award do not imply a duplicate", () => {
  const first = trophy({ trophyTitle: "Champion", eventName: "", sourceKey: "upload:sha256:first", imageUrl: "first.webp" })
  const second = trophy({ trophyTitle: "Champion", eventName: "", sourceKey: "upload:sha256:second", imageUrl: "second.webp" })
  assert.equal(findTrophyDuplicate(second, [first]), null)
})

test("same player may win different Monthly trophies", () => {
  const may = trophy({ trophyTitle: "May Elite 1st", eventType: "Monthly", eventName: "May 2026 Monthly", leagueType: "monthly", division: "Elite", placement: "1st", month: "May 2026", sourceKey: "asset:may", imageUrl: "may.webp" })
  const june = trophy({ trophyTitle: "June Elite 1st", eventType: "Monthly", eventName: "June 2026 Monthly", leagueType: "monthly", division: "Elite", placement: "1st", month: "June 2026", sourceKey: "asset:june", imageUrl: "june.webp" })
  assert.equal(findTrophyDuplicate(june, [may]), null)
})

test("exact same uploaded file hash is blocked", () => {
  const existing = trophy()
  const duplicate = trophy({ trophyTitle: "Renamed trophy", eventName: "Renamed event", imageUrl: null })
  assert.equal(findTrophyDuplicate(duplicate, [existing])?.kind, "source")
})

test("exact same source trophy is blocked", () => {
  const existing = trophy({ sourceKey: "asset:/trophies/exact.webp" })
  const duplicate = trophy({ sourceKey: "asset:/trophies/exact.webp", imageUrl: "different-url.webp" })
  assert.equal(findTrophyDuplicate(duplicate, [existing])?.kind, "source")
})

test("keeps opaque legacy assets for manual player review", () => {
  const result = parseTrophyAsset("/league-media/trophies/Monthly/2026/MARCH/ELITE/AB5CB61D.webp")
  assert.equal(result?.playerName, "")
  assert.equal(result?.status, "needs-player")
  assert.equal(result?.division, "Elite")
})

test("verified alias matching returns the canonical player ID", () => {
  const player = resolveTrophyPlayer("YANKEEDUDE1123", [{ id: "canonical-player-id", screenName: "Current Discord Name 🏆", verifiedAliases: ["YankeeDude1123"] }])
  assert.equal(player?.id, "canonical-player-id")
})

test("unknown or ambiguous owners remain unresolved", () => {
  assert.equal(resolveTrophyPlayer("Unknown", []), null)
  assert.equal(resolveTrophyPlayer("Shared Alias", [
    { id: "one", screenName: "One", verifiedAliases: ["Shared Alias"] },
    { id: "two", screenName: "Two", verifiedAliases: ["Shared Alias"] },
  ]), null)
})
