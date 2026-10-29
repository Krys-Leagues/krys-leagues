import assert from "node:assert/strict"
import test from "node:test"
import { isMajorSlotMoveOutLocked, isMajorSlotStarted, MAJOR_PLAYER_MOVE_OUT_LOCK_HOURS } from "./majors.ts"

const slotStart = "2026-11-12T16:00:00.000Z"
const startMs = Date.parse(slotStart)

test("player move-out locks exactly 12 hours before the selected slot", () => {
  assert.equal(MAJOR_PLAYER_MOVE_OUT_LOCK_HOURS, 12)
  assert.equal(isMajorSlotMoveOutLocked(slotStart, startMs - 12 * 60 * 60 * 1000 - 1), false)
  assert.equal(isMajorSlotMoveOutLocked(slotStart, startMs - 12 * 60 * 60 * 1000), true)
})

test("started-slot boundary rejects a target at its start instant", () => {
  assert.equal(isMajorSlotStarted(slotStart, startMs - 1), false)
  assert.equal(isMajorSlotStarted(slotStart, startMs), true)
})
