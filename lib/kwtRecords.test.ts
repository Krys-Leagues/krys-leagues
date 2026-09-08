import assert from "node:assert/strict"
import test from "node:test"
import { buildKwtCourseRecords, KWT_RANK_ORDER } from "./kwtRecords.ts"

const row = (overrides: Partial<Parameters<typeof buildKwtCourseRecords>[0][number]> = {}) => ({
  course_code: "CBE",
  course_name: "Cherry Blossom",
  difficulty: "Easy" as const,
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
  assert.equal(records[0].records.Easy.Pro?.score, -30)
  assert.equal(records[0].records.Hard.Pro?.score, -28)
  assert.equal(records[1].records.Easy.Pro?.score, -20)
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
  assert.equal(records[0].records.Easy.Pro?.score, -31)
})

test("all tied KWT course-record holders remain visible without a tiebreaker", () => {
  const records = buildKwtCourseRecords([
    row({ score: -31, player_id: "player-b", screen_name: "Player B" }),
    row({ score: -31, player_id: "player-a", screen_name: "Player A" }),
    row({ score: -30, player_id: "player-c", screen_name: "Player C" }),
  ])
  assert.deepEqual(records[0].records.Easy.Pro?.holders.map((holder) => holder.screenName), ["Player A", "Player B"])
})
