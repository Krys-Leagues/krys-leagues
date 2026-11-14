import assert from "node:assert/strict"
import test from "node:test"
import { groupMgaRoomSlots } from "./mgaRoomSlotGroups.ts"
import type { MgaRoomPlayer, MgaRoomSelection } from "./mgaRegular"

const makeSlot = (time_slot_id: string, slot_number: number, day_key: "thursday" | "friday" = "thursday"): MgaRoomSelection => ({
  day_key,
  time_slot_id,
  slot_number,
  event_date: day_key === "thursday" ? "2026-11-12" : "2026-11-13",
  starts_at: "2026-11-12T13:00:00Z",
  eastern_label: null,
  round_label: null,
  course_name: "Gardens of Babylon",
})

test("includes empty booked slots so their existing rooms remain visible", () => {
  const emptyRoomSlot = makeSlot("slot-5", 5)
  const bookedSlot = makeSlot("slot-6", 6)
  const fridaySlot = makeSlot("friday-slot-1", 1, "friday")
  const player = {
    registration_id: "registration-1",
    canonical_player_id: "player-1",
    screen_name: "ExamplePlayer",
    player_time_zone: "America/New_York",
    selections: [bookedSlot, fridaySlot],
  } satisfies MgaRoomPlayer

  const result = groupMgaRoomSlots([emptyRoomSlot, bookedSlot, fridaySlot], [player], "thursday")

  assert.deepEqual(result.map((group) => group.time_slot_id), ["slot-5", "slot-6"])
  assert.equal(result[0].players.length, 0)
  assert.deepEqual(result[1].players.map((entry) => entry.registration_id), ["registration-1"])

  const movedPlayer = { ...player, registration_id: "registration-2", selections: [emptyRoomSlot] }
  const afterMove = groupMgaRoomSlots([emptyRoomSlot], [movedPlayer], "thursday")
  assert.deepEqual(afterMove[0].players.map((entry) => entry.registration_id), ["registration-2"])
})
