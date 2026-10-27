import assert from "node:assert/strict"
import test from "node:test"
import { courseDetails, formatTiebreaker, pointRules } from "./publicDetails.ts"

const rounds = [
  { round_number: 1, name: "Round 1", course_config: { course: "Gothic Easy" }, scoring_rules: {}, tiebreaker_rules: {}, is_final: false },
  { round_number: 2, name: "Round 2", course_config: { course: "Gothic Hard" }, scoring_rules: {}, tiebreaker_rules: {}, is_final: false },
  { round_number: 3, name: "Final", course_config: { easy: "Gothic Easy", hard: "Gothic Hard" }, scoring_rules: {}, tiebreaker_rules: { course: "Forgotten Fairyland", policy: "back_nine_then_front_nine_sudden_death" }, is_final: true },
]

test("public tournament details preserve configured courses and difficulty", () => {
  assert.deepEqual(courseDetails(rounds), [{ name: "Gothic Easy", difficulty: "Easy" }, { name: "Gothic Hard", difficulty: "Hard" }])
})

test("public tournament details render approved point rules and tiebreaker", () => {
  assert.deepEqual(pointRules({ scoring: { hole_in_one: 5, condor: 4, albatross: 3, eagle: 2, birdie: 1, par_or_worse: 0 } }), [
    { label: "Hole-in-one", points: 5 }, { label: "Condor", points: 4 }, { label: "Albatross", points: 3 }, { label: "Eagle", points: 2 }, { label: "Birdie", points: 1 }, { label: "Par or worse", points: 0 },
  ])
  assert.equal(formatTiebreaker(rounds), "Forgotten Fairyland back nine, then front-nine sudden death.")
})
