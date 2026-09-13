import assert from "node:assert/strict"
import test from "node:test"
import { getCourseChallenge, isAceChallengeUnlocked, isPrestigeStageUnlocked } from "./catalog.ts"
import { aceStageRewardDefinitions, levelRewardDefinitions, prestigeStageRewardDefinitions } from "./rewards.ts"
import { calculateCourseChallengeMetrics, compareEnteredFinalScore, comparePhotoTotal, evaluateCourseChallengeRequirements, levelIsComplete, nextUnlockedLevel } from "./evaluation.ts"

const tourist = getCourseChallenge("tourist-trap")!
const cherry = getCourseChallenge("cherry-blossom")!
const touristPars = [3, 4, 3, 4, 3, 3, 3, 4, 3, 5, 3, 4, 2, 3, 3, 3, 3, 7]
const touristScores = touristPars.map((par, index) => par + (index === 17 ? 1 : 0))
const cherryPars = [3, 4, 3, 4, 3, 3, 3, 4, 3, 5, 3, 4, 2, 3, 3, 3, 3, 7]

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

test("Cherry Blossom uses the authoritative Level 1 through 5 plan", () => {
  assert.deepEqual(cherry.levels.map((level) => level.easyRequirements.map((requirement) => [requirement.kind, requirement.target, requirement.hole])), [
    [["relative_to_par", -10, undefined]],
    [["relative_to_par", -12, undefined], ["hole_relative_to_par", 0, 2], ["hole_relative_to_par", -1, 10]],
    [["relative_to_par", -14, undefined]],
    [["relative_to_par", -16, undefined], ["hole_relative_to_par", -2, 2], ["hole_relative_to_par", -3, 10]],
    [["relative_to_par", -18, undefined], ["hole_relative_to_par", -1, 1], ["hole_relative_to_par", -2, 9], ["hole_relative_to_par", -3, 18]],
  ])
  assert.deepEqual(cherry.levels.map((level) => level.hardRequirements.map((requirement) => [requirement.kind, requirement.target, requirement.hole])), [
    [["relative_to_par", 6, undefined], ["hole_relative_to_par", 1, 2], ["hole_relative_to_par", 0, 10]],
    [["relative_to_par", 4, undefined], ["hole_relative_to_par", -1, 10]],
    [["relative_to_par", 2, undefined], ["hole_relative_to_par", 0, 2]],
    [["relative_to_par", 0, undefined], ["hole_relative_to_par", -1, 2], ["hole_relative_to_par", -2, 10]],
    [["relative_to_par", -2, undefined], ["hole_relative_to_par", 0, 1], ["hole_relative_to_par", -1, 9], ["hole_relative_to_par", -2, 18]],
  ])
  assert.equal(cherry.levels[3].hardRequirements[0].label, "Par or better")
})

test("Cherry Blossom evaluates the newest Level 1 Easy and Hard requirements", () => {
  const easyScores = cherryPars.map((par, index) => index < 2 ? par - 2 : index < 8 ? par - 1 : par)
  const easy = evaluateCourseChallengeRequirements(easyScores, cherryPars, cherry.levels[0].easyRequirements, "ready")
  assert.equal(easy.metrics.relativeToPar, -10)
  assert.equal(easy.status, "auto_pass")

  const hardScores = cherryPars.map((par) => par)
  hardScores[0] = cherryPars[0] + 5
  hardScores[1] = cherryPars[1] + 1
  const hard = evaluateCourseChallengeRequirements(hardScores, cherryPars, cherry.levels[0].hardRequirements, "ready")
  assert.equal(hard.metrics.relativeToPar, 6)
  assert.equal(hard.status, "auto_pass")
  const holeTwoMiss = [...hardScores]
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

test("photo totals and Course Pro/Master rewards remain wired as advanced stages", () => {
  const metrics = calculateCourseChallengeMetrics(touristScores, touristPars)
  assert.equal(comparePhotoTotal(metrics, 64, true), "passed")
  assert.equal(comparePhotoTotal(metrics, 63, true), "needs_review")
  assert.equal(compareEnteredFinalScore(metrics, metrics.relativeToPar), "passed")
  assert.equal(compareEnteredFinalScore(metrics, metrics.relativeToPar + 1), "needs_review")
  assert.equal(levelRewardDefinitions(tourist, 3).some((reward) => reward.label === "Course Pro"), false)
  assert.equal(levelRewardDefinitions(tourist, 5).some((reward) => reward.label === "Course Master"), false)
  assert.equal(tourist.prestigeStages?.[0].easyRequirements[0].target, -23)
  assert.equal(cherry.prestigeStages?.[0].easyRequirements[0].target, -28)
})

test("Course Pro and Course Master unlock only after the regular track", () => {
  assert.equal(isPrestigeStageUnlocked(tourist, 1, [3, 4, 5], []), false)
  assert.equal(isPrestigeStageUnlocked(tourist, 1, [1, 2, 3, 4, 5], []), true)
  assert.equal(isPrestigeStageUnlocked(tourist, 2, [1, 2, 3, 4, 5], []), false)
  assert.equal(isPrestigeStageUnlocked(tourist, 2, [1, 2, 3, 4, 5], [1]), true)
  assert.deepEqual(prestigeStageRewardDefinitions(cherry, 1).map((reward) => reward.label), ["Course Pro"])
  assert.deepEqual(prestigeStageRewardDefinitions(cherry, 2).map((reward) => reward.label), ["Course Master"])
})

test("Cherry Level 3 Easy is exactly -14 or better and has no hole side rules", () => {
  const requirement = cherry.levels[2].easyRequirements
  assert.deepEqual(requirement.map((item) => [item.kind, item.target, item.hole]), [["relative_to_par", -14, undefined]])
  const scoreAt = (improvement: number) => { let remaining = improvement; return cherryPars.map((par) => { const reduction = Math.min(par - 1, remaining); remaining -= reduction; return par - reduction }) }
  const atMinus14 = evaluateCourseChallengeRequirements(scoreAt(14), cherryPars, requirement, "ready")
  const atMinus13 = evaluateCourseChallengeRequirements(scoreAt(13), cherryPars, requirement, "ready")
  assert.equal(atMinus14.status, "auto_pass")
  assert.equal(atMinus13.status, "auto_fail")
})

test("Tourist Trap and Cherry Blossom expose the full four-stage Ace Track", () => {
  assert.equal(isAceChallengeUnlocked(tourist, []), true)
  assert.equal(isAceChallengeUnlocked(tourist, [1, 2]), true)
  assert.equal(isAceChallengeUnlocked(tourist, [1, 2, 3]), true)
  assert.deepEqual(tourist.aceStages?.map((stage) => [stage.key, stage.easyRequirements[0].target, stage.hardRequirements[0].target]), [["wader", 1, 1], ["chaser", 3, 3], ["hunter", 6, 6], ["legend", 9, 9]])
  assert.deepEqual(cherry.aceStages?.map((stage) => [stage.key, stage.easyRequirements[0].target, stage.hardRequirements[0].target]), [["wader", 1, 1], ["chaser", 3, 3], ["hunter", 6, 6], ["legend", 9, 9]])
  assert.deepEqual(aceStageRewardDefinitions(tourist).map((reward) => reward.rewardKey), [
    "course-challenge:tourist-trap:ace-wader",
    "course-challenge:tourist-trap:ace-chaser",
    "course-challenge:tourist-trap:ace-hunter",
    "course-challenge:tourist-trap:ace-legend",
  ])
  assert.equal(levelIsComplete("approved", "pending"), false)
  assert.equal(levelIsComplete("approved", "approved"), true)
})

test("unique Ace hole requirements evaluate from the cumulative unique-hole count", () => {
  const requirement = tourist.aceStages?.[1].easyRequirements[0]
  assert.ok(requirement)
  assert.equal(evaluateCourseChallengeRequirements([1, ...touristPars.slice(1)], touristPars, [requirement], "ready", { uniqueAceHoles: 3 }).status, "auto_pass")
  assert.equal(evaluateCourseChallengeRequirements([1, ...touristPars.slice(1)], touristPars, [requirement], "ready", { uniqueAceHoles: 2 }).status, "auto_fail")
})
