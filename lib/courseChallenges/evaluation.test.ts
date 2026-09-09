import assert from "node:assert/strict"
import test from "node:test"
import { getCourseChallenge, isAceChallengeUnlocked } from "./catalog.ts"
import { aceRewardDefinition, levelRewardDefinitions } from "./rewards.ts"
import { calculateCourseChallengeMetrics, compareEnteredFinalScore, comparePhotoTotal, evaluateCourseChallengeRequirements, levelIsComplete, nextUnlockedLevel } from "./evaluation.ts"

const tourist = getCourseChallenge("tourist-trap")!
const cherry = getCourseChallenge("cherry-blossom")!
const touristPars = [3, 4, 3, 4, 3, 3, 3, 4, 3, 5, 3, 4, 2, 3, 3, 3, 3, 7]
const touristScores = touristPars.map((par, index) => par + (index === 17 ? 1 : 0))
const cherryPars = [3, 4, 3, 4, 3, 3, 3, 4, 3, 5, 3, 4, 2, 3, 3, 3, 3, 7]
const cherryEasyScores = cherryPars.map((par, index) => index < 2 ? par - 2 : index < 8 ? par - 1 : par)
const cherryHardScores = cherryPars.map((par, index) => index === 1 ? par + 1 : par)

test("course challenge metrics use one complete 18-hole card and authoritative pars", () => {
  const metrics = calculateCourseChallengeMetrics(touristScores, touristPars)
  assert.equal(metrics.totalPar, 63)
  assert.equal(metrics.totalStrokes, 64)
  assert.equal(metrics.relativeToPar, 1)
  assert.equal(metrics.lastHoleScore, 8)
  assert.equal(metrics.strokeOuts, 0)
})

test("pending challenge definitions never auto-pass", () => {
  const result = evaluateCourseChallengeRequirements(touristScores, touristPars, [], "pending_review")
  assert.equal(result.status, "needs_review")
  assert.equal(result.requirements[0].passed, null)
})

test("Tourist Trap Levels 1 through 5 contain approved cumulative requirements", () => {
  assert.equal(tourist.levels.every((level) => level.requirementsStatus === "ready"), true)
  assert.deepEqual(tourist.levels.map((level) => level.easyRequirements.length), [3, 5, 5, 5, 5])
  assert.deepEqual(tourist.levels.map((level) => level.hardRequirements.length), [3, 5, 5, 6, 9])
  assert.equal(tourist.levels[2].easyRequirements.some((requirement) => requirement.hole === 1 && requirement.target === 1), true)
  assert.equal(tourist.levels[2].easyRequirements.some((requirement) => requirement.hole === 2 && requirement.target === 1), true)
  assert.equal(tourist.levels[4].hardRequirements.filter((requirement) => requirement.kind === "hole_relative_to_par").length, 4)
})

test("same-card HIO and designated-hole checks evaluate together", () => {
  const sameCardScores = touristPars.map((par, index) => index === 0 || index === 1 ? 1 : index === 17 ? par - 1 : par)
  const result = evaluateCourseChallengeRequirements(sameCardScores, touristPars, [
    { id: "h1", label: "H1 HIO", kind: "hole_score", target: 1, hole: 1 },
    { id: "h2", label: "H2 HIO", kind: "hole_score", target: 1, hole: 2 },
    { id: "h18", label: "H18 birdie or better", kind: "hole_relative_to_par", operator: "lte", target: -1, hole: 18 },
  ], "ready")
  assert.equal(result.status, "auto_pass")
  assert.equal(result.requirements.every((item) => item.passed === true), true)
})

test("the confirmed stroke-out rule is entered score at least par plus four", () => {
  const belowStrokeOut = touristPars.map((par, index) => index === 0 ? par + 3 : par)
  const atStrokeOut = touristPars.map((par, index) => index === 0 ? par + 4 : par)
  assert.equal(calculateCourseChallengeMetrics(belowStrokeOut, touristPars).strokeOuts, 0)
  assert.equal(calculateCourseChallengeMetrics(atStrokeOut, touristPars).strokeOuts, 1)
  assert.equal(evaluateCourseChallengeRequirements(atStrokeOut, touristPars, [{ id: "none", label: "No stroke-outs", kind: "stroke_out_count", operator: "lte", target: 0 }], "ready").status, "auto_fail")
})

test("Tourist Trap stroke-out thresholds accept two and reject three", () => {
  const two = touristPars.map((par, index) => index < 2 ? par + 4 : par)
  const three = touristPars.map((par, index) => index < 3 ? par + 4 : par)
  const requirement = [{ id: "stroke", label: "2 stroke-outs or fewer", kind: "stroke_out_count" as const, operator: "lte" as const, target: 2 }]
  assert.equal(evaluateCourseChallengeRequirements(two, touristPars, requirement, "ready").status, "auto_pass")
  assert.equal(evaluateCourseChallengeRequirements(three, touristPars, requirement, "ready").status, "auto_fail")
})

test("Cherry Blossom Level 1 Easy enforces complete, minus ten, no stroke-outs, and two eagles", () => {
  const result = evaluateCourseChallengeRequirements(cherryEasyScores, cherryPars, cherry.levels[0].easyRequirements, "ready")
  assert.equal(result.metrics.relativeToPar, -10)
  assert.equal(result.metrics.strokeOuts, 0)
  assert.equal(result.metrics.eagles, 2)
  assert.equal(result.status, "auto_pass")
  const thresholdMiss = [...cherryEasyScores]
  thresholdMiss[7] = cherryPars[7]
  assert.equal(evaluateCourseChallengeRequirements(thresholdMiss, cherryPars, cherry.levels[0].easyRequirements, "ready").status, "auto_fail")
})

test("Cherry Blossom Level 1 Hard enforces six pars-or-better and hole-specific checks", () => {
  const result = evaluateCourseChallengeRequirements(cherryHardScores, cherryPars, cherry.levels[0].hardRequirements, "ready")
  assert.equal(result.metrics.parsOrBetter, 17)
  assert.equal(result.status, "auto_pass")
  assert.equal(result.requirements.some((item) => item.requirement.hole === 2 && item.passed === true), true)
  assert.equal(result.requirements.some((item) => item.requirement.hole === 10 && item.passed === true), true)
  const holeTwoMiss = [...cherryHardScores]
  holeTwoMiss[1] = cherryPars[1] + 2
  assert.equal(evaluateCourseChallengeRequirements(holeTwoMiss, cherryPars, cherry.levels[0].hardRequirements, "ready").status, "auto_fail")
})

test("a level needs both approved sides and unlocks one next level", () => {
  assert.equal(levelIsComplete("approved", "pending"), false)
  assert.equal(levelIsComplete("pending", "approved"), false)
  assert.equal(levelIsComplete("approved", "approved"), true)
  assert.equal(nextUnlockedLevel([]), 1)
  assert.equal(nextUnlockedLevel([1]), 2)
  assert.equal(nextUnlockedLevel([1, 2, 3]), 4)
})

test("photo totals and Course Pro/Master rewards remain wired", () => {
  const metrics = calculateCourseChallengeMetrics(touristScores, touristPars)
  assert.equal(comparePhotoTotal(metrics, 64, true), "passed")
  assert.equal(comparePhotoTotal(metrics, 63, true), "needs_review")
  assert.equal(compareEnteredFinalScore(metrics, metrics.relativeToPar), "passed")
  assert.equal(compareEnteredFinalScore(metrics, metrics.relativeToPar + 1), "needs_review")
  assert.equal(levelRewardDefinitions(tourist, 3).some((reward) => reward.label === "Course Pro"), true)
  assert.equal(levelRewardDefinitions(tourist, 5).some((reward) => reward.label === "Course Master"), true)
})

test("Ace Challenge stays locked before Level 3 and requires both cards after unlock", () => {
  assert.equal(isAceChallengeUnlocked(tourist, []), false)
  assert.equal(isAceChallengeUnlocked(tourist, [1, 2]), false)
  assert.equal(isAceChallengeUnlocked(tourist, [1, 2, 3]), true)
  assert.equal(aceRewardDefinition(tourist)?.rewardKey, "course-challenge:tourist-trap:ace-challenge")
  assert.equal(aceRewardDefinition(tourist)?.assetPath, "/course-challenges/tourist-trap/tourist-trap-ace-challenge.png")
  assert.equal(tourist.aceChallenge?.easyRequirements[0].target, 8)
  assert.equal(tourist.aceChallenge?.hardRequirements[0].target, 2)
  assert.equal(levelIsComplete("approved", "pending"), false)
  assert.equal(levelIsComplete("approved", "approved"), true)
})
