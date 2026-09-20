import assert from "node:assert/strict"
import test from "node:test"
import { getCourseChallenge, isAceChallengeUnlocked } from "./catalog.ts"
import { aceCrossCreditRows, aceProgress, uniqueAceHoleNumbers } from "./ace.ts"

const tourist = getCourseChallenge("tourist-trap")!

function scorecard(holes: number[]) {
  return Array.from({ length: 18 }, (_, index) => holes.includes(index + 1) ? 1 : 3)
}

function aceSubmission(stage: "wader" | "chaser" | "hunter" | "legend", difficulty: "Easy" | "Hard", holes: number[]) {
  return {
    status: "approved",
    difficulty,
    hole_scores: scorecard(holes),
    requirements_evaluation: [{ requirement: { id: `tourist-trap-ace-${stage}-unique-holes` } }],
  }
}

test("Ace progress counts unique holes across approved scorecards", () => {
  assert.deepEqual(uniqueAceHoleNumbers([
    aceSubmission("wader", "Easy", [1, 3]),
    aceSubmission("wader", "Hard", [3, 6]),
  ]), [1, 3, 6])
})

test("Ace Track completes stages cumulatively and remains unlocked through later levels", () => {
  const rows = [
    aceSubmission("wader", "Easy", [1]),
    aceSubmission("wader", "Hard", [1]),
    aceSubmission("chaser", "Easy", [1, 3, 5]),
    aceSubmission("chaser", "Hard", [1, 3, 5]),
  ]
  const progress = aceProgress(tourist, rows)
  assert.deepEqual(progress.uniqueHoles, [1, 3, 5])
  assert.deepEqual(progress.completedStages, [1, 2])
  assert.equal(progress.nextStage?.key, "hunter")
  assert.equal(isAceChallengeUnlocked(tourist, []), true)
  assert.equal(isAceChallengeUnlocked(tourist, [1]), true)
  assert.equal(isAceChallengeUnlocked(tourist, [1, 2, 3, 4, 5]), true)
})

test("the Level card currently being approved is included before its cross-credit event exists", () => {
  const currentLevelCard = { id: "current-level", challenge_key: "level", ace_stage_number: 1, difficulty: "Easy", hole_scores: scorecard([1]), status: "approved" }
  const unrelatedLevelCard = { id: "other-level", challenge_key: "level", ace_stage_number: 1, difficulty: "Easy", hole_scores: scorecard([2]), status: "approved" }
  const rows = aceCrossCreditRows([currentLevelCard, unrelatedLevelCard], new Set(), "current-level", 1)

  assert.deepEqual(rows.map((row) => row.id), ["current-level"])
  assert.deepEqual(aceProgress(tourist, rows).completedStages, [1])
})

test("the reported Tourist Trap Easy card qualifies for Ace Wader", () => {
  const reportedCard = {
    id: "reported-tourist-easy",
    challenge_key: "level",
    ace_stage_number: 1,
    difficulty: "Easy",
    hole_scores: [1, 2, 2, 2, 2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4],
    status: "approved",
  }
  const rows = aceCrossCreditRows([reportedCard], new Set(), reportedCard.id, 1)

  assert.deepEqual(aceProgress(tourist, rows).uniqueHoles, [1])
  assert.deepEqual(aceProgress(tourist, rows).completedStages, [1])
})
