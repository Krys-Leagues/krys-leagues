import assert from "node:assert/strict"
import test from "node:test"
import type { MgaRoom, MgaRoomSelection } from "../lib/mgaRegular.ts"
import { canMoveEmptyMgaRoom, sameDayEmptyRoomMoveSlots } from "../lib/mgaEmptyRoomMove.ts"

const room: MgaRoom = {
  id: "room-5",
  day_key: "thursday",
  time_slot_id: "slot-4",
  room_number: 5,
  room_name: "KMGA5",
  capacity: 4,
  player_count: 0,
  published_at: null,
}
const slots: MgaRoomSelection[] = [
  { day_key: "thursday", time_slot_id: "slot-4", slot_number: 4, event_date: "2026-11-12", starts_at: "2026-11-12T11:00:00Z", eastern_label: null, round_label: null, course_name: null },
  { day_key: "thursday", time_slot_id: "slot-6", slot_number: 6, event_date: "2026-11-12", starts_at: "2026-11-12T15:00:00Z", eastern_label: null, round_label: null, course_name: null },
  { day_key: "thursday", time_slot_id: "slot-7", slot_number: 7, event_date: "2026-11-12", starts_at: "2026-11-12T17:00:00Z", eastern_label: null, round_label: null, course_name: null },
  { day_key: "friday", time_slot_id: "friday-slot-1", slot_number: 1, event_date: "2026-11-13", starts_at: "2026-11-13T05:00:00Z", eastern_label: null, round_label: null, course_name: null },
]

test("allows same-day relocation for an empty unpublished room", () => {
  assert.equal(canMoveEmptyMgaRoom(room, false), true)
  assert.deepEqual(sameDayEmptyRoomMoveSlots(room, slots).map((slot) => slot.time_slot_id), ["slot-6", "slot-7"])
})

test("does not depend on chronological room numbering or other rooms in the destination slot", () => {
  const anotherRoomAlreadyInSlot6 = { ...room, id: "room-6", room_number: 6, room_name: "KMGA6", time_slot_id: "slot-6" }
  const choices = sameDayEmptyRoomMoveSlots(room, slots)
  assert.equal(choices.some((slot) => slot.time_slot_id === anotherRoomAlreadyInSlot6.time_slot_id), true)
  assert.equal(room.id, "room-5")
  assert.equal(room.room_number, 5)
  assert.equal(room.room_name, "KMGA5")
})

test("rejects occupied, published, or day-published rooms", () => {
  assert.equal(canMoveEmptyMgaRoom({ ...room, player_count: 1 }, false), false)
  assert.equal(canMoveEmptyMgaRoom({ ...room, published_at: "2026-11-12T12:00:00Z" }, false), false)
  assert.equal(canMoveEmptyMgaRoom(room, true), false)
})

test("never offers a destination on another tournament day", () => {
  assert.deepEqual(
    sameDayEmptyRoomMoveSlots(room, slots).map((slot) => slot.day_key),
    ["thursday", "thursday"],
  )
})
