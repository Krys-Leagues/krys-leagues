import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { test } from "node:test"
import assert from "node:assert/strict"

import {
  HISTORICAL_PRO_PARSER_VERSION,
  historicalProIdentityBlockers,
  historicalProReadyRows,
  parseHistoricalProRecovery,
} from "./historicalProParser.ts"

const root = "docs/historical-sources/pro/google-sheets-recovery"

function evidence() {
  const scoreCsv = readFileSync(`${root}/historical-pro-scorecards.csv`, "utf8")
  const manifest = JSON.parse(readFileSync(`${root}/source-manifest.json`, "utf8")) as { artifacts: Array<{ path: string; sha256: string }> }
  const expected = manifest.artifacts.find((artifact) => artifact.path === "historical-pro-scorecards.csv")?.sha256 ?? null
  const actual = createHash("sha256").update(scoreCsv, "utf8").digest("hex")
  return parseHistoricalProRecovery(
    scoreCsv,
    readFileSync(`${root}/historical-pro-current-incomplete.csv`, "utf8"),
    readFileSync(`${root}/historical-pro-conflicts.csv`, "utf8"),
    readFileSync(`${root}/historical-pro-missing-periods.csv`, "utf8"),
    actual,
    expected,
    readFileSync(`${root}/historical-pro-season-pairings.csv`, "utf8"),
  )
}

test("Historical Pro recovery preserves verified audit counts and source SHA", () => {
  const preview = evidence()
  assert.equal(preview.parserVersion, HISTORICAL_PRO_PARSER_VERSION)
  assert.equal(preview.sourceShaMatches, true)
  assert.equal(preview.audit.completedSeasons, 12)
  assert.equal(preview.audit.availableWeeklyPeriods, 132)
  assert.equal(preview.audit.missingWeeklyPeriods, 5)
  assert.equal(preview.audit.playerPeriodRows, 1732)
  assert.equal(preview.audit.normalizedPlayerPeriodRows, 1662)
  assert.equal(preview.audit.sourceEasyHardScoreObservations, 8522)
  assert.equal(preview.audit.exactHistoricalNames, 121)
  assert.equal(preview.audit.blockedConflictRows, 68)
  assert.deepEqual(preview.missingPeriods.map((period) => period.periodNumber), [43, 81, 94, 100, 108])
  assert.equal(preview.currentPeriods[0].periodLabel, "S13")
  assert.match(preview.currentPeriods[0].status, /CURRENT \/ INCOMPLETE/)
})

test("Season identity scope includes only completed Seasons 1-12 and preserves pairing evidence", () => {
  const preview = evidence()
  assert.equal(preview.seasonRows.every((row) => row.periodType === "season" && row.periodNumber >= 1 && row.periodNumber <= 12), true)
  assert.equal(preview.seasonPairings.length, 342)
  assert.equal(preview.seasonHistoricalNames.length, 34)
  assert.equal(preview.pairingSummary.sourceColorConfirmed, 327)
  assert.equal(preview.pairingSummary.played, 240)
  assert.equal(preview.pairingSummary.scheduledUnplayed, 86)
  assert.equal(preview.pairingSummary.proxyRounds, 1)
  assert.equal(preview.pairingSummary.partialScoreReview, 0)
  assert.equal(preview.pairingSummary.manualReview, 15)
  assert.equal(preview.pairingSummary.evidenceArtifactPresent, true)
  assert.equal(preview.seasonHistoricalNames.includes("SARAHLYNN727"), true)
  assert.equal(preview.seasonHistoricalNames.includes("BYE"), false)
})

test("blank or dash-only paired score cells are scheduled, while a one-sided complete score is a proxy round", () => {
  const preview = evidence()
  const scheduled = preview.seasonPairings.filter((pairing) => pairing.pairingState === "SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED")
  const proxy = preview.seasonPairings.filter((pairing) => pairing.gameState === "PROXY ROUND — OPPONENT DID NOT PLAY")
  assert.equal(scheduled.length, 86)
  assert.equal(proxy.length, 1)
  assert.equal(proxy[0].seasonNumber, 6)
  assert.equal(proxy[0].proxyWinnerExactName, "WAREY84")
  assert.equal(proxy[0].proxyLoserExactName, "SARAHLYNN727")
  assert.equal(proxy[0].pairingState, "PROXY ROUND — OPPONENT DID NOT PLAY")
  assert.match(proxy[0].playerAScoreEntryText + proxy[0].playerBScoreEntryText, /Easy=-14; Hard=-3/)
})

test("source-proven proxy classification overrides a stale partial pairing label", () => {
  const preview = evidence()
  const proxy = preview.seasonPairings.find((pairing) => pairing.seasonNumber === 6 && pairing.playerAExactName === "WAREY84" && pairing.playerBExactName === "SARAHLYNN727")
  assert.ok(proxy)
  assert.equal(proxy.gameState, "PROXY ROUND — OPPONENT DID NOT PLAY")
  assert.equal(proxy.pairingState, "PROXY ROUND — OPPONENT DID NOT PLAY")
  assert.equal(proxy.proxyWinnerExactName, "WAREY84")
  assert.equal(proxy.proxyLoserExactName, "SARAHLYNN727")
  assert.equal(proxy.playerAScoreEntryText, "Easy=-14; Hard=-3")
  assert.equal(proxy.playerBScoreEntryText, "Easy=; Hard=")
  assert.equal(preview.pairingSummary.partialScoreReview, 0)
})

test("numeric zero remains score evidence rather than an unplayed marker", () => {
  const preview = parseHistoricalProRecovery(
    "period_type,period_number,period_label,division,historical_player_name,game_number,map_course_code,easy_score,hard_score,combined_total,p,w,l,d,pts,strokes,published_rank,source_era,source_workbook,source_tab,source_page,source_row,source_cells,source_url,raw_source_data,review_status\n",
    "period_type,period_number,period_label,status,source_workbook,source_tab,notes\n",
    "conflict_key,period,division,historical_player_name,game_number,review_status\n",
    "period_type,period_number,period_label,status,notes\n",
    null,
    null,
    [
      "period_type,season_number,division,game_number,player_a_exact_name,player_b_exact_name,player_a_source_row,player_b_source_row,player_a_source_cells,player_b_source_cells,player_a_score_entry_text,player_b_score_entry_text,effective_text_color,user_entered_text_color,pairing_state,evidence_type,source_workbook,source_tab,source_tab_id,source_range,source_url,provenance",
      "season,1,Division 1,1,ALPHA,BETA,4,5,I4:J4,I5:J5,Easy=0; Hard=0,Easy=0; Hard=0,{},{},PARTIAL — NEEDS REVIEW,SOURCE COLOR CONFIRMED,BOOK,TAB,1,B4:Z4; B5:Z5,https://example.test,source",
    ].join("\n"),
  )
  assert.equal(preview.pairingSummary.played, 1)
  assert.equal(preview.pairingSummary.proxyRounds, 0)
  assert.equal(preview.pairingSummary.partialScoreReview, 0)
})

test("Historical Pro score text keeps signs and blocks incomplete scorecards", () => {
  const preview = parseHistoricalProRecovery(
    [
      "period_type,period_number,period_label,division,historical_player_name,game_number,map_course_code,easy_score,hard_score,combined_total,p,w,l,d,pts,strokes,published_rank,source_era,source_workbook,source_tab,source_page,source_row,source_cells,source_url,raw_source_data,review_status",
      'week,1,W1,"Division 1",ALPHA,1,1,-19,+2,-17,1,1,0,0,3,-17,1st,"Weeks 1-5",BOOK,TAB,4,4,B4:W4,https://example.test,raw,READY',
      'season,13,S13,"Division 1",CURRENT,1,1,-10,-12,-22,1,1,0,0,3,-22,1st,"current",BOOK,TAB,4,4,B4:W4,https://example.test,raw,READY',
      'week,107,W107,"Division 1",CONFLICT,1,1,-10,-12,-22,1,1,0,0,3,-22,1st,"conflict",BOOK,TAB,4,4,B4:W4,https://example.test,raw,SOURCE CONFLICT',
    ].join("\n"),
    "period_type,period_number,period_label,status,source_workbooks_checked,notes\n",
    "conflict_key,period,division,historical_player_name,game_number,review_status\n",
    "period_type,period_number,period_label,status,notes\n",
  )
  assert.equal(preview.rows[0].easyScore, "-19")
  assert.equal(preview.rows[0].hardScore, "+2")
  assert.equal(preview.rows[1].importable, false)
  assert.equal(preview.rows[2].importable, false)
})

test("only resolved identities on importable rows are ready", () => {
  const preview = evidence()
  const names = [...new Set(preview.rows.filter((row) => row.importable).map((row) => row.historicalPlayerName))]
  const reviews = names.map((historicalPlayerName, index) => ({
    historicalPlayerName,
    status: index === 0 ? "unresolved" as const : "resolved" as const,
    canonicalPlayerId: index === 0 ? null : `player-${index}`,
    canonicalPlayerName: index === 0 ? null : historicalPlayerName,
    candidatePlayerId: null,
    candidatePlayerName: null,
    matchedSource: index === 0 ? "none" : "exact",
    confidence: index === 0 ? 0 : 100,
  }))
  assert.equal(historicalProIdentityBlockers(preview, reviews).length, 1)
  assert.ok(historicalProReadyRows(preview, reviews).length < preview.audit.importableRows)
})

test("SQL foundation is transactional, RLS protected, idempotent, and cannot import current/conflicted periods", () => {
  const sql = readFileSync("historical_pro_import_foundation.sql", "utf8")
  assert.match(sql, /^begin;/)
  assert.match(sql, /commit;\s*$/)
  assert.match(sql, /enable row level security/g)
  assert.match(sql, /source_fingerprint text not null unique/)
  assert.match(sql, /source_sha_key unique/)
  assert.match(sql, /not \(period_type = 'season' and period_number = 13\)/)
  assert.match(sql, /not \(period_type = 'week' and period_number = 107\)/)
  assert.match(sql, /public\.resolve_canonical_player_id/)
  assert.match(sql, /Historical Pro source fingerprint/) 
  assert.match(sql, /blockedConflictCount/)
  assert.match(sql, /pairingEvidenceType/)
})
