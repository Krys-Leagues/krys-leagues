import assert from "node:assert/strict"
import test from "node:test"
import { getCourseChallenge } from "./catalog.ts"
import { aceCount, aceCrossCreditRows, aceProgress, nextSequentialAceStage, sequentialCompletedStages } from "./ace.ts"

const tourist = getCourseChallenge("tourist-trap")!
const cherry = getCourseChallenge("cherry-blossom")!
function scorecard(count: number) { return Array.from({ length: 18 }, (_, index) => index < count ? 1 : 3) }
function row(stage: number, difficulty: "Easy" | "Hard", count: number, challenge_key: "level" | "ace" = "ace") { return { id: `${difficulty}-${stage}-${count}`, challenge_key, ace_stage_number: stage, difficulty, hole_scores: scorecard(count), status: "approved" } }

test("Ace stages use numeric per-card Easy/Hard thresholds", () => {
  assert.deepEqual(tourist.aceStages?.map((stage) => [stage.key, stage.easyRequirements[0]?.target, stage.hardRequirements[0]?.target]), [["wader", 2, undefined], ["chaser", 3, 1], ["hunter", 6, 1], ["legend", 10, 3]])
  assert.deepEqual(cherry.aceStages?.map((stage) => [stage.key, stage.easyRequirements[0]?.target, stage.hardRequirements[0]?.target]), [["wader", 3, undefined], ["chaser", 6, 2], ["hunter", 10, 5], ["legend", 12, 8]])
  assert.equal(tourist.aceStages?.[0].requiresHard, false)
  assert.equal(cherry.aceStages?.[0].requiresHard, false)
})

test("Ace progression is strictly sequential and cannot skip a stage", () => {
  assert.deepEqual(sequentialCompletedStages(cherry, [1, 3]), [1])
  assert.equal(nextSequentialAceStage(cherry, [1, 3])?.key, "chaser")
  const skipped = aceProgress(cherry, [row(3, "Easy", 12), row(3, "Hard", 8)], [])
  assert.deepEqual(skipped.completedStages, [])
  assert.equal(skipped.nextStage?.key, "wader")
})

test("Cherry stages require per-card HIO counts", () => {
  const wader = aceProgress(cherry, [row(1, "Easy", 3)], [])
  assert.deepEqual(wader.completedStages, [1])
  const chaser = aceProgress(cherry, [row(1, "Easy", 3), row(2, "Easy", 6), row(2, "Hard", 2)], [])
  assert.deepEqual(chaser.completedStages, [1, 2])
  const hunterWithoutHard = aceProgress(cherry, [row(1, "Easy", 3), row(2, "Easy", 6), row(2, "Hard", 2), row(3, "Easy", 10)], [1, 2])
  assert.deepEqual(hunterWithoutHard.completedStages, [1, 2])
  const hunter = aceProgress(cherry, [row(2, "Easy", 6), row(2, "Hard", 2), row(3, "Easy", 10), row(3, "Hard", 5)], [1, 2])
  assert.deepEqual(hunter.completedStages, [1, 2, 3])
})

test("Tourist Wader is Easy-only and later stages use both sides", () => {
  assert.deepEqual(aceProgress(tourist, [row(1, "Easy", 2)], []).completedStages, [1])
  assert.deepEqual(aceProgress(tourist, [row(1, "Easy", 2), row(2, "Easy", 3)], [1]).completedStages, [1])
  assert.deepEqual(aceProgress(tourist, [row(1, "Easy", 2), row(2, "Easy", 3), row(2, "Hard", 1)], [1]).completedStages, [1, 2])
})

test("Level/Ace cross-credit is limited to the current stage and current card", () => {
  const current = row(1, "Easy", 2, "level")
  const unrelated = row(2, "Easy", 10, "level")
  const rows = aceCrossCreditRows([current, unrelated], new Set(), current.id!, 1)
  assert.deepEqual(rows.map((item) => item.id), [current.id])
  assert.equal(aceCount(current.hole_scores), 2)
})
