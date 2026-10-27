import assert from "node:assert/strict"
import test from "node:test"
import { buildKwtCourseRecords, KWT_RANK_ORDER } from "./kwtRecords.ts"

const row = (overrides: Partial<Parameters<typeof buildKwtCourseRecords>[0][number]> = {}) => ({
  course_code: "CBE",
  course_name: "Cherry Blossom",
  difficulty: "Easy" as const,
  record_scope: "rank" as const,
  historical_rank: "Pro" as const,
  score: -30,
  player_id: "player-a",
  screen_name: "Player A",
  ...overrides,
})

test("KWT course records group by course and keep Easy/Hard independent", () => {
  const records = buildKwtCourseRecords([
    row(),
    row({ difficulty: "Hard", score: -28, player_id: "player-b", screen_name: "Player B" }),
    row({ course_code: "GHE", course_name: "Gloop Lair", score: -20, player_id: "player-c", screen_name: "Player C" }),
  ])
  assert.deepEqual(records.map((record) => record.courseName), ["Cherry Blossom", "Gloop Lair"])
  assert.equal(records[0].records.Easy.ranks.Pro?.score, -30)
  assert.equal(records[0].records.Hard.ranks.Pro?.score, -28)
  assert.equal(records[1].records.Easy.ranks.Pro?.score, -20)
})

test("Amateur through Elite are presented in progression order and scores use lower-is-better semantics", () => {
  const records = buildKwtCourseRecords([
    row({ historical_rank: "Elite", score: -20, player_id: "elite", screen_name: "Elite" }),
    row({ historical_rank: "Amateur", score: -35, player_id: "amateur", screen_name: "Amateur" }),
    row({ historical_rank: "Semi-Pro", score: -22, player_id: "semi", screen_name: "Semi" }),
    row({ historical_rank: "Pro", score: -31, player_id: "pro", screen_name: "Pro" }),
    row({ historical_rank: "Pro", score: -29, player_id: "worse", screen_name: "Worse" }),
  ])
  assert.deepEqual(KWT_RANK_ORDER, ["Amateur", "Semi-Pro", "Pro", "Elite"])
  assert.equal(records[0].records.Easy.ranks.Pro?.score, -31)
})

test("all tied KWT course-record holders remain visible without a tiebreaker", () => {
  const records = buildKwtCourseRecords([
    row({ score: -31, player_id: "player-b", screen_name: "Player B" }),
    row({ score: -31, player_id: "player-a", screen_name: "Player A" }),
    row({ score: -30, player_id: "player-c", screen_name: "Player C" }),
  ])
  assert.deepEqual(records[0].records.Easy.ranks.Pro?.holders.map((holder) => holder.screenName), ["Player A", "Player B"])
})

test("unknown-rank runs compete for Overall but never enter a rank-specific record", () => {
  const records = buildKwtCourseRecords([
    row({ record_scope: "overall", historical_rank: null, score: -34, player_id: "unknown", screen_name: "Unknown Rank" }),
    row({ record_scope: "rank", historical_rank: "Pro", score: -31, player_id: "pro", screen_name: "Pro Player" }),
  ])
  assert.equal(records[0].records.Easy.overall?.score, -34)
  assert.deepEqual(records[0].records.Easy.overall?.holders.map((holder) => holder.screenName), ["Unknown Rank"])
  assert.equal(records[0].records.Easy.ranks.Pro?.score, -31)
  assert.equal(records[0].records.Easy.ranks.Amateur, undefined)
})

test("proven ranks participate in Overall and their matching rank only", () => {
  const records = buildKwtCourseRecords([
    row({ record_scope: "overall", historical_rank: null, score: -20, player_id: "unknown", screen_name: "Unknown" }),
    row({ record_scope: "rank", historical_rank: "Amateur", score: -21, player_id: "amateur", screen_name: "Amateur" }),
    row({ record_scope: "rank", historical_rank: "Semi-Pro", score: -22, player_id: "semi", screen_name: "Semi-Pro" }),
    row({ record_scope: "rank", historical_rank: "Pro", score: -23, player_id: "pro", screen_name: "Pro" }),
    row({ record_scope: "rank", historical_rank: "Elite", score: -24, player_id: "elite", screen_name: "Elite" }),
  ])
  const easy = records[0].records.Easy
  assert.equal(easy.overall?.score, -20)
  assert.deepEqual(Object.keys(easy.ranks), ["Amateur", "Semi-Pro", "Pro", "Elite"])
  assert.deepEqual(KWT_RANK_ORDER, ["Amateur", "Semi-Pro", "Pro", "Elite"])
})

test("Overall ties are preserved independently from rank-specific ties", () => {
  const records = buildKwtCourseRecords([
    row({ record_scope: "overall", historical_rank: null, score: -34, player_id: "a", screen_name: "A" }),
    row({ record_scope: "overall", historical_rank: null, score: -34, player_id: "b", screen_name: "B" }),
    row({ record_scope: "rank", historical_rank: "Elite", score: -34, player_id: "c", screen_name: "C" }),
    row({ record_scope: "rank", historical_rank: "Elite", score: -34, player_id: "d", screen_name: "D" }),
  ])
  assert.deepEqual(records[0].records.Easy.overall?.holders.map((holder) => holder.screenName), ["A", "B"])
  assert.deepEqual(records[0].records.Easy.ranks.Elite?.holders.map((holder) => holder.screenName), ["C", "D"])
})
