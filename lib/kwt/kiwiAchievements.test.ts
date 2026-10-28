import assert from "node:assert/strict"
import test from "node:test"
import { calculateKwtKiwiAchievements } from "./kiwiAchievements.ts"

const pars = Array.from({ length: 18 }, () => 3)
const clean = (value: number) => Array.from({ length: 18 }, () => value)

test("bogey-free Easy earns Green Kiwi from the original card", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: clean(2), hardHoles: clean(4), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_EASY"])
  assert.equal(result.easyBogeys, 0)
  assert.equal(result.hardBogeys, 18)
})

test("bogey-free Hard earns Gold Kiwi", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: clean(4), hardHoles: clean(2), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_HARD"])
})

test("bogey-free Easy and Hard earns one Coconut in addition to the two round badges", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: clean(2), hardHoles: clean(2), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_EASY", "KIWI_HARD", "COCONUT"])
})

test("one hole above par disqualifies only the affected round", () => {
  const easy = clean(2)
  easy[7] = 4
  const result = calculateKwtKiwiAchievements({ easyHoles: easy, hardHoles: clean(2), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_HARD"])
  assert.equal(result.easyBogeys, 1)
})

test("invalid or incomplete evidence is not treated as bogey-free", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: clean(2).slice(0, 17), hardHoles: clean(2), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, [])
  assert.match(result.errors[0], /exactly 18 holes/)
})

test("scorecard achievements do not depend on NET eligibility or division", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: clean(2), hardHoles: clean(2), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_EASY", "KIWI_HARD", "COCONUT"])
})

