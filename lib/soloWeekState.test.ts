import assert from "node:assert/strict"
import test from "node:test"
import { selectLiveSoloWeek, soloWeekDisplayState } from "./soloWeekState.ts"

const weeks = [
  { week_number: 1, status: "open" as const, due_date: "2026-10-04" },
  { week_number: 2, status: "open" as const, due_date: "2026-10-11" },
  { week_number: 3, status: "open" as const, due_date: "2026-10-18" },
]

test("a passed open week rolls the live board to the next open week", () => {
  assert.equal(selectLiveSoloWeek(weeks, "2026-10-05")?.week_number, 2)
})

test("the passed week remains open and is awaiting manual finalization", () => {
  assert.equal(soloWeekDisplayState(weeks[0], "2026-10-05"), "ENDED — AWAITING FINALIZATION")
  assert.equal(weeks[0].status, "open")
})

test("a current open week remains live before its deadline", () => {
  assert.equal(selectLiveSoloWeek(weeks, "2026-10-03")?.week_number, 1)
  assert.equal(soloWeekDisplayState(weeks[0], "2026-10-03"), "LIVE")
})

test("closed history is distinct from an ended open week", () => {
  assert.equal(soloWeekDisplayState({ week_number: 1, status: "closed", due_date: "2026-10-04" }, "2026-10-05"), "CLOSED")
})
