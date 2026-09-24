import assert from "node:assert/strict"
import test from "node:test"
import { buildDoublesScorecardCommit, holesWonForCourse, scorecardCommitKey } from "./doublesScorecard.ts"

const course1 = { key: "course1" as const, homeStrokes: [3, 4, ...Array(16).fill(5)], awayStrokes: [4, 3, ...Array(16).fill(5)], verified: true, evidenceId: "e1", uploaderPlayerId: "p3" }
const course2 = { key: "course2" as const, homeStrokes: [4, 4, ...Array(16).fill(3)], awayStrokes: [3, 5, ...Array(16).fill(3)], verified: true, evidenceId: "e2", uploaderPlayerId: "p1" }

test("each course derives team holes won and ties award neither team", () => {
  assert.deepEqual(holesWonForCourse(course1), { homeHolesWon: 1, awayHolesWon: 1 })
  assert.deepEqual(holesWonForCourse({ homeStrokes: Array(18).fill(4), awayStrokes: Array(18).fill(4) }), { homeHolesWon: 0, awayHolesWon: 0 })
})

test("final Doubles result sums Home and Away holes won across both courses", () => {
  const commit = buildDoublesScorecardCommit([course1, course2])
  assert.deepEqual(commit.course1, { homeHolesWon: 1, awayHolesWon: 1 })
  assert.deepEqual(commit.course2, { homeHolesWon: 1, awayHolesWon: 1 })
  assert.equal(commit.home_score, 2)
  assert.equal(commit.away_score, 2)
  assert.deepEqual(commit.uploaderPlayerIds, ["p3", "p1"])
})

test("final commit waits for both verified components and is deterministically keyed", () => {
  assert.throws(() => buildDoublesScorecardCommit([course1]), /Both verified/)
  assert.equal(scorecardCommitKey("f1", "e1", "e2"), "f1:doubles-scorecard:e1:e2")
})
