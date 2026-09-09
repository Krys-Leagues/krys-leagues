import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { buildKwtCourseRecords } from "../lib/kwtRecords.ts"

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
    row({ difficulty: "Combined", score: -55, player_id: "player-a" }),
    row({ difficulty: "Combined", score: -54, player_id: "player-b", screen_name: "Player B", season_number: 9, week_number: 6 }),
  ])
  assert.equal(records[0].records.Combined.overall?.score, -55)
  assert.deepEqual(records[0].records.Combined.overall?.holders[0], { playerId: "player-a", screenName: "Player A", seasonNumber: 9, weekNumber: 5 })
})

test("KWT records migration requires same-scorecard Easy/Hard map pairing", () => {
  const sql = readFileSync("20260909_kwt_course_records_map_and_combined.sql", "utf8")
  assert.match(sql, /score\.total_score as score/)
  assert.match(sql, /hard\.base_map = easy\.base_map/)
  assert.match(sql, /score\.season_number/)
  assert.match(sql, /score\.week_number/)
  assert.match(sql, /record_scope text/)
  assert.doesNotMatch(sql, /update public\.historical_kwt_scorecards|delete from public\.historical_kwt_scorecards/i)
})

test("KWT records page exposes one-map selection and hides empty rank rows", () => {
  const page = readFileSync("app/kwt/records/page.tsx", "utf8")
  assert.match(page, /Search course or code/)
  assert.match(page, /course\.courseCodes/)
  assert.match(page, /Best Combined/)
  assert.match(page, /RecordTable records=\{course\.records\.Combined\}/)
  assert.doesNotMatch(page, /No recorded score/)
})
