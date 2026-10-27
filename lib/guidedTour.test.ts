import assert from "node:assert/strict"
import test from "node:test"
import { GUIDED_TOUR_STEPS, TOUR_DEFINITIONS, guidedTourStorageKey, guidedTourStepPath, isTourOfferSafePath } from "./guidedTour.ts"

test("guided tour covers the approved player journey in deterministic order", () => {
  assert.deepEqual(GUIDED_TOUR_STEPS.map((step) => step.id), [
    "main-hub", "player-profiles", "player-search", "my-profile", "handicap-tile", "handicap-history", "handicap-help",
    "leaderboards", "leaderboard-difficulty", "leaderboard-types", "leaderboard-course", "leaderboard-player",
    "course-challenges", "course-select", "course-book", "course-levels", "course-rewards", "course-evidence",
    "league-play", "join-leagues", "tournaments", "scorecards", "tour-help",
  ])
})

test("tour copy describes the confirmed rolling-20 and verified-score rules", () => {
  const copy = GUIDED_TOUR_STEPS.map((step) => `${step.title} ${step.description}`).join(" ")
  assert.match(copy, /rolling-20/i)
  assert.match(copy, /verified/i)
  assert.match(copy, /canonical profile/i)
})

test("area tours use live controls and remain view-only", () => {
  assert.equal(TOUR_DEFINITIONS.leaderboards.steps.length, 5)
  assert.equal(TOUR_DEFINITIONS.leaderboards.steps.some((step) => step.actionTarget), true)
  assert.equal(TOUR_DEFINITIONS.courseChallenges.steps.length, 6)
  assert.equal(TOUR_DEFINITIONS.courseChallenges.steps.some((step) => step.actionTarget), true)
  assert.match(TOUR_DEFINITIONS.courseChallenges.steps.map((step) => step.description).join(" "), /never submits/i)
})

test("tour storage and paths remain player-bound", () => {
  const playerId = "036372cc-f3a5-4da9-aaa5-6edae9e6c1ca"
  assert.equal(guidedTourStorageKey(playerId), `krys-leagues:guided-tour:v1:${playerId}`)
  assert.equal(guidedTourStepPath(GUIDED_TOUR_STEPS[3], playerId), `/players/${playerId}`)
  assert.equal(isTourOfferSafePath("/"), true)
  assert.equal(isTourOfferSafePath("/admin/players"), false)
  assert.equal(isTourOfferSafePath("/scorecards"), false)
})
