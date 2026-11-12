import assert from "node:assert/strict"
import { test } from "node:test"
import { canMoveRoomAssignment, roomAssignmentChoices, roomAssignmentConflicts } from "../lib/mgaRoomDraft.ts"

const dayKey = "thursday" as const
const publishedRoom = { id: "room-kmga2", day_key: dayKey, time_slot_id: "slot-2", published_at: "2026-11-12T16:35:59Z" }
const emptyDraftRoom = { id: "room-kmga4", day_key: dayKey, time_slot_id: "slot-2", published_at: null }
const players = [
  { registration_id: "calassy-registration", canonical_player_id: "calassy-player", screen_name: "Calassy", player_time_zone: "America/New_York", selections: [] },
  { registration_id: "yankee-registration", canonical_player_id: "yankee-player", screen_name: "YANKEEDUDE1123", player_time_zone: "America/New_York", selections: [] },
  { registration_id: "unassigned-registration", canonical_player_id: "unassigned-player", screen_name: "Unassigned Player", player_time_zone: "America/New_York", selections: [] },
]
const assignments = [
  { registration_id: "calassy-registration", canonical_player_id: "calassy-player", day_key: dayKey, time_slot_id: "slot-2", room_id: publishedRoom.id },
  { registration_id: "yankee-registration", canonical_player_id: "yankee-player", day_key: dayKey, time_slot_id: "slot-2", room_id: publishedRoom.id },
]

test("published-room players stay visible there but are excluded from another room's assignment options", () => {
  assert.deepEqual(roomAssignmentChoices(publishedRoom, players, assignments).map((player) => player.registration_id), [
    "calassy-registration", "yankee-registration", "unassigned-registration",
  ])
  assert.deepEqual(roomAssignmentChoices(emptyDraftRoom, players, assignments).map((player) => player.registration_id), [
    "unassigned-registration",
  ])
})

test("stale draft selections for players already assigned elsewhere are rejected before Save Room", () => {
  assert.deepEqual(roomAssignmentConflicts(emptyDraftRoom, ["calassy-registration", "yankee-registration"], assignments), [
    "calassy-registration", "yankee-registration",
  ])
  assert.deepEqual(roomAssignmentConflicts(publishedRoom, ["calassy-registration"], assignments), [])
})

test("assignments on other tournament days do not hide a player from this day's rooms", () => {
  const fridayAssignment = { registration_id: "unassigned-registration", canonical_player_id: "unassigned-player", day_key: "friday" as const, time_slot_id: "friday-slot", room_id: "friday-room" }
  assert.deepEqual(roomAssignmentChoices(emptyDraftRoom, players, [...assignments, fridayAssignment]).map((player) => player.registration_id), [
    "unassigned-registration",
  ])
})

test("same-slot room transfer is available only when the destination differs from the current room", () => {
  assert.equal(canMoveRoomAssignment("slot-2", publishedRoom.id, "slot-2", emptyDraftRoom.id), true)
  assert.equal(canMoveRoomAssignment("slot-2", publishedRoom.id, "slot-2", null), true)
  assert.equal(canMoveRoomAssignment("slot-2", publishedRoom.id, "slot-2", publishedRoom.id), false)
  assert.equal(canMoveRoomAssignment("slot-2", null, "slot-2", null), false)
  assert.equal(canMoveRoomAssignment("slot-2", publishedRoom.id, "slot-3", null), true)
})
