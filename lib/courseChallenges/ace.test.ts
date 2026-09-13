import assert from "node:assert/strict"
import test from "node:test"
import { getCourseChallenge, isAceChallengeUnlocked } from "./catalog.ts"
import { aceProgress, uniqueAceHoleNumbers } from "./ace.ts"

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
