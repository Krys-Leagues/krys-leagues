import assert from "node:assert/strict"
import { test } from "node:test"
import { calculateKwtKiwiAchievements } from "./kiwiAchievements.ts"

const pars = Array.from({ length: 18 }, () => 3)
const card = (strokes: number) => Array.from({ length: 18 }, () => strokes)

test("a bogey-free Easy card earns Green Kiwi", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: card(3), hardHoles: [4, ...card(3).slice(1)], easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_EASY"])
})

test("a bogey-free Hard card earns Gold Kiwi", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: [4, ...card(3).slice(1)], hardHoles: card(3), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_HARD"])
})

test("Coconut replaces both individual Kiwi awards", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: card(3), hardHoles: card(3), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["COCONUT"])
})

test("a bogey on either card prevents the corresponding award", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: [4, ...card(3).slice(1)], hardHoles: card(3), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_HARD"])
})

test("a score above bogey also prevents an award", () => {
  const result = calculateKwtKiwiAchievements({ easyHoles: [5, ...card(3).slice(1)], hardHoles: card(3), easyPars: pars, hardPars: pars })
  assert.deepEqual(result.badges, ["KIWI_HARD"])
})
