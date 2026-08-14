import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { previewHistoricalMatchCsv } from "./matchAdapter.ts"
import {
  buildHistoricalMatchCommitPayload,
  historicalMatchCommitBlockers,
  historicalMatchEffectiveIdentityDecisions,
  historicalMatchIdentityReviewSummary,
  historicalMatchStandingKey,
  previewFingerprint,
  sourceSha256,
} from "../historicalMatchCommit.ts"
import { emptyManualStanding, manualHistoricalMatchPreview, manualHistoricalSourceSha, validateManualHistoricalMatch, type ManualHistoricalMatchDraft } from "../manualHistoricalMatch.ts"
import { historicalStandingIdentityRpcArgs, searchExistingPlayers } from "../historicalMatchIdentity.ts"
import type { PlayerRecord } from "../loadPlayers.ts"
import type { PlayerIdentityAlias } from "../../identity/types.ts"
import { matchPlayers } from "../matchPlayers.ts"
import type { PlayerIdentityLink } from "../loadPlayerIdentityLinks.ts"
import {
  buildVerifiedAliasMemoryRequests,
  rememberVerifiedPlayerAliases,
  type VerifiedAliasMemoryRpcResult,
} from "../rememberVerifiedPlayerAliases.ts"

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

function season54RegressionMatrix() {
  const matrix: string[][] = [["SEASON 54 * ENDS MAY 23rd"]]
  let playerIndex = 0
  for (let division = 1; division <= 5; division += 1) {
    const count = division <= 3 ? 4 : 3
    const names = Array.from({ length: count }, () => `S54 PLAYER ${++playerIndex}`)
    const special = Object.fromEntries(names.map((name, index) => [name, { oneCourse: playerIndex - count + index < 12 }]))
    const [marker, header, ...rows] = divisionRows(division, names, [...names].reverse(), special)
    const titles = Array(RIGHT_START + SIDE_WIDTH).fill("")
    for (const offset of [0, RIGHT_START]) {
      titles[offset + 7] = "MARS GARDENS EASY"
      titles[offset + 11] = "TIKI HARD"
      titles[offset + 15] = "CHERRY BLOSSOM EASY"
    }
    matrix.push(marker, titles, header, ...rows)
  }
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

function csvMatrix(text: string) {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((row) => row.length > 0).map((row) => row.split(","))
}

function season32Preview() {
  return previewHistoricalMatchCsv(csvMatrix(readFileSync("lib/importer/adapters/fixtures/match-play-32.csv", "utf8")))
}

test("collapses duplicated horizontal divisions and keeps right-side final order", () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  assert.equal(preview.layout, "duplicated_final_side")
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
  assert.equal(preview.layout, "duplicated_final_side")
})

test("duplicated Season-54-shaped layout retains approved counts and source courses", () => {
  const preview = previewHistoricalMatchCsv(season54RegressionMatrix())
  assert.equal(preview.layout, "duplicated_final_side")
  assert.deepEqual(preview.courses, ["MARS GARDENS EASY", "TIKI HARD", "CHERRY BLOSSOM EASY"])
  assert.deepEqual({
    divisions: preview.audit.populatedDivisions,
    standings: preview.audit.realPlayerRows,
    appearances: preview.audit.courseAppearancesPlayed + preview.audit.courseAppearancesUnplayed,
    played: preview.audit.courseAppearancesPlayed,
    unplayed: preview.audit.courseAppearancesUnplayed,
    fixtures: preview.audit.authoritativeFixtures,
    conflicts: preview.audit.conflicts,
    malformed: preview.audit.malformedRows,
  }, { divisions: 5, standings: 18, appearances: 54, played: 30, unplayed: 24, fixtures: 0, conflicts: 0, malformed: 0 })
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

test("detects the authoritative Season 32 single-side layout structurally with exact audit counts", () => {
  const preview = season32Preview()
  assert.equal(preview.layout, "single_side")
  assert.equal(preview.seasonNumber, 32)
  assert.equal(preview.historicalLabel, "SEASON 32   *    ENDS DEC 31ST")
  assert.deepEqual(preview.courses, ["ATLANTIS EASY", "LABYRINTH HARD", "JOURNEY EASY"])
  assert.deepEqual({
    populatedDivisions: preview.audit.populatedDivisions,
    standings: preview.audit.realPlayerRows,
    appearances: preview.audit.courseAppearancesPlayed + preview.audit.courseAppearancesUnplayed,
    played: preview.audit.courseAppearancesPlayed,
    unplayed: preview.audit.courseAppearancesUnplayed,
    fixtures: preview.audit.authoritativeFixtures,
    conflicts: preview.audit.conflicts,
    malformed: preview.audit.malformedRows,
  }, { populatedDivisions: 4, standings: 16, appearances: 48, played: 40, unplayed: 8, fixtures: 0, conflicts: 0, malformed: 0 })
})

test("single-side ranks use source row position and ignore global first-column numbering", () => {
  const preview = season32Preview()
  assert.deepEqual(preview.divisions[0].standings.map(({ finalRank, historicalDisplayName }) => [finalRank, historicalDisplayName]), [
    [1, "DERBY_DAZ"], [2, "MULLIGAN"], [3, "PAUL-PPP"], [4, "SHAHOOFNA"],
  ])
  assert.deepEqual(preview.divisions[1].standings.map(({ finalRank, historicalDisplayName }) => [finalRank, historicalDisplayName]), [
    [1, "DAWN_SOPHIA"], [2, "KEIRAROBERT"], [3, "CHIPNPUTT"], [4, "GUYB"],
  ])
})

test("single-side zero-game player remains valid and numeric template divisions stay ignored", () => {
  const preview = season32Preview()
  const guyb = preview.divisions[1].standings[3]
  assert.deepEqual({ name: guyb.historicalDisplayName, rank: guyb.finalRank, played: guyb.played }, { name: "GUYB", rank: 4, played: 0 })
  assert.ok(guyb.courses.every((course) => !course.played && course.outcome === null && course.holesWon === null))
  assert.deepEqual(preview.divisions.map((division) => division.divisionNumber), [1, 2, 3, 4])
  assert.equal(preview.audit.templateRowsIgnored, 12)
  assert.ok(preview.ignoredRows.filter((row) => /^\d+$/.test(row.sourceName)).every((row) => row.classification === "template_placeholder"))
})

test("layout detection does not use season number and incomplete duplication is ambiguous", () => {
  const single = csvMatrix(readFileSync("lib/importer/adapters/fixtures/match-play-32.csv", "utf8"))
  single[1][0] = "SEASON 99 * FORMAT TEST"
  assert.equal(previewHistoricalMatchCsv(single).layout, "single_side")

  const broken = season55Matrix()
  const divisionMarker = broken.find((row) => row[0] === "Division 1")!
  divisionMarker[20] = "Division 1"
  const header = broken[broken.indexOf(divisionMarker) + 1]
  header.splice(20)
  const preview = previewHistoricalMatchCsv(broken)
  assert.equal(preview.layout, "ambiguous")
  assert.ok(preview.audit.conflicts > 0)
  assert.match(preview.warnings.join("\n"), /incomplete or ambiguous/)
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

function identityPlayer(id: string, screenName: string, options: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id,
    screen_name: screenName,
    discord_name: null,
    discord_username: null,
    discord_id: null,
    active: true,
    ...options,
  }
}

test("unique exact screen-name evidence auto-links one canonical identity", () => {
  const player = identityPlayer("11111111-1111-1111-1111-111111111111", "SLAPPY")
  const match = matchPlayers(["SLAPPY"], [player])[0]
  assert.equal(match.autoLinkEligible, true)
  assert.equal(match.autoLinkReason, "exact current screen name")
  assert.equal(match.playerId, player.id)
})

test("exact normalized names resolving to multiple canonical identities do not auto-link", () => {
  const players = [
    identityPlayer("11111111-1111-1111-1111-111111111111", "SAME NAME"),
    identityPlayer("22222222-2222-2222-2222-222222222222", "same_name"),
  ]
  const match = matchPlayers(["SAME-NAME"], players)[0]
  assert.equal(match.confidence, 100)
  assert.equal(match.autoLinkEligible, false)
})

test("duplicate player rows for the same canonical identity remain uniquely auto-linkable", () => {
  const canonical = identityPlayer("11111111-1111-1111-1111-111111111111", "SLAPPY")
  const historical = identityPlayer("22222222-2222-2222-2222-222222222222", "slappy")
  const links: PlayerIdentityLink[] = [{ historicalPlayerId: historical.id, canonicalPlayerId: canonical.id }]
  const match = matchPlayers(["SLAPPY"], [canonical, historical], [], links)[0]
  assert.equal(match.autoLinkEligible, true)
  assert.equal(match.playerId, canonical.id)
})

test("fuzzy candidates below 100 percent never auto-link", () => {
  const player = identityPlayer("11111111-1111-1111-1111-111111111111", "KeiraRobert")
  const match = matchPlayers(["KEIRROBERT"], [player])[0]
  assert.ok(match.confidence <= 99)
  assert.equal(match.autoLinkEligible, false)
})

test("displayed 100 percent Discord-name evidence is not safe auto-link evidence", () => {
  const player = identityPlayer("11111111-1111-1111-1111-111111111111", "SPICY", { discord_name: "DawnSophia" })
  const match = matchPlayers(["DawnSophia"], [player])[0]
  assert.equal(match.confidence, 100)
  assert.equal(match.evidence, "discord_name")
  assert.equal(match.autoLinkEligible, false)
})

test("unique exact Discord ID auto-links", () => {
  const player = identityPlayer("11111111-1111-1111-1111-111111111111", "SPICY", { discord_id: "987654321" })
  const match = matchPlayers(["987654321"], [player])[0]
  assert.equal(match.autoLinkEligible, true)
  assert.equal(match.autoLinkReason, "exact Discord ID")
})

test("only unique verified exact aliases auto-link despite stored normalization differences", () => {
  const player = identityPlayer("11111111-1111-1111-1111-111111111111", "Mully")
  const verified: PlayerIdentityAlias = {
    playerId: player.id,
    aliasName: "MULLIGAN",
    normalizedAlias: "mulligan ",
    source: "historical_alias",
    active: true,
    verified: true,
  }
  const match = matchPlayers(["MULLIGAN"], [player], [verified])[0]
  assert.equal(match.autoLinkEligible, true)
  assert.equal(match.playerId, player.id)
  assert.equal(match.autoLinkReason, "verified historical alias")
  assert.equal(matchPlayers(["MULLIGAN"], [player], [{ ...verified, verified: false }])[0].autoLinkEligible, false)
})

test("verified aliases on merged UUIDs resolve to the current canonical player", () => {
  const canonical = identityPlayer("11111111-1111-1111-1111-111111111111", "GUYB22")
  const old = identityPlayer("22222222-2222-2222-2222-222222222222", "OLD GUYB", { active: false })
  const alias: PlayerIdentityAlias = {
    playerId: old.id,
    aliasName: "GUYB",
    normalizedAlias: "guyb",
    source: "historical_alias",
    active: true,
    verified: true,
  }
  const links: PlayerIdentityLink[] = [{ historicalPlayerId: old.id, canonicalPlayerId: canonical.id }]
  const match = matchPlayers(["GUYB"], [canonical, old], [alias], links)[0]
  assert.equal(match.autoLinkEligible, true)
  assert.equal(match.playerId, canonical.id)
  assert.equal(match.matchedName, canonical.screen_name)
  assert.equal(match.autoLinkReason, "verified historical alias via canonical identity link")
})

test("multiple verified aliases are safe only when they resolve to one canonical UUID", () => {
  const canonical = identityPlayer("11111111-1111-1111-1111-111111111111", "DawnSophia")
  const oldOne = identityPlayer("22222222-2222-2222-2222-222222222222", "SPICY OLD", { active: false })
  const oldTwo = identityPlayer("33333333-3333-3333-3333-333333333333", "DAWN OLD", { active: false })
  const aliases: PlayerIdentityAlias[] = [oldOne, oldTwo].map((player) => ({
    playerId: player.id,
    aliasName: "DAWN_SOPHIA",
    normalizedAlias: "dawn_sophia",
    source: "historical_alias",
    active: true,
    verified: true,
  }))
  const sameCanonicalLinks: PlayerIdentityLink[] = [oldOne, oldTwo].map((player) => ({
    historicalPlayerId: player.id,
    canonicalPlayerId: canonical.id,
  }))
  assert.equal(matchPlayers(["DAWN_SOPHIA"], [canonical, oldOne, oldTwo], aliases, sameCanonicalLinks)[0].autoLinkEligible, true)

  const otherCanonical = identityPlayer("44444444-4444-4444-4444-444444444444", "OTHER")
  const ambiguousLinks = [sameCanonicalLinks[0], { historicalPlayerId: oldTwo.id, canonicalPlayerId: otherCanonical.id }]
  assert.equal(matchPlayers(["DAWN_SOPHIA"], [canonical, otherCanonical, oldOne, oldTwo], aliases, ambiguousLinks)[0].autoLinkEligible, false)
})

test("verified alias evidence wins over weaker fuzzy and Discord-display candidates", () => {
  const canonical = identityPlayer("11111111-1111-1111-1111-111111111111", "KeiraRobert")
  const weaker = identityPlayer("22222222-2222-2222-2222-222222222222", "UNRELATED", { discord_name: "KEIRROBERT" })
  const alias: PlayerIdentityAlias = {
    playerId: canonical.id,
    aliasName: "KEIRROBERT",
    normalizedAlias: "keir robert",
    source: "historical_alias",
    active: true,
    verified: true,
  }
  const match = matchPlayers(["KEIRROBERT"], [canonical, weaker], [alias])[0]
  assert.equal(match.autoLinkEligible, true)
  assert.equal(match.playerId, canonical.id)
  assert.equal(match.evidence, "historical_alias")
})

test("auto-link decisions preserve frozen names, are overridable, and do not block unresolved rows", async () => {
  const preview = previewHistoricalMatchCsv(season55Matrix())
  const standing = preview.divisions[0].standings[0]
  const key = historicalMatchStandingKey(standing.divisionNumber, standing.finalRank)
  const player = identityPlayer("11111111-1111-1111-1111-111111111111", standing.historicalDisplayName)
  const candidates = new Map([[standing.historicalDisplayName, matchPlayers([standing.historicalDisplayName], [player])[0]]])
  const automatic = historicalMatchEffectiveIdentityDecisions(preview, candidates, {})
  assert.equal(automatic[key].canonicalPlayerId, player.id)

  const overridden = historicalMatchEffectiveIdentityDecisions(preview, candidates, {
    [key]: { canonicalPlayerId: null, selectionSource: "unresolved" },
  })
  assert.equal(overridden[key].canonicalPlayerId, null)
  const summary = historicalMatchIdentityReviewSummary(preview, candidates, {
    [key]: { canonicalPlayerId: null, selectionSource: "unresolved" },
  })
  assert.equal(summary.unresolved, 1)
  assert.ok(summary.needsReview > 0)
  assert.deepEqual(historicalMatchCommitBlockers(preview), [])

  const payload = buildHistoricalMatchCommitPayload(
    preview,
    automatic,
    "season55.csv",
    "a".repeat(64),
    await previewFingerprint(preview)
  )
  const divisions = payload.p_validated_preview.divisions as Array<{ standings: Array<{ historicalDisplayName: string }> }>
  assert.equal(divisions[0].standings[0].historicalDisplayName, standing.historicalDisplayName)
})

test("auto-link preview logic performs no database mutation or player creation", () => {
  const files = [
    "lib/identity/resolveIdentity.ts",
    "lib/importer/matchPlayers.ts",
    "lib/importer/historicalMatchCommit.ts",
    "lib/importer/loadPlayerIdentityLinks.ts",
    "app/admin/import/csv/components/HistoricalMatchPreview.tsx",
  ].map((file) => readFileSync(file, "utf8")).join("\n")
  assert.doesNotMatch(files, /\.from\("players"\)\.(?:insert|upsert|update|delete)/)
  assert.doesNotMatch(files, /\.rpc\("set_historical_match_standing_identity"/)
  assert.doesNotMatch(files, /\.rpc\("(?:create_match_|save_match_|delete_match_|rebuild_match_|generate_match_|approve_match_)/)
})

test("only final explicit manual old-name decisions create frozen alias-memory requests", () => {
  const selectedId = "11111111-1111-1111-1111-111111111111"
  const requests = buildVerifiedAliasMemoryRequests([
    { historicalDisplayName: " MULLIGAN ", playerId: selectedId, playerScreenName: "Mully", explicitlyApproved: true },
    { historicalDisplayName: "AUTO OLD NAME", playerId: selectedId, playerScreenName: "Mully", explicitlyApproved: false },
    { historicalDisplayName: "UNRESOLVED", playerId: null, playerScreenName: null, explicitlyApproved: true },
    { historicalDisplayName: "Mully", playerId: selectedId, playerScreenName: "MULLY", explicitlyApproved: true },
  ])
  assert.deepEqual(requests, [{ p_player_id: selectedId, p_alias: "MULLIGAN" }])
})

test("alias memory treats created and same-identity idempotent results as success", async () => {
  const requests = [
    { p_player_id: "11111111-1111-1111-1111-111111111111", p_alias: "MULLIGAN" },
    { p_player_id: "22222222-2222-2222-2222-222222222222", p_alias: "OLD NAME" },
  ]
  const results: VerifiedAliasMemoryRpcResult[] = requests.map((request, index) => ({
    canonical_player_id: request.p_player_id,
    alias: request.p_alias,
    normalized_alias: request.p_alias.toLowerCase(),
    verified: true,
    idempotent: index === 1,
    status: index === 1 ? "already_verified_same_identity" : "created",
  }))
  let index = 0
  const summary = await rememberVerifiedPlayerAliases(requests, async () => ({ data: results[index++], error: null }))
  assert.deepEqual(summary, { created: 1, alreadyKnown: 1, conflicts: [], failures: [] })
})

test("alias-memory conflicts and failures remain separate and retain their frozen names", async () => {
  const conflict = { p_player_id: "11111111-1111-1111-1111-111111111111", p_alias: "CONFLICT NAME" }
  const failure = { p_player_id: "22222222-2222-2222-2222-222222222222", p_alias: "FAILED NAME" }
  let calls = 0
  const summary = await rememberVerifiedPlayerAliases([conflict, failure], async () => {
    calls += 1
    return calls === 1
      ? { data: null, error: { code: "23505", message: "Alias belongs to a different canonical player" } }
      : { data: null, error: { message: "network unavailable" } }
  })
  assert.equal(summary.conflicts[0].request.p_alias, "CONFLICT NAME")
  assert.equal(summary.failures[0].request.p_alias, "FAILED NAME")
})

test("historical commit succeeds before explicit alias memory and retry does not recommit", () => {
  const component = readFileSync("app/admin/import/csv/components/HistoricalMatchPreview.tsx", "utf8")
  const commitCall = component.indexOf('supabase.rpc("commit_historical_match_preview", payload)')
  const commitSuccess = component.indexOf("setCommitResult(result as CommitResult)")
  const memoryCall = component.indexOf('supabase.rpc("remember_verified_player_alias", request)')
  const retryFunction = component.slice(component.indexOf("async function retryIdentityMemoryFailures"), component.indexOf("return ("))
  assert.ok(commitCall >= 0 && commitCall < commitSuccess && commitSuccess < memoryCall)
  assert.doesNotMatch(retryFunction, /commit_historical_match_preview/)
  assert.match(component, /explicitlyApproved: decision\?\.selectionSource === "manual"/)
  assert.match(readFileSync("lib/importer/rememberVerifiedPlayerAliases.ts", "utf8"), /p_alias: alias/)
})

test("manual identity UI is local until commit and adds no player or managed Match mutation", () => {
  const component = readFileSync("app/admin/import/csv/components/HistoricalMatchPreview.tsx", "utf8")
  const helper = readFileSync("lib/importer/rememberVerifiedPlayerAliases.ts", "utf8")
  assert.match(component, /Approve &amp; remember identity/)
  assert.match(component, /Link & remember identity/)
  assert.match(component, /saved only after|remembered globally after the historical season commits successfully/i)
  assert.doesNotMatch(component + helper, /\.from\(["']players["']\)\.(?:insert|upsert|update|delete)/)
  assert.doesNotMatch(component + helper, /\.rpc\("(?:create_match_|save_match_|delete_match_|rebuild_match_|generate_match_|approve_match_)/)
})

test("a remembered verified alias is authoritative evidence for the shared resolver", () => {
  const player = identityPlayer("11111111-1111-1111-1111-111111111111", "Mully")
  const remembered: PlayerIdentityAlias = {
    playerId: player.id,
    aliasName: "MULLIGAN",
    normalizedAlias: "mulligan",
    source: "historical_alias",
    active: true,
    verified: true,
  }
  const match = matchPlayers(["MULLIGAN"], [player], [remembered])[0]
  assert.equal(match.autoLinkEligible, true)
  assert.equal(match.playerId, player.id)
  assert.equal(match.autoLinkReason, "verified historical alias")
})

function manualDraft(evidenceLevel: "standings_only" | "aggregate_course" = "standings_only"): ManualHistoricalMatchDraft {
  return { seasonNumber: 54, historicalLabel: "SEASON 54", year: null, evidenceLevel, sourceReference: "paper binder", courses: [], divisions: [{ id: "d1", divisionNumber: 1, standings: [{ ...emptyManualStanding("s1"), historicalDisplayName: "ZOE DARLIN" }] }] }
}

test("manual standings-only accepts a zero-game historical player", () => assert.deepEqual(validateManualHistoricalMatch(manualDraft()), []))
test("manual validation requires season metadata", () => {
  const draft = manualDraft(); draft.seasonNumber = 0; draft.historicalLabel = ""
  assert.equal(validateManualHistoricalMatch(draft).length, 2)
})
test("manual validation enforces P equals W plus L plus D", () => {
  const draft = manualDraft(); draft.divisions[0].standings[0].played = 2
  assert.match(validateManualHistoricalMatch(draft).join(" "), /P must equal/)
})
test("manual validation enforces three points per win plus draws", () => {
  const draft = manualDraft(); Object.assign(draft.divisions[0].standings[0], { played: 1, wins: 1, points: 2 })
  assert.match(validateManualHistoricalMatch(draft).join(" "), /PTS must equal/)
})
test("manual aggregate mode requires courses", () => assert.match(validateManualHistoricalMatch(manualDraft("aggregate_course")).join(" "), /requires at least one course/))
test("manual aggregate played HW zero remains valid", () => {
  const draft = manualDraft("aggregate_course"); draft.courses = [{ id: "c1", name: "BLOKHAVEN EASY" }]
  Object.assign(draft.divisions[0].standings[0], { played: 1, losses: 1, appearances: { c1: { played: true, outcome: "L", holesWon: 0 } } })
  assert.deepEqual(validateManualHistoricalMatch(draft), [])
  assert.equal(manualHistoricalMatchPreview(draft).divisions[0].standings[0].courses[0].played, true)
})
test("manual aggregate unplayed rows store null result fields", () => {
  const draft = manualDraft("aggregate_course"); draft.courses = [{ id: "c1", name: "HOLLYWOOD EASY" }]
  const course = manualHistoricalMatchPreview(draft).divisions[0].standings[0].courses[0]
  assert.deepEqual([course.played, course.outcome, course.holesWon], [false, null, null])
})
test("manual aggregate cross-checks complete course totals", () => {
  const draft = manualDraft("aggregate_course"); draft.courses = [{ id: "c1", name: "TIKI HARD" }]
  draft.divisions[0].standings[0].appearances.c1 = { played: true, outcome: "W", holesWon: 2 }
  assert.match(validateManualHistoricalMatch(draft).join(" "), /course results disagree/)
})
test("manual preview creates no fixtures", () => assert.equal(manualHistoricalMatchPreview(manualDraft()).audit.authoritativeFixtures, 0))
test("manual source SHA is deterministic and includes source reference", async () => {
  const draft = manualDraft(); const first = await manualHistoricalSourceSha(draft); const second = await manualHistoricalSourceSha(draft)
  assert.equal(first, second); draft.sourceReference = "different note"; assert.notEqual(await manualHistoricalSourceSha(draft), first)
})
test("manual fingerprint ignores identity and source-note UI state", async () => {
  const draft = manualDraft(); const first = await previewFingerprint(manualHistoricalMatchPreview(draft)); draft.sourceReference = "other"
  assert.equal(await previewFingerprint(manualHistoricalMatchPreview(draft)), first)
})
test("manual commit payload preserves evidence and provenance", async () => {
  const draft = manualDraft(); const preview = manualHistoricalMatchPreview(draft)
  const payload = buildHistoricalMatchCommitPayload(preview, {}, "manual-match-season-54", await manualHistoricalSourceSha(draft), await previewFingerprint(preview), draft.sourceReference)
  assert.equal(payload.p_evidence_level, "standings_only"); assert.equal(payload.p_validated_preview.entryMethod, "manual"); assert.equal(payload.p_validated_preview.sourceReference, "paper binder")
})
test("manual UI contains deliberate review, identity, and commit safeguards", () => {
  const component = readFileSync("app/admin/import/csv/components/ManualHistoricalMatchEntry.tsx", "utf8")
  assert.match(component, /Review Manual Historical Match Season/); assert.match(component, /HistoricalMatchPreview/)
  assert.doesNotMatch(component, /\.from\(["']players["']\)\.(?:insert|upsert)/)
})
