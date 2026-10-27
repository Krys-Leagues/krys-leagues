import assert from "node:assert/strict"
import test from "node:test"
import { buildPlayerHandicapDisplay } from "./playerDisplay.ts"
import type { HandicapIndex } from "./engine.ts"

function index(overrides: Partial<HandicapIndex> = {}): HandicapIndex {
  return {
    playerId: "11111111-1111-4111-8111-111111111111",
    index: 2.4,
    latestRoundCount: 20,
    selectedRoundCount: 20,
    selectedSourceKeys: ["r1"],
    latestSourceKeys: ["r1", "r2"],
    ratingVersionIds: ["rating-v1"],
    chronologyConfidence: "EXACT",
    publicationStatus: "PUBLISHED",
    ...overrides,
  }
}

test("published player display preserves canonical identity and rating references", () => {
  const display = buildPlayerHandicapDisplay({ screenName: "Raccoons_whisker", index: index() })
  assert.equal(display.screenName, "Raccoons_whisker")
  assert.equal(display.status, "PUBLISHED")
  assert.equal(display.displayIndex, "2.40")
  assert.deepEqual(display.ratingVersionIds, ["rating-v1"])
})

test("player-facing display uses golf notation while retaining the signed index", () => {
  const display = buildPlayerHandicapDisplay({ screenName: "Player A", index: index({ index: -2.15 }) })
  assert.equal(display.index, -2.15)
  assert.equal(display.displayIndex, "+2.15")
})

test("non-exact chronology is preview-only and never presented as published", () => {
  const display = buildPlayerHandicapDisplay({
    screenName: "Player B",
    index: index({ chronologyConfidence: "PERIOD_WINDOW", publicationStatus: "UNPUBLISHED_CHRONOLOGY", handicapStatus: "OFFICIAL_ELIGIBLE" }),
  })
  assert.equal(display.status, "PREVIEW_ONLY")
  assert.match(display.notice, /chronology/i)
})

