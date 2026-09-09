import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { buildKwtCourseRecords, canonicalKwtBaseMap, matchesKwtCourseQuery } from "../lib/kwtRecords.ts"

const row = (overrides: Partial<Parameters<typeof buildKwtCourseRecords>[0][number]> = {}) => ({
  course_code: "CBE",
  base_map: "Cherry Blossom",
  course_name: "Cherry Blossom",
  difficulty: "Easy" as const,
  record_scope: "overall" as const,
  historical_rank: null,
  score: -30,
  player_id: "player-a",
  screen_name: "Player A",
  season_number: 9,
  week_number: 5,
  ...overrides,
})

test("Easy and Hard course codes group into one canonical map", () => {
  const records = buildKwtCourseRecords([
    row(),
    row({ course_code: "CBH", difficulty: "Hard", score: -28, player_id: "player-b", screen_name: "Player B" }),
  ])
  assert.equal(records.length, 1)
  assert.equal(records[0].courseName, "Cherry Blossom")
  assert.deepEqual(records[0].courseCodes, ["CBE", "CBH"])
})

test("Best Combined keeps event provenance and lower score ordering", () => {
  const records = buildKwtCourseRecords([
    row({ difficulty: "Combined", score: -55, player_id: "player-a", scorecard_id: "scorecard-a", event_key: "s9w5-a", easy_round_id: "1", hard_round_id: "2", pairing_evidence_type: "same_scorecard_consecutive_source_rounds" }),
    row({ difficulty: "Combined", score: -54, player_id: "player-b", screen_name: "Player B", season_number: 9, week_number: 6, scorecard_id: "scorecard-b", event_key: "s9w6-b", easy_round_id: "3", hard_round_id: "4", pairing_evidence_type: "same_scorecard_consecutive_source_rounds" }),
  ])
  assert.equal(records[0].records.Combined.overall?.score, -55)
  assert.deepEqual(records[0].records.Combined.overall?.holders[0], { playerId: "player-a", screenName: "Player A", seasonNumber: 9, weekNumber: 5 })
})

test("course variants group under one base map and expose code aliases", () => {
  const records = buildKwtCourseRecords([
    row({ course_code: "20E", base_map: "20,000 Leagues", course_name: "20,000 Leagues Easy" }),
    row({ course_code: "20H", base_map: "20,000 Leagues Under The Sea", course_name: "20,000 Leagues Under The Sea Hard", difficulty: "Hard" }),
    row({ course_code: "JCE", base_map: "Journey to the Center of the Earth", course_name: "Journey to the Center of the Earth Easy", player_id: "player-b" }),
    row({ course_code: "JCH", base_map: "Journey to the Center of the Earth", course_name: "Journey to the Center of the Earth Hard", difficulty: "Hard", player_id: "player-c" }),
  ])
  assert.equal(records.length, 2)
  assert.equal(records[0].courseName, "20,000 Leagues Under The Sea")
  assert.deepEqual(records[0].courseCodes, ["20E", "20H"])
  assert.equal(records[1].courseName, "Journey to the Center of the Earth")
  assert.equal(matchesKwtCourseQuery(records[0], "20"), true)
  assert.equal(matchesKwtCourseQuery(records[1], "JCE"), true)
  assert.equal(matchesKwtCourseQuery(records[1], "JCH"), true)
  assert.equal(canonicalKwtBaseMap("20,000 Leagues Under The Sea Hard"), "20,000 Leagues Under The Sea")
})

test("KWT records migration requires retained round IDs and strict pairing evidence", () => {
  const sql = readFileSync("20260909_kwt_course_records_strict_combined_pairing.sql", "utf8")
  assert.match(sql, /score\.easy_score \+ score\.hard_score/)
  assert.match(sql, /hard\.base_map = easy\.base_map/)
  assert.match(sql, /score\.historical_kwt_import_id/)
  assert.match(sql, /easy_round_id/)
  assert.match(sql, /hard_round_id/)
  assert.match(sql, /same_scorecard_consecutive_source_rounds/)
  assert.doesNotMatch(sql, /update public\.historical_kwt_scorecards|delete from public\.historical_kwt_scorecards/i)
})

test("KWT records page exposes one-map selection and hides empty rank rows", () => {
  const page = readFileSync("app/kwt/records/page.tsx", "utf8")
  assert.match(page, /Search map or code/)
  assert.match(page, /matchesKwtCourseQuery/)
  assert.match(page, /function openCourseList/)
  assert.match(page, /if \(selected && !selectorOpen\) setQuery\(""\)/)
  assert.match(page, /onFocus=\{openCourseList\}/)
  assert.match(page, /onClick=\{openCourseList\}/)
  assert.match(page, /Best Combined/)
  assert.match(page, /RecordTable records=\{course\.records\.Combined\}/)
  assert.doesNotMatch(page, /No recorded score/)
})
