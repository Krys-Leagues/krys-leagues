import assert from "node:assert/strict"
import { test } from "node:test"
import { normalizeMgaRoomNameInput, roomNumberName } from "../lib/mgaRoomNumber.ts"

test("manual MGA room entry always produces the fixed KMGA prefix", () => {
  assert.equal(normalizeMgaRoomNameInput("31"), "KMGA31")
  assert.equal(normalizeMgaRoomNameInput("KMGA31"), "KMGA31")
  assert.equal(normalizeMgaRoomNameInput(" kmga 031 "), "KMGA31")
  assert.equal(normalizeMgaRoomNameInput("0"), null)
  assert.equal(normalizeMgaRoomNameInput("31A"), null)
})

test("stored KMGA names are compared by number for duplicate protection", () => {
  assert.equal(roomNumberName("KMGA31"), "KMGA31")
  assert.equal(roomNumberName("kmga 031"), "KMGA31")
  assert.equal(roomNumberName("Room 31"), null)
})
