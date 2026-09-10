import assert from "node:assert/strict"
import test from "node:test"
import { allowedGameModes, isEligibleGameMode } from "./gameMode.ts"

test("Course Challenge mode eligibility changes at Level 3 and for Ace", () => {
  assert.deepEqual(allowedGameModes(1), ["solo", "multiplayer"])
  assert.deepEqual(allowedGameModes(2), ["solo", "multiplayer"])
  assert.deepEqual(allowedGameModes(3), ["multiplayer"])
  assert.deepEqual(allowedGameModes(5), ["multiplayer"])
  assert.deepEqual(allowedGameModes(3, "ace"), ["multiplayer"])
  assert.equal(isEligibleGameMode(1, "solo"), true)
  assert.equal(isEligibleGameMode(2, "multiplayer"), true)
  assert.equal(isEligibleGameMode(3, "solo"), false)
  assert.equal(isEligibleGameMode(3, "multiplayer"), true)
  assert.equal(isEligibleGameMode(1, "practice"), false)
})
