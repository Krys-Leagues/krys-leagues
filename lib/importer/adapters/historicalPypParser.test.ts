import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { HISTORICAL_PYP_PARSER_VERSION, parseHistoricalPypPackage } from "./historicalPypParser.ts"

const root = "docs/historical-sources/pyp/google-sheets-recovery"
const preview = parseHistoricalPypPackage(
  readFileSync(`${root}/historical-pyp-normalized.csv`, "utf8"),
  readFileSync(`${root}/historical-pyp-opponent-evidence.csv`, "utf8"),
  readFileSync(`${root}/historical-pyp-rank-conflicts.csv`, "utf8"),
)

test("PYP package preserves the verified historical scope and counts", () => {
  assert.equal(preview.parserVersion, HISTORICAL_PYP_PARSER_VERSION)
  assert.deepEqual(preview.historicalSeasons, Array.from({ length: 14 }, (_, index) => index + 1))
  assert.deepEqual(preview.currentExcludedSeasons, [15])
  assert.equal(preview.audit.participantSeasonDivisionRows, 265)
  assert.equal(preview.audit.playerGameSlots, 795)
  assert.equal(preview.audit.exactHistoricalNames, 79)
  assert.equal(preview.audit.playedSlots, 560)
  assert.equal(preview.audit.unplayedSlots, 235)
  assert.equal(preview.audit.playedZeroSlots, 2)
  assert.equal(preview.audit.unplayedZeroZeroSlots, 37)
  assert.equal(preview.audit.publishedPlacementConflicts, 184)
  assert.equal(preview.audit.usableOpponentEvidenceRecords, 60)
  assert.equal(preview.audit.unusableOpponentEvidenceRecords, 6)
  assert.equal(preview.audit.namedOpponentPairings, 18)
  assert.equal(preview.audit.rawPairingReviewItems, 557)
  assert.equal(preview.audit.unknownNonBlockingPairingRows, 792)
  assert.equal(preview.audit.duplicateOrMirroredPairingReviews, 0)
  assert.equal(preview.audit.actionablePairingReviews, 0)
  assert.equal(preview.rows.filter((row) => row.sourceEra === "legacy_aggregate").length, 171)
  assert.equal(preview.rows.filter((row) => row.sourceEra === "detailed_holes_won").length, 624)
})

test("right-side formula-sorted placement is used for mirrored conflicts", () => {
  const row = preview.rows.find((candidate) => candidate.seasonNumber === 1 && candidate.division === "1" && candidate.historicalPlayerName === "KRYS" && candidate.gameNumber === 1)
  assert.equal(row?.publishedPlacement, "4th")
  assert.equal(row?.sourceEra, "legacy_aggregate")
})

test("PYP zero states preserve unplayed 0/0 separately from played zeros", () => {
  const unplayed = preview.rows.find((row) => row.seasonNumber === 4 && row.historicalPlayerName === "MULLIGAN" && row.gameNumber === 1)
  const playedYoda = preview.rows.find((row) => row.seasonNumber === 10 && row.historicalPlayerName === "YODA" && row.gameNumber === 3)
  const playedAudrey = preview.rows.find((row) => row.seasonNumber === 11 && row.historicalPlayerName === "AUDREY" && row.gameNumber === 2)
  assert.equal(unplayed?.sourceState, "UNPLAYED")
  assert.equal(unplayed?.course1HolesWon, 0)
  assert.equal(unplayed?.course2HolesWon, 0)
  assert.equal(playedYoda?.sourceState, "PLAYED")
  assert.equal(playedYoda?.course1HolesWon, 0)
  assert.equal(playedYoda?.course2HolesWon, 0)
  assert.equal(playedAudrey?.sourceState, "PLAYED")
})

test("unknown opponent evidence never invents an opponent and is non-blocking", () => {
  const row = preview.rows.find((candidate) => candidate.historicalPlayerName === "KRYS" && candidate.seasonNumber === 1 && candidate.gameNumber === 1)
  assert.equal(row?.opponentHistoricalPlayerName, null)
  assert.equal(row?.pairingState, "UNKNOWN")
  assert.equal(row?.pairingReviewRequired, false)
})

test("only multiple plausible opponents create one actionable pairing review", () => {
  const normalized = [
    "season,division,historical_name,published_placement,game,course_1_holes_won,course_2_holes_won,total_holes_won,w,l,d,points,source_state,source_side,source_row,score_cells,total_cell,wld_cells,source_url",
    "S1,1,PLAYER A,1st,1,2,3,5,1,0,0,3,NUMERIC_PAIR,L,10,J10:K10,I10,L10,https://example.test/S1",
  ].join("\n")
  const evidence = [
    "season,division,game,player_a_exact,player_b_exact,source_range,player_a_cell,player_b_cell,evidence_state,source_url",
    "S1,1,1,PLAYER A,PLAYER B,A10:I10,A10,C10,EXPLICIT VS PAIRING,https://example.test/S1",
    "S1,1,1,PLAYER A,PLAYER C,A11:I11,A11,C11,EXPLICIT VS PAIRING,https://example.test/S1",
  ].join("\n")
  const ranks = "season,division,historical_name,left_placement,right_placement,left_side,left_row,right_side,right_row,left_rank_cell,right_rank_cell,source_url\n"
  const synthetic = parseHistoricalPypPackage(normalized, evidence, ranks)
  assert.equal(synthetic.audit.actionablePairingReviews, 1)
  assert.equal(synthetic.pairingReviews[0]?.pairingState, "AMBIGUOUS")
  assert.deepEqual(synthetic.pairingReviews[0]?.candidateOpponentHistoricalPlayerNames, ["PLAYER B", "PLAYER C"])
})
