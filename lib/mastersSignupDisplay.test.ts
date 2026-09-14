import assert from "node:assert/strict"
import test from "node:test"

import { meaningfulMajorSlotLabel, PLAYER_LOCAL_TIME_HEADING } from "./mastersSignupDisplay.ts"

test("the local-time explanation is a single round-level heading", () => {
  assert.equal(PLAYER_LOCAL_TIME_HEADING, "AVAILABLE TIMES — SHOWN IN YOUR LOCAL TIME")
})

test("the redundant Available slot fallback is not rendered", () => {
  assert.equal(meaningfulMajorSlotLabel(null), null)
  assert.equal(meaningfulMajorSlotLabel(""), null)
  assert.equal(meaningfulMajorSlotLabel("Available"), null)
  assert.equal(meaningfulMajorSlotLabel("AVAILABLE"), null)
  assert.equal(meaningfulMajorSlotLabel("Early evening"), "Early evening")
})
