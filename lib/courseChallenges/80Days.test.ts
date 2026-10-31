import assert from "node:assert/strict"
import test from "node:test"
import { getComingSoonCourseChallenges, getCourseChallenge, isAceChallengeUnlocked } from "./catalog.ts"
import { aceProgress } from "./ace.ts"
import { calculateCourseChallengeMetrics, evaluateCourseChallengeRequirements } from "./evaluation.ts"

const course = getCourseChallenge("80-days-around-the-world")!
const easyPars = [3, 3, 4, 3, 4, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
const hardPars = [3, 3, 4, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 3, 2, 3, 3, 4]

function atPar(pars: number[]) { return [...pars] }
function improve(scores: number[], holes: number[], amount = 1) {
  for (const hole of holes) scores[hole - 1] -= amount
  return scores
}

function scorecard(count: number) { return Array.from({ length: 18 }, (_, index) => index < count ? 1 : 3) }
function aceRow(stage: number, difficulty: "Easy" | "Hard", count: number, id = `${stage}-${difficulty}-${count}`) {
  return { id, challenge_key: "ace" as const, ace_stage_number: stage, difficulty, hole_scores: scorecard(count), status: "approved" }
}

test("80 Days preserves its live cards and exposes the finalized Ace Track", () => {
  assert.equal(course.status, "live")
  assert.equal(course.easyCode, "AWE")
  assert.equal(course.hardCode, "AWH")
  assert.equal(calculateCourseChallengeMetrics(easyPars, easyPars).totalPar, 57)
  assert.equal(calculateCourseChallengeMetrics(hardPars, hardPars).totalPar, 56)
  assert.deepEqual(course.aceStages?.map((stage) => [stage.key, stage.easyRequirements[0]?.target, stage.hardRequirements[0]?.target]), [["wader", 2, undefined], ["chaser", 4, 2], ["hunter", 7, 5], ["legend", 11, 7]])
  assert.equal(isAceChallengeUnlocked(course, []), true)
  assert.equal(course.aceStages?.every((stage) => stage.rewardAsset === null), true)
})

test("80 Days Ace Wader is Easy-only and requires two HIOs on one card", () => {
  assert.deepEqual(aceProgress(course, [aceRow(1, "Easy", 1)], []).completedStages, [])
  assert.deepEqual(aceProgress(course, [aceRow(1, "Easy", 2)], []).completedStages, [1])
  assert.deepEqual(aceProgress(course, [aceRow(1, "Easy", 2), aceRow(1, "Hard", 18)], []).completedStages, [1])
})

test("80 Days Chaser requires four Easy and two Hard HIOs per card and Wader first", () => {
  assert.deepEqual(aceProgress(course, [aceRow(2, "Easy", 4), aceRow(2, "Hard", 2)], []).completedStages, [])
  assert.deepEqual(aceProgress(course, [aceRow(1, "Easy", 2), aceRow(2, "Easy", 4), aceRow(2, "Hard", 2)], [1]).completedStages, [1, 2])
  assert.deepEqual(aceProgress(course, [aceRow(1, "Easy", 2), aceRow(2, "Easy", 3), aceRow(2, "Hard", 2)], [1]).completedStages, [1])
  assert.deepEqual(aceProgress(course, [aceRow(1, "Easy", 2), aceRow(2, "Easy", 4), aceRow(2, "Hard", 1)], [1]).completedStages, [1])
  assert.deepEqual(aceProgress(course, [aceRow(1, "Easy", 2), aceRow(2, "Easy", 2, "e1"), aceRow(2, "Easy", 2, "e2"), aceRow(2, "Hard", 2)], [1]).completedStages, [1])
})

test("80 Days Hunter and Legend retain strict sequential progression and per-card thresholds", () => {
  const hunterRows = [aceRow(1, "Easy", 2), aceRow(2, "Easy", 4), aceRow(2, "Hard", 2), aceRow(3, "Easy", 7), aceRow(3, "Hard", 5)]
  assert.deepEqual(aceProgress(course, hunterRows, [1, 2]).completedStages, [1, 2, 3])
  assert.deepEqual(aceProgress(course, [...hunterRows.slice(0, 3), aceRow(3, "Easy", 6), aceRow(3, "Hard", 5)], [1, 2]).completedStages, [1, 2])
  assert.deepEqual(aceProgress(course, [...hunterRows.slice(0, 3), aceRow(3, "Easy", 7), aceRow(3, "Hard", 4)], [1, 2]).completedStages, [1, 2])
  const legendRows = [...hunterRows, aceRow(4, "Easy", 11), aceRow(4, "Hard", 7)]
  assert.deepEqual(aceProgress(course, legendRows, [1, 2, 3]).completedStages, [1, 2, 3, 4])
  assert.deepEqual(aceProgress(course, [...hunterRows, aceRow(4, "Easy", 10), aceRow(4, "Hard", 7)], [1, 2, 3]).completedStages, [1, 2, 3])
  assert.deepEqual(aceProgress(course, [...hunterRows, aceRow(4, "Easy", 11), aceRow(4, "Hard", 6)], [1, 2, 3]).completedStages, [1, 2, 3])
})

test("new Course Challenge books are exact Coming Soon placeholders with no requirements or rewards", () => {
  const comingSoon = getComingSoonCourseChallenges()
  assert.deepEqual(comingSoon.map((item) => [item.name, item.status]), [
    ["Gardens of Babylon", "coming_soon"],
    ["Raptor Cliff's", "coming_soon"],
    ["Forgotten Fairyland", "coming_soon"],
    ["Tiki à Coco", "coming_soon"],
  ])
  assert.equal(new Set(comingSoon.map((item) => item.slug)).size, 4)
  assert.equal(comingSoon.every((item) => item.levels.length === 0 && !item.aceStages && !item.prestigeStages), true)
  assert.equal(getCourseChallenge("widows-walkabout"), null)
})

test("80 Days publishes exactly the supplied Level 1 through 5 rule plan", () => {
  assert.deepEqual(course.levels.map((level) => level.easyRequirements.map((item) => [item.kind, item.target, item.hole, item.scoreThreshold])), [
    [["complete_course", 1, undefined, undefined], ["relative_to_par", -3, undefined, undefined], ["birdie_count", 2, undefined, undefined], ["stroke_out_count", 1, undefined, undefined]],
    [["complete_course", 1, undefined, undefined], ["relative_to_par", -6, undefined, undefined], ["hole_relative_to_par", -1, 8, undefined], ["stroke_out_count", 0, undefined, undefined]],
    [["complete_course", 1, undefined, undefined], ["relative_to_par", -10, undefined, undefined], ["hole_relative_to_par", -2, 8, undefined], ["hole_relative_to_par", -1, 1, undefined], ["hole_relative_to_par", -1, 3, undefined], ["hole_relative_to_par", -1, 5, undefined], ["hole_relative_to_par", -1, 17, undefined]],
    [["complete_course", 1, undefined, undefined], ["relative_to_par", -15, undefined, undefined], ["bogey_count", 0, undefined, undefined], ["holes_at_or_below_score_count", 5, undefined, 2]],
    [["complete_course", 1, undefined, undefined], ["relative_to_par", -20, undefined, undefined], ["holes_under_par_count", 10, undefined, undefined]],
  ])
  assert.deepEqual(course.levels.map((level) => level.hardRequirements.map((item) => [item.kind, item.target, item.hole, item.scoreThreshold])), [
    [["complete_course", 1, undefined, undefined], ["relative_to_par", 5, undefined, undefined], ["par_or_better_count", 3, undefined, undefined]],
    [["complete_course", 1, undefined, undefined], ["relative_to_par", 0, undefined, undefined], ["birdie_count", 2, undefined, undefined]],
    [["complete_course", 1, undefined, undefined], ["relative_to_par", -5, undefined, undefined], ["hole_relative_to_par", -1, 3, undefined], ["hole_relative_to_par", -1, 10, undefined], ["stroke_out_count", 1, undefined, undefined]],
    [["complete_course", 1, undefined, undefined], ["relative_to_par", -10, undefined, undefined], ["stroke_out_count", 0, undefined, undefined], ["hole_score", 2, 7, undefined]],
    [["complete_course", 1, undefined, undefined], ["relative_to_par", -15, undefined, undefined], ["bogey_count", 2, undefined, undefined]],
  ])
  assert.deepEqual(course.prestigeStages?.map((stage) => [stage.easyRequirements.map((item) => [item.kind, item.target, item.scoreThreshold]), stage.hardRequirements.map((item) => [item.kind, item.target, item.scoreThreshold])]), [
    [[["all_holes_at_or_below_score", 18, 2]], [["relative_to_par", -17, undefined], ["bogey_count", 0, undefined], ["eagle_count", 1, undefined]]],
    [[["relative_to_par", -26, undefined]], [["all_holes_at_or_below_score", 18, 2]]],
  ])
})

test("Easy Level 1 boundary requires -3, two birdies, and at most one stroke-out", () => {
  const scores = atPar(easyPars)
  improve(scores, [1, 2, 3])
  assert.equal(evaluateCourseChallengeRequirements(scores, easyPars, course.levels[0].easyRequirements, "ready").status, "auto_pass")
  const miss = [...scores]
  miss[1] = easyPars[1]
  assert.equal(evaluateCourseChallengeRequirements(miss, easyPars, course.levels[0].easyRequirements, "ready").status, "auto_fail")
})

test("specific holes, count rules, and negative totals use the same scorecard", () => {
  const level2 = improve(improve(improve(improve(atPar(easyPars), [1, 2], 2), [3], 1), [8], 1), [4], 1)
  assert.equal(evaluateCourseChallengeRequirements(level2, easyPars, course.levels[1].easyRequirements, "ready").status, "auto_pass")
  const level3 = atPar(easyPars)
  improve(level3, [8], 2)
  improve(level3, [1, 3, 5, 17])
  improve(level3, [2, 4], 2)
  improve(level3, [6], 1)
  assert.equal(evaluateCourseChallengeRequirements(level3, easyPars, course.levels[2].easyRequirements, "ready").status, "auto_pass")
  const level5 = easyPars.map((par, index) => index < 5 ? par - 2 : index < 15 ? par - 1 : par)
  assert.equal(evaluateCourseChallengeRequirements(level5, easyPars, course.levels[4].easyRequirements, "ready").status, "auto_pass")
  assert.equal(calculateCourseChallengeMetrics(level5, easyPars).relativeToPar, -20)
})

test("Hard Level 2 intentionally has no stroke-out restriction", () => {
  const requirements = course.levels[1].hardRequirements
  assert.equal(requirements.some((item) => item.kind === "stroke_out_count"), false)
  const scores = atPar(hardPars)
  scores[0] = hardPars[0] + 3
  scores[1] = hardPars[1] - 1
  scores[2] = hardPars[2] - 1
  scores[3] = hardPars[3] - 2
  scores[4] = hardPars[4] + 1
  assert.equal(calculateCourseChallengeMetrics(scores, hardPars).relativeToPar, 0)
  assert.equal(evaluateCourseChallengeRequirements(scores, hardPars, requirements, "ready").status, "auto_pass")
})

test("Hard Level 3 and Level 4 preserve their hole and stroke-out boundaries", () => {
  const level3 = atPar(hardPars)
  improve(level3, [3, 10], 1)
  improve(level3, [1], 1)
  improve(level3, [2], 2)
  assert.equal(calculateCourseChallengeMetrics(level3, hardPars).relativeToPar, -5)
  level3[0] = hardPars[0]
  assert.equal(evaluateCourseChallengeRequirements(level3, hardPars, course.levels[2].hardRequirements, "ready").status, "auto_fail")
  const level4 = atPar(hardPars)
  improve(level4, [7], 1)
  improve(level4, [1, 2, 3, 4, 5, 6, 8, 9, 10], 1)
  assert.equal(evaluateCourseChallengeRequirements(level4, hardPars, course.levels[3].hardRequirements, "ready").status, "auto_pass")
  level4[6] = 3
  assert.equal(evaluateCourseChallengeRequirements(level4, hardPars, course.levels[3].hardRequirements, "ready").status, "auto_fail")
})

test("Course Pro and Course Master use their stated same-card rules", () => {
  const proEasy = Array(18).fill(2)
  assert.equal(evaluateCourseChallengeRequirements(proEasy, easyPars, course.prestigeStages![0].easyRequirements, "ready").status, "auto_pass")
  const proEasyMiss = [...proEasy]
  proEasyMiss[0] = 3
  assert.equal(evaluateCourseChallengeRequirements(proEasyMiss, easyPars, course.prestigeStages![0].easyRequirements, "ready").status, "auto_fail")
  const proHard = hardPars.map((par, index) => par - [1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 0, 0][index])
  assert.equal(evaluateCourseChallengeRequirements(proHard, hardPars, course.prestigeStages![0].hardRequirements, "ready").status, "auto_pass")
  const masterEasy = easyPars.map((par) => par - 2)
  assert.equal(evaluateCourseChallengeRequirements(masterEasy, easyPars, course.prestigeStages![1].easyRequirements, "ready").status, "auto_pass")
  assert.equal(evaluateCourseChallengeRequirements(Array(18).fill(2), hardPars, course.prestigeStages![1].hardRequirements, "ready").status, "auto_pass")
})
