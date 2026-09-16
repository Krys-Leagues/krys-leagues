import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  FIXTURE_SOURCE_AUDIT_26_TO_55,
  HISTORICAL_MATCH_FIXTURE_RECOVERY_26_TO_55,
  validateHistoricalMatchFixtureRecovery,
} from "./historicalMatchFixtureRecovery26to55.ts"

const sql = readFileSync("historical_match_fixture_recovery_26_55.sql", "utf8")

test("recovery contains only source-proven Season 46 and 53 fixtures", () => {
  assert.deepEqual(validateHistoricalMatchFixtureRecovery(), [])
  const counts = HISTORICAL_MATCH_FIXTURE_RECOVERY_26_TO_55.reduce<Record<number, number>>((result, row) => {
    result[row.seasonNumber] = (result[row.seasonNumber] ?? 0) + 1
    return result
  }, {})
  assert.deepEqual(counts, { 46: 20, 53: 20 })
})

test("source audit covers every requested season without manufacturing fixtures", () => {
  assert.deepEqual(FIXTURE_SOURCE_AUDIT_26_TO_55.map((row) => row.seasonNumber), Array.from({ length: 30 }, (_, index) => index + 26))
  assert.equal(FIXTURE_SOURCE_AUDIT_26_TO_55.find((row) => row.seasonNumber === 46)?.status, "PARTIAL SOURCE")
  assert.equal(FIXTURE_SOURCE_AUDIT_26_TO_55.find((row) => row.seasonNumber === 53)?.status, "COMPLETE SOURCE")
  assert.ok(FIXTURE_SOURCE_AUDIT_26_TO_55.filter((row) => row.status === "NO FIXTURE SOURCE FOUND").every((row) =>
    !HISTORICAL_MATCH_FIXTURE_RECOVERY_26_TO_55.some((fixture) => fixture.seasonNumber === row.seasonNumber)))
})

test("validator blocks ambiguous, cross-range, BYE, duplicate, and repeated-participant rows", () => {
  const [base] = HISTORICAL_MATCH_FIXTURE_RECOVERY_26_TO_55
  const invalid = [
    { ...base, seasonNumber: 58, sourceImage: "out-of-range.png" },
    { ...base, player2HistoricalName: "BYE", sourceImage: "bye.png" },
    { ...base, player2HistoricalName: "UNRESOLVED SOURCE NAME", sourceImage: "ambiguous.png" },
    { ...base, sourceImage: "reverse.png", player1FinalRank: base.player2FinalRank, player2FinalRank: base.player1FinalRank },
  ]
  const errors = validateHistoricalMatchFixtureRecovery([base, ...invalid]).join(" ")
  assert.match(errors, /outside the authorized recovery range/)
  assert.match(errors, /BYE cannot be a fixture participant/)
  assert.match(errors, /does not match the preserved season\/division\/rank standing/)
  assert.match(errors, /Duplicate or reversed fixture/)
  assert.match(errors, /Repeated course participation/)
})

test("prepared SQL and evidence transcript contain the same 40 deterministic rows", () => {
  for (const row of HISTORICAL_MATCH_FIXTURE_RECOVERY_26_TO_55) {
    const tuple = `(${row.seasonNumber}, ${row.divisionNumber}, ${row.courseOrder}, '${row.courseName}', ${row.player1FinalRank}, '${row.player1HistoricalName}', ${row.player1HolesWon}, ${row.player2FinalRank}, '${row.player2HistoricalName}', ${row.player2HolesWon}, `
    assert.ok(sql.includes(tuple), `SQL is missing ${tuple}`)
    assert.ok(sql.includes(`${row.sourceImage}#${row.sourceImageSha256}`), `SQL is missing source evidence ${row.sourceImage}`)
  }
  assert.equal((sql.match(/^\s*\((?:46|53),/gm) ?? []).length, 40)
})

test("prepared SQL is insert-only, resolves the same import and division, and protects existing rows", () => {
  assert.match(sql, /insert into public\.historical_match_fixtures/i)
  assert.doesNotMatch(sql, /\b(?:update|delete|truncate)\b/i)
  assert.doesNotMatch(sql, /\b(?:create|alter|drop|grant|revoke)\b/i)
  assert.doesNotMatch(sql, /public\.(?:schedule|season_standings|match_roster|match_results)/i)
  assert.match(sql, /source\.season_number = v\.season_number/)
  assert.match(sql, /standing\.historical_match_import_id = v_import_id/)
  assert.match(sql, /standing\.division_number = v\.division_number/)
  assert.match(sql, /standing\.source_final_rank = v\.player1_final_rank/)
  assert.doesNotMatch(sql, /min\((?:source|standing)\.id\)/i)
  assert.match(sql, /existing fixture conflicts with recovered source evidence/i)
  assert.match(sql, /already appears in another fixture for this course/i)
})

test("prepared SQL never targets protected Seasons 21-25 or current Season 58", () => {
  assert.match(sql, /v\.season_number < 26 or v\.season_number > 55/)
  assert.doesNotMatch(sql, /\(2[1-5],\s*\d+,\s*\d+,\s*'/)
  assert.doesNotMatch(sql, /\(58,\s*\d+,\s*\d+,\s*'/)
})

test("public reader returns stored fixture rows and preserved historical display names", () => {
  const reader = readFileSync("historical_match_public_read.sql", "utf8")
  assert.match(reader, /from public\.historical_match_fixtures as fixture/)
  assert.match(reader, /player1\.historical_display_name as player1_historical_display_name/)
  assert.match(reader, /player2\.historical_display_name as player2_historical_display_name/)
  assert.match(reader, /'historical_matchups'/)
})

test("standings-only seasons remain supported by the approved public page", () => {
  const page = readFileSync("app/match-play/page.tsx", "utf8")
  assert.match(page, /selectedMatchups\.length > 0/)
  assert.match(page, /Published final standings for this season\./)
})
