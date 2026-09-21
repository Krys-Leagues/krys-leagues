import assert from "node:assert/strict"
import test from "node:test"
import { allowedGameModes, courseChallengeGameModeError, isEligibleGameMode, normalizeCourseChallengeGameMode } from "./gameMode.ts"

test("Course Challenge mode eligibility changes at Level 3 while Ace has no game-mode policy", () => {
  assert.deepEqual(allowedGameModes(1), ["solo", "multiplayer"])
  assert.deepEqual(allowedGameModes(2), ["solo", "multiplayer"])
  assert.deepEqual(allowedGameModes(3), ["multiplayer"])
  assert.deepEqual(allowedGameModes(5), ["multiplayer"])
  assert.deepEqual(allowedGameModes(1, "ace"), [])
  assert.deepEqual(allowedGameModes(1, "prestige"), ["multiplayer"])
  assert.equal(isEligibleGameMode(1, "solo"), true)
  assert.equal(isEligibleGameMode(2, "multiplayer"), true)
  assert.equal(isEligibleGameMode(3, "solo"), false)
  assert.equal(isEligibleGameMode(3, "multiplayer"), true)
  assert.equal(isEligibleGameMode(1, "multiplayer", "prestige"), true)
  assert.equal(isEligibleGameMode(1, "practice"), false)
})

test("admin game-mode verification is explicit and preserves authoritative rules", () => {
  assert.equal(normalizeCourseChallengeGameMode("solo"), "solo")
  assert.equal(normalizeCourseChallengeGameMode("multiplayer"), "multiplayer")
  assert.equal(normalizeCourseChallengeGameMode("MULTIPLAYER"), null)
  assert.equal(courseChallengeGameModeError(1, null), "Select verified Solo or Multiplayer before approving this Course Challenge card.")
  assert.equal(courseChallengeGameModeError(1, "solo"), null)
  assert.equal(courseChallengeGameModeError(2, "multiplayer"), null)
  assert.equal(courseChallengeGameModeError(3, "solo"), "This Course Challenge requirement must be verified as Multiplayer before approval.")
  assert.equal(courseChallengeGameModeError(1, null, "ace"), null)
  assert.equal(courseChallengeGameModeError(1, "solo", "ace"), null)
  assert.equal(courseChallengeGameModeError(1, "solo", "prestige"), "This Course Challenge requirement must be verified as Multiplayer before approval.")
  assert.equal(courseChallengeGameModeError(5, "multiplayer"), null)
  assert.equal(courseChallengeGameModeError(1, "multiplayer", "ace"), null)
})

test("Ace Wader, Chaser, Hunter, and Legend all ignore missing or stored game modes", () => {
  for (const stage of ["Wader", "Chaser", "Hunter", "Legend"]) {
    assert.equal(courseChallengeGameModeError(1, null, "ace"), null, stage)
    assert.equal(courseChallengeGameModeError(1, "solo", "ace"), null, stage)
    assert.equal(courseChallengeGameModeError(1, "multiplayer", "ace"), null, stage)
  }
})
