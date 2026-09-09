import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { buildStrictKwtCombinedPair, isStrictKwtCombinedRow } from "../lib/kwtCombinedPairing.ts"

const base = {
  playerId: "player-gomarino13",
  baseMap: "Temple at Zerzura",
  eventKey: "import-s14-w1-scorecard-1",
  seasonNumber: 14,
  weekNumber: 1,
  completed: true,
}

const run = (overrides: Partial<typeof base & { courseCode: string; roundId: string | null; score: number | null }>) => ({
  ...base,
  courseCode: "ZZE",
  roundId: "63629",
  score: -26,
  ...overrides,
})

test("retained Season 14 Week 1 source pair produces gomarino13 combined -40", () => {
  const pair = buildStrictKwtCombinedPair(
    run({ courseCode: "ZZE", roundId: "63629", score: -26 }),
    run({ courseCode: "ZZH", roundId: "63630", score: -14 }),
  )
  assert.deepEqual(pair, {
    playerId: "player-gomarino13",
    baseMap: "Temple at Zerzura",
    eventKey: "import-s14-w1-scorecard-1",
    seasonNumber: 14,
    weekNumber: 1,
    easyCourseCode: "ZZE",
    hardCourseCode: "ZZH",
    easyRoundId: "63629",
    hardRoundId: "63630",
    easyScore: -26,
    hardScore: -14,
    combinedScore: -40,
    pairingEvidenceType: "same_scorecard_consecutive_source_rounds",
  })
})

test("cross-week, cross-event, and cross-player pairs are rejected", () => {
  const easy = run({})
  assert.equal(buildStrictKwtCombinedPair(easy, run({ courseCode: "ZZH", roundId: "63630", score: -14, weekNumber: 2 })), null)
  assert.equal(buildStrictKwtCombinedPair(easy, run({ courseCode: "ZZH", roundId: "63630", score: -14, eventKey: "other-event" })), null)
  assert.equal(buildStrictKwtCombinedPair(easy, run({ courseCode: "ZZH", roundId: "63630", score: -14, playerId: "player-other" })), null)
})

test("missing sides, incomplete runs, and non-paired same-week runs are rejected", () => {
  const easy = run({})
  assert.equal(buildStrictKwtCombinedPair(easy, run({ courseCode: "ZZH", roundId: null, score: -14 })), null)
  assert.equal(buildStrictKwtCombinedPair(easy, run({ courseCode: "ZZH", roundId: "63631", score: -14 })), null)
  assert.equal(buildStrictKwtCombinedPair(easy, run({ courseCode: "ZZH", roundId: "63630", score: null })), null)
  assert.equal(buildStrictKwtCombinedPair(easy, run({ courseCode: "ZZH", roundId: "63630", score: -14, completed: false })), null)
})

test("the row guard rejects generic or incomplete Combined rows", () => {
  assert.equal(isStrictKwtCombinedRow({ difficulty: "Combined", player_id: "p", base_map: "Map", event_key: "event", season_number: 14, week_number: 1, easy_round_id: "63629", hard_round_id: "63630", pairing_evidence_type: null }), false)
  assert.equal(isStrictKwtCombinedRow({ difficulty: "Combined", player_id: "p", base_map: "Map", event_key: "event", season_number: 14, week_number: 1, easy_round_id: "63629", hard_round_id: "63631", pairing_evidence_type: "same_scorecard_consecutive_source_rounds" }), false)
  assert.equal(isStrictKwtCombinedRow({ difficulty: "Combined", player_id: "p", base_map: "Map", event_key: "event", season_number: 14, week_number: 1, easy_round_id: "63629", hard_round_id: "63630", pairing_evidence_type: "same_scorecard_consecutive_source_rounds" }), true)
  assert.equal(isStrictKwtCombinedRow({ difficulty: "Easy", player_id: "p" }), true)
})

test("source fixture retains the two round IDs and expected scores", () => {
  const csv = readFileSync("docs/historical-sources/kwt/website-score-recovery/normalized/KWT14W01.csv", "utf8")
  assert.match(csv, /gomarino13,ELITE,ZZE,-26,ZZH,-14,-40,1,1,25,7171,63629,63630/)
})

test("both public KWT Combined surfaces point at the same strict source", () => {
  const kwtRecordsPage = readFileSync("app/kwt/records/page.tsx", "utf8")
  const publicRoute = readFileSync("app/api/records/public/route.ts", "utf8")
  const migration = readFileSync("20260909_kwt_course_records_strict_combined_pairing.sql", "utf8")
  assert.match(kwtRecordsPage, /get_public_kwt_course_records/)
  assert.match(publicRoute, /get_public_kwt_combined_records/)
  assert.match(publicRoute, /source_authority.*KWT/)
  assert.doesNotMatch(publicRoute, /combined_course_records/)
  assert.match(migration, /get_public_kwt_combined_records/)
  assert.match(migration, /easy_round_id/)
  assert.match(migration, /hard_round_id/)
  assert.match(migration, /same_scorecard_consecutive_source_rounds/)
  assert.doesNotMatch(migration, /update public\.historical_kwt_scorecards|delete from public\.historical_kwt_scorecards/i)
})
