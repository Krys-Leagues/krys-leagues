import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import Papa from "papaparse"
import { buildKwtNetResults } from "../lib/kwtNetLeaderboard.ts"
import { pointsForVerifiedRank, standardCompetitionRanks } from "../lib/kwtNetCompetition.ts"
import { adaptProductionOperationalRows, selectFrozenPublishedHandicaps } from "../lib/kwtNetProductionAdapter.ts"
import { parseKwtSeason15Week01 } from "../lib/kwtSeason15Scorecards.ts"

const csvPath = process.env.KRYS_KWT_W01_CSV ?? "C:\\Users\\kryst\\Downloads\\kwt15w01_ful_results (3).csv"
const sourceBytes = fs.readFileSync(csvPath)
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex").toUpperCase()
const expectedSha256 = "8C9A20EFB45B6399AD4F7DBCFB3633B8C63A6F9F5C6A7A5385069B1A8A0D8D7D"
assert.equal(sourceSha256, expectedSha256, "the supplied Week 01 source bytes changed")

const parsed = Papa.parse(fs.readFileSync(csvPath, "utf8"), { header: true, skipEmptyLines: true })
assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors))
const review = parseKwtSeason15Week01(parsed.data, "kwt15w01_ful_results (3).csv")
assert.equal(review.errors.length, 0, review.errors.join("\n"))
assert.equal(review.rows.length, 14)

const identityBySourceName = {
  Zanetti: ["2e4ce1d8-afd6-44a2-9560-f85c16f23747", "ZANETTI"],
  Jesunet: ["a0eaf23c-0784-4eb9-ab1d-530b077121a9", "JESUNET"],
  bigja33: ["69c0daa5-70b8-481b-94e5-a9d033bc75fb", "BIGJA"],
  Chipnputt: ["d38c0220-8a80-45a6-86e8-d495f523d5ab", "CHIPNPUTT"],
  "Laurent��": ["fbd60e4a-9d17-4556-9062-dc005a0c5723", "LAURENT"],
  "Maxfrom-fr": ["6918df0a-cc2b-495a-8c09-b8be600ed0bc", "MAXFROM-FR"],
  roknhorsebrat: ["6d74f565-dc1d-41e3-81e5-fd7e6b38e28d", "ROKNHORSEBRAT"],
  lynniebodd: ["b98df6d3-7e16-450f-bd17-f39d9903d1e1", "lynniebodd"],
  Alyssa38: ["c60ed0d8-1f05-4675-b635-342707607c18", "ALYSSA38"],
  dandnt65: ["bed410dd-2b89-4db3-8fe4-8226c21c3f5f", "Dandnt65"],
  NuttyGrandpa: ["ebcdd3f4-1a69-40f6-819e-899fbe9998d7", "NUTTYGRANDPA"],
  KillERBee: ["e2741a95-19e9-440c-a605-f1c1498aa5c1", "KILLERBEE"],
  Ultrafox_Lynne: ["e249815d-ac23-4ef7-9c20-7ed9ba0c57c4", "ULTRAFOX_LYNNE"],
  Sj_76: ["ec943c83-bd7f-46b9-a9a9-8d2d6a3a71b0", "Sj_76"],
}
const indexByPlayer = {
  "2e4ce1d8-afd6-44a2-9560-f85c16f23747": [0.4, "OFFICIAL_ELIGIBLE"],
  "a0eaf23c-0784-4eb9-ab1d-530b077121a9": [3.12, "PROVISIONAL"],
  "69c0daa5-70b8-481b-94e5-a9d033bc75fb": [2.87, "PROVISIONAL"],
  "d38c0220-8a80-45a6-86e8-d495f523d5ab": [6.74, "OFFICIAL_ELIGIBLE"],
  "fbd60e4a-9d17-4556-9062-dc005a0c5723": [4.91, "OFFICIAL_ELIGIBLE"],
  "6918df0a-cc2b-495a-8c09-b8be600ed0bc": [6.28, "PROVISIONAL"],
  "ebcdd3f4-1a69-40f6-819e-899fbe9998d7": [9.69, "OFFICIAL_ELIGIBLE"],
  "e2741a95-19e9-440c-a605-f1c1498aa5c1": [17.28, "OFFICIAL_ELIGIBLE"],
  "e249815d-ac23-4ef7-9c20-7ed9ba0c57c4": [15.97, "OFFICIAL_ELIGIBLE"],
  "ec943c83-bd7f-46b9-a9a9-8d2d6a3a71b0": [18.64, "OFFICIAL_ELIGIBLE"],
  "6d74f565-dc1d-41e3-81e5-fd7e6b38e28d": [11.31, "OFFICIAL_ELIGIBLE"],
  "b98df6d3-7e16-450f-bd17-f39d9903d1e1": [9.43, "OFFICIAL_ELIGIBLE"],
  "c60ed0d8-1f05-4675-b635-342707607c18": [9.11, "OFFICIAL_ELIGIBLE"],
  "bed410dd-2b89-4db3-8fe4-8226c21c3f5f": [13.19, "OFFICIAL_ELIGIBLE"],
}
const divisionName = { ELITE: "Elite", PRO: "Pro", "SEMI-PRO": "Semi Pro", AMATEUR: "Amateur" }
const divisionPlace = { Zanetti: 1, Jesunet: 1, bigja33: 2, Chipnputt: 2, "Laurent��": 2, "Maxfrom-fr": 2, roknhorsebrat: 5, NuttyGrandpa: 1, lynniebodd: 2, Alyssa38: 3, Sj_76: 4, KillERBee: 2, Ultrafox_Lynne: 2, dandnt65: 1 }
const setup = { eventIdentifier: "KWTS15W01", season: 15, week: 1, courseName: "Raptor Cliffs", easyCourseCode: "RCE", hardCourseCode: "RCH", easySlope: 9.053, hardSlope: 12.197, freezeCutoff: "2026-10-23T04:00:00Z" }
const productionRows = review.rows.map((row) => {
  const identity = identityBySourceName[row.playerName]
  assert.ok(identity, `missing verified identity for ${row.playerName}`)
  const handicap = indexByPlayer[identity[0]]
  assert.ok(handicap, `missing frozen Handicap for ${identity[1]}`)
  return {
    season_number: 15,
    week_number: 1,
    player_id: identity[0],
    division: divisionName[row.grossDivision ?? ""],
    easy_course_code: row.easyCode,
    hard_course_code: row.hardCode,
    easy_score: row.easyScore,
    hard_score: row.hardScore,
    total_score: row.totalScore,
    overall_placement: row.position,
    points: row.points,
    status: "official",
    source_type: "existing_kwt_website",
    source_reference: `KWTS15W01|${sourceSha256}|row=${row.sourceRow}`,
    division_placement: divisionPlace[row.playerName],
  }
})
const players = review.rows.map((row) => ({ id: identityBySourceName[row.playerName][0], screen_name: identityBySourceName[row.playerName][1] }))
const handicaps = Object.entries(indexByPlayer).map(([canonical_player_id, [resulting_index, handicap_status]]) => ({ canonical_player_id, resulting_index, handicap_status, effective_from: "2026-10-22", created_at: "2026-10-23T15:09:39.891252Z" }))
const adapted = adaptProductionOperationalRows(productionRows, players, selectFrozenPublishedHandicaps(handicaps, setup.freezeCutoff), setup)
assert.equal(adapted.rejected.length, 0, adapted.rejected.join("\n"))
assert.equal(adapted.inputs.length, 14)
const netRows = buildKwtNetResults({ eventIdentifier: setup.eventIdentifier, courseName: setup.courseName, easySlope: setup.easySlope, hardSlope: setup.hardSlope }, adapted.inputs)
assert.equal(netRows.length, 14)
assert.equal(netRows.filter((row) => row.combinedNet !== null).length, 14)
const completed = netRows.filter((row) => row.combinedNet !== null)
const ranks = standardCompetitionRanks(completed.map((row) => row.combinedNet))
const rankByPlayer = new Map(completed.map((row, index) => [row.playerId, ranks[index]]))

console.log(JSON.stringify({
  source: { path: csvPath, sha256: sourceSha256, rows: review.rows.length, parserErrors: review.errors.length, duplicateRows: review.duplicateRows },
  identities: review.rows.map((row) => ({ sourceRow: row.sourceRow, sourceName: row.playerName, canonicalPlayerId: identityBySourceName[row.playerName][0], canonicalName: identityBySourceName[row.playerName][1], method: row.playerName === "Laurent��" ? "verified Laurent alias plus invalid trailing source bytes preserved" : "exact verified screen name or verified historical alias" })),
  ratings: { easy: { snapshotId: "b470397b-b07a-5bb4-8575-b83804d7df34", rating: -22.211, slope: 9.053 }, hard: { snapshotId: "0f19e813-655f-521f-bf29-1397ec14ccb1", rating: -13.895, slope: 12.197 } },
  freezeCutoff: setup.freezeCutoff,
  netResults: netRows.map((row) => ({ playerId: row.playerId, screenName: row.screenName, netRank: rankByPlayer.get(row.playerId) ?? null, points: row.combinedNet === null ? null : pointsForVerifiedRank(rankByPlayer.get(row.playerId)), easyGross: row.easyGross, hardGross: row.hardGross, easyStrokes: row.easyStrokes?.display, hardStrokes: row.hardStrokes?.display, easyNet: row.easyNet, hardNet: row.hardNet, combinedNet: row.combinedNet, handicapIndex: row.handicapIndex, handicapStatus: row.handicapStatus })),
}, null, 2))
