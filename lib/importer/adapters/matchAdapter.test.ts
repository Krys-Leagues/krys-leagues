import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { previewHistoricalMatchCsv } from "./matchAdapter.ts"
import {
  buildHistoricalMatchCommitPayload,
  historicalMatchCommitBlockers,
  historicalMatchStandingKey,
  previewFingerprint,
  sourceSha256,
} from "../historicalMatchCommit.ts"
import { historicalStandingIdentityRpcArgs, searchExistingPlayers } from "../historicalMatchIdentity.ts"
import type { PlayerRecord } from "../loadPlayers.ts"
import type { PlayerIdentityAlias } from "../../identity/types.ts"

const SIDE_WIDTH = 19
const RIGHT_START = 20
const headers = ["NAME", "P", "W", "L", "D", "PTS", "HW", "W", "L", "D", "HW", "W", "L", "D", "HW", "W", "L", "D", "HW"]

function playerRow(name: string, options?: { oneCourse?: boolean; playedZero?: boolean }) {
  if (options?.oneCourse) return [name, "1", "0", "1", "0", "0", "3", "", "1", "", "3", "", "", "", "0", "", "", "", "0"]
  return [name, "3", "1", "1", "1", "4", options?.playedZero ? "8" : "12", "1", "", "", options?.playedZero ? "0" : "4", "", "1", "", "3", "", "", "1", "5"]
}

function divisionRows(division: number, names: string[], rightOrder: string[], special: Record<string, { oneCourse?: boolean; playedZero?: boolean }> = {}) {
  const marker = Array(RIGHT_START + SIDE_WIDTH).fill("")
  marker[0] = `Division ${division}`
  marker[RIGHT_START] = `Division ${division}`
  const header = Array(RIGHT_START + SIDE_WIDTH).fill("")
  headers.forEach((value, index) => { header[index] = value; header[RIGHT_START + index] = value })
  const rows = [marker, header]
  for (let index = 0; index < Math.max(names.length, rightOrder.length); index += 1) {
    const row = Array(RIGHT_START + SIDE_WIDTH).fill("")
    playerRow(names[index] ?? "", special[names[index]]).forEach((value, column) => { row[column] = value })
    playerRow(rightOrder[index] ?? "", special[rightOrder[index]]).forEach((value, column) => { row[RIGHT_START + column] = value })
    rows.push(row)
  }
  return rows
}

function season55Matrix() {
  const matrix: string[][] = [["SEASON 55 * ENDS JUNE 24TH"]]
  for (let division = 1; division <= 5; division += 1) {
    const names = division === 4
      ? ["AUDREY", "ZOE DARLIN", "SHAHOOFNA", "RAY OF SUNSHINE"]
      : Array.from({ length: 4 }, (_, index) => `D${division} PLAYER ${index + 1}`)
    const right = division === 4 ? ["AUDREY", "SHAHOOFNA", "RAY OF SUNSHINE", "ZOE DARLIN"] : [...names].reverse()
    matrix.push(...divisionRows(division, names, right, {
      "ZOE DARLIN": { oneCourse: true },
      "D2 PLAYER 1": { oneCourse: true },
      "D1 PLAYER 4": { playedZero: true },
    }))
    const structural = Array(RIGHT_START + SIDE_WIDTH).fill("")
    structural[0] = "KRYS' MATCH"
    structural[RIGHT_START] = "KRYS' MATCH"
    matrix.push(structural)
  }
  matrix.push(...divisionRows(6, ["", "", "3", "4"], ["", "", "3", "4"]))
  matrix.push(...divisionRows(7, ["1", "2", "3", "4"], ["4", "3", "2", "1"]))
  return matrix
}

function conventionMatrix(
  name: string,
  totals: [string, string, string, string, string, string],
  courses: Array<[string, string, string, string]>
) {
  const matrix: string[][] = [["SEASON 54 * ENDS MAY 23rd"]]
  const marker = Array(RIGHT_START + SIDE_WIDTH).fill("")
  marker[0] = "Division 1"
  marker[RIGHT_START] = "Division 1"
  const titles = Array(RIGHT_START + SIDE_WIDTH).fill("")
  for (const offset of [0, RIGHT_START]) {
    titles[offset + 7] = "MARS GARDENS EASY"
    titles[offset + 11] = "TIKI HARD"
    titles[offset + 15] = "CHERRY BLOSSOM EASY"
  }
  const header = Array(RIGHT_START + SIDE_WIDTH).fill("")
  headers.forEach((value, index) => { header[index] = value; header[RIGHT_START + index] = value })
  const row = Array(RIGHT_START + SIDE_WIDTH).fill("")
  const side = [name, ...totals, ...courses.flat()]
  side.forEach((value, index) => { row[index] = value; row[RIGHT_START + index] = value })
  matrix.push(marker, titles, header, row)
  return matrix
}

function parsedConventionCourse(markers: [string, string, string], holesWon = "0") {
  const preview = previewHistoricalMatchCsv(conventionMatrix("REAL PLAYER", ["1", "1", "0", "0", "3", holesWon], [
    [...markers, holesWon], ["", "", "", "0"], ["", "", "", "0"],
  ]))
  return { preview, course: preview.divisions[0].standings[0].courses[0] }
}

test("collapses duplicated horizontal divisions and keeps right-side final order", () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  assert.equal(preview.audit.seasonsFound, 1)
  assert.equal(preview.audit.populatedDivisions, 5)
  assert.equal(preview.audit.realPlayerRows, 20)
  assert.equal(preview.audit.duplicateHorizontalCopiesCollapsed, 20)
  assert.equal(preview.divisions[0].standings.length, 4)
  assert.equal(preview.divisions[0].standings[0].historicalDisplayName, "D1 PLAYER 4")
  assert.equal(preview.divisions[0].standings[0].finalRank, 1)
})

test("ignores Division 6/7 numeric placeholders and never creates fixtures", () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  assert.equal(preview.audit.authoritativeFixtures, 0)
  assert.equal(preview.audit.structuralHeadersIgnored, 5)
  assert.equal(preview.audit.malformedRows, 0)
  assert.equal(preview.audit.templateRowsIgnored, 8)
  assert.equal(preview.ignoredRows.filter((row) => row.classification === "blank_template_slot").length, 2)
  assert.equal(preview.ignoredRows.filter((row) => row.classification === "template_placeholder").length, 6)
  assert.ok(preview.divisions.every((division) => division.divisionNumber <= 5))
})

test("distinguishes played zero HW from unplayed displayed zero", () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  const playedZero = preview.divisions[0].standings.find((standing) => standing.historicalDisplayName === "D1 PLAYER 4")!
  assert.equal(playedZero.courses[0].played, true)
  assert.equal(playedZero.courses[0].holesWon, 0)

  const zoe = preview.divisions.find((division) => division.divisionNumber === 4)!.standings.find((standing) => standing.historicalDisplayName === "ZOE DARLIN")!
  assert.equal(zoe.finalRank, 4)
  assert.deepEqual(
    zoe.courses.map((course) => ({ played: course.played, outcome: course.outcome, holesWon: course.holesWon })),
    [
      { played: true, outcome: "L", holesWon: 3 },
      { played: false, outcome: null, holesWon: null },
      { played: false, outcome: null, holesWon: null },
    ]
  )
})

test("preserves historical names and leaves canonical identity unresolved", () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  const zoe = preview.divisions.find((division) => division.divisionNumber === 4)!.standings.find((standing) => standing.historicalDisplayName === "ZOE DARLIN")!
  assert.equal(zoe.historicalDisplayName, "ZOE DARLIN")
  assert.equal(zoe.canonicalPlayerId, null)
})

test("source SHA-256 hashes the original bytes deterministically", async () => {
  const original = new TextEncoder().encode("Season 55\r\nZOE DARLIN")
  assert.equal(await sourceSha256(original), await sourceSha256(original))
  assert.notEqual(await sourceSha256(original), await sourceSha256(new TextEncoder().encode("Season 55\nZOE DARLIN")))
})

test("preview fingerprint is stable and ignores UI identity state", async () => {
  const first = previewHistoricalMatchCsv(season55Matrix())
  const second = structuredClone(first)
  second.divisions[0].standings[0].canonicalPlayerId = "11111111-1111-1111-1111-111111111111"
  assert.equal(await previewFingerprint(first), await previewFingerprint(second))
})

test("candidate identity is unresolved by default and explicit approval changes only its standing", async () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  const target = preview.divisions[0].standings[0]
  const key = historicalMatchStandingKey(target.divisionNumber, target.finalRank)
  const hash = await sourceSha256(new TextEncoder().encode("season-55"))
  const fingerprint = await previewFingerprint(preview)
  const unresolved = buildHistoricalMatchCommitPayload(preview, {}, "season55.csv", hash, fingerprint)
  const unresolvedDivisions = unresolved.p_validated_preview.divisions as Array<{ standings: Array<{ canonicalPlayerId: string | null }> }>
  assert.ok(unresolvedDivisions.flatMap((division) => division.standings).every((standing) => standing.canonicalPlayerId === null))

  const approvedId = "11111111-1111-1111-1111-111111111111"
  const approved = buildHistoricalMatchCommitPayload(preview, { [key]: { canonicalPlayerId: approvedId } }, "season55.csv", hash, fingerprint)
  const approvedDivisions = approved.p_validated_preview.divisions as Array<{ standings: Array<{ historicalDisplayName: string; canonicalPlayerId: string | null }> }>
  const approvedStandings = approvedDivisions.flatMap((division) => division.standings)
  assert.equal(approvedStandings.filter((standing) => standing.canonicalPlayerId === approvedId).length, 1)
  assert.equal(approvedStandings.find((standing) => standing.canonicalPlayerId === approvedId)?.historicalDisplayName, target.historicalDisplayName)
})

test("explicit leave unresolved sends null canonicalPlayerId", async () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  const target = preview.divisions[0].standings[0]
  const key = historicalMatchStandingKey(target.divisionNumber, target.finalRank)
  const hash = await sourceSha256(new TextEncoder().encode("season-55"))
  const payload = buildHistoricalMatchCommitPayload(preview, { [key]: { canonicalPlayerId: null } }, "season55.csv", hash, await previewFingerprint(preview))
  const divisions = payload.p_validated_preview.divisions as Array<{ standings: Array<{ canonicalPlayerId: string | null }> }>
  assert.equal(divisions[0].standings[0].canonicalPlayerId, null)
})

test("genuine conflicts block commit while structural/template rows do not", () => {
  const valid = previewHistoricalMatchCsv(season55Matrix())
  assert.deepEqual(historicalMatchCommitBlockers(valid), [])
  const conflicted = structuredClone(valid)
  conflicted.audit.conflicts = 1
  assert.ok(historicalMatchCommitBlockers(conflicted).length > 0)
})

test("Season-55-shaped commit payload contains 20 standings, 60 appearances, and no fixtures", async () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  const hash = await sourceSha256(new TextEncoder().encode("season-55"))
  const payload = buildHistoricalMatchCommitPayload(preview, {}, "season55.csv", hash, await previewFingerprint(preview))
  const body = payload.p_validated_preview as { divisions: Array<{ standings: Array<{ courses: unknown[] }> }>; audit: { authoritativeFixtures: number } }
  const standings = body.divisions.flatMap((division) => division.standings)
  assert.equal(standings.length, 20)
  assert.equal(standings.flatMap((standing) => standing.courses).length, 60)
  assert.equal(preview.audit.courseAppearancesPlayed, 56)
  assert.equal(preview.audit.courseAppearancesUnplayed, 4)
  assert.equal(body.audit.authoritativeFixtures, 0)
})

test("historical review UI uses only the dedicated commit RPC and requires confirmation", () => {
  const component = readFileSync("app/admin/import/csv/components/HistoricalMatchPreview.tsx", "utf8")
  const historicalFiles = [
    component,
    readFileSync("lib/importer/historicalMatchCommit.ts", "utf8"),
    readFileSync("lib/importer/adapters/matchAdapter.ts", "utf8"),
  ].join("\n")

  assert.match(component, /supabase\.rpc\("commit_historical_match_preview", payload\)/)
  assert.match(component, /onClick=\{\(\) => setConfirming\(true\)\}/)
  assert.match(component, /onClick=\{\(\) => void commitHistoricalSeason\(\)\}/)
  assert.doesNotMatch(historicalFiles, /\b(runImport|createImportBatch|saveImportRows)\b/)
  assert.doesNotMatch(historicalFiles, /\.rpc\("(?:create_match_season_with_roster|generate_match_schedule|review_match_schedule|save_match_result|delete_match_result|rebuild_match_standings|generate_match_final_scorecard|approve_match_final_scorecard)"/)
})

test("zero, dash, and blank W/L/D markers are unplayed even when source HW is zero", () => {
  for (const markers of [["0", "0", "0"], ["-", "–", "—"], ["", " ", ""]] as Array<[string, string, string]>) {
    const { preview, course } = parsedConventionCourse(markers)
    assert.deepEqual({ played: course.played, outcome: course.outcome, holesWon: course.holesWon }, { played: false, outcome: null, holesWon: null })
    assert.equal(preview.audit.conflicts, 0)
    assert.equal(course.courseName, "MARS GARDENS EASY")
  }
})

test("one positive W/L/D marker is played and preserves legitimate HW zero", () => {
  const cases: Array<[[string, string, string], "W" | "L" | "D"]> = [
    [["1", "0", "0"], "W"],
    [["0", "1", "0"], "L"],
    [["0", "0", "1"], "D"],
    [["1", "-", "—"], "W"],
  ]
  for (const [markers, outcome] of cases) {
    const { preview, course } = parsedConventionCourse(markers)
    assert.deepEqual({ played: course.played, outcome: course.outcome, holesWon: course.holesWon }, { played: true, outcome, holesWon: 0 })
    assert.equal(preview.audit.conflicts, 0)
  }
})

test("multiple positive W/L/D markers remain a genuine contradiction", () => {
  const { preview, course } = parsedConventionCourse(["1", "1", "0"])
  assert.equal(course.played, false)
  assert.ok(preview.audit.conflicts > 0)
  assert.ok(preview.divisions[0].standings[0].warnings.includes("Contradictory course outcome markers."))
})

test("zero-game and unambiguous dash-total real players remain valid standings", () => {
  const zero = previewHistoricalMatchCsv(conventionMatrix("SPICY", ["0", "0", "0", "0", "0", "0"], [
    ["0", "0", "0", "0"], ["-", "-", "-", "0"], ["", "", "", "0"],
  ]))
  assert.equal(zero.audit.realPlayerRows, 1)
  assert.equal(zero.audit.conflicts, 0)
  assert.deepEqual([zero.divisions[0].standings[0].played, zero.divisions[0].standings[0].points, zero.divisions[0].standings[0].holesWon], [0, 0, 0])

  const dashes = previewHistoricalMatchCsv(conventionMatrix("DASH PLAYER", ["-", "-", "-", "-", "-", "-"], [
    ["-", "-", "-", "0"], ["-", "-", "-", "0"], ["-", "-", "-", "0"],
  ]))
  assert.equal(dashes.audit.realPlayerRows, 1)
  assert.equal(dashes.audit.conflicts, 0)
  assert.equal(dashes.divisions[0].standings[0].played, 0)
})

test("exact BYE is ignored but similar legitimate names remain standings and identity inputs", () => {
  const bye = previewHistoricalMatchCsv(conventionMatrix(" BYE ", ["0", "0", "0", "0", "0", "0"], [
    ["0", "0", "0", "0"], ["0", "0", "0", "0"], ["0", "0", "0", "0"],
  ]))
  assert.equal(bye.audit.realPlayerRows, 0)
  assert.equal(bye.audit.malformedRows, 0)
  assert.equal(bye.audit.templateRowsIgnored, 1)
  assert.equal(bye.ignoredRows[0].reason, "BYE / non-player slot")

  const legitimate = previewHistoricalMatchCsv(conventionMatrix("BYE BYE BIRDIE", ["0", "0", "0", "0", "0", "0"], [
    ["0", "0", "0", "0"], ["0", "0", "0", "0"], ["0", "0", "0", "0"],
  ]))
  const identityNames = legitimate.divisions.flatMap((division) => division.standings.map((standing) => standing.historicalDisplayName))
  assert.deepEqual(identityNames, ["BYE BYE BIRDIE"])
  assert.ok(!bye.divisions.flatMap((division) => division.standings).some((standing) => standing.historicalDisplayName === "BYE"))
})

test("existing-player search finds supported identity evidence but never selects automatically", () => {
  const players: PlayerRecord[] = [{ id: "11111111-1111-1111-1111-111111111111", screen_name: "Warey84", discord_name: "Warey", discord_username: "warey_user", discord_id: "987654321", active: true }]
  const aliases: PlayerIdentityAlias[] = [{ playerId: players[0].id, aliasName: "OLD WAREY", normalizedAlias: "old warey", source: "historical_alias", active: true }]
  assert.equal(searchExistingPlayers(players, aliases, "Warey84")[0]?.id, players[0].id)
  assert.equal(searchExistingPlayers(players, aliases, "OLD WAREY")[0]?.id, players[0].id)
  assert.equal(searchExistingPlayers(players, aliases, "warey_user")[0]?.id, players[0].id)
  assert.equal(searchExistingPlayers(players, aliases, "987654321")[0]?.id, players[0].id)
  assert.deepEqual(searchExistingPlayers(players, aliases, ""), [])
})

test("committed identity RPC arguments link or clear one standing only", () => {
  assert.deepEqual(historicalStandingIdentityRpcArgs("standing-id", "player-id", "Explicit selection"), {
    p_historical_match_standing_id: "standing-id",
    p_approved_player_id: "player-id",
    p_resolution_note: "Explicit selection",
  })
  assert.equal(historicalStandingIdentityRpcArgs("standing-id", null, null).p_approved_player_id, null)
})

test("find/link workflow preserves frozen names and uses no player insert or managed Match mutation", async () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  const target = preview.divisions[0].standings[0]
  const key = historicalMatchStandingKey(target.divisionNumber, target.finalRank)
  const playerId = "11111111-1111-1111-1111-111111111111"
  const payload = buildHistoricalMatchCommitPayload(preview, { [key]: { canonicalPlayerId: playerId } }, "season55.csv", "a".repeat(64), await previewFingerprint(preview))
  const body = payload.p_validated_preview as { divisions: Array<{ standings: Array<{ historicalDisplayName: string; canonicalPlayerId: string | null }> }> }
  const linked = body.divisions.flatMap((division) => division.standings).find((standing) => standing.canonicalPlayerId === playerId)
  assert.equal(linked?.historicalDisplayName, target.historicalDisplayName)

  const files = ["app/admin/import/csv/components/ExistingPlayerPicker.tsx", "app/admin/import/csv/components/CommittedHistoricalMatchIdentities.tsx", "lib/importer/historicalMatchIdentity.ts"].map((file) => readFileSync(file, "utf8")).join("\n")
  assert.match(files, /set_historical_match_standing_identity/)
  assert.doesNotMatch(files, /\.from\("players"\)\.(?:insert|upsert)|create_match_|save_match_|delete_match_|rebuild_match_|generate_match_|approve_match_/)
  assert.doesNotMatch(files, /match_specific_alias|historical_match_alias/)
  assert.match(files, /historical_match_imports/)
  assert.match(files, /canonical_player_id/)
})
