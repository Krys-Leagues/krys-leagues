import type { MgaRoom, MgaRoomAssignment, MgaRoomPlayer } from "@/lib/mgaRegular"

export type MgaRoomDraft = {
  room_name: string
  capacity: string
  registration_ids: string[]
}

export function makeMgaRoomDraft(room: MgaRoom, assignments: MgaRoomAssignment[], defaultCapacity: number): MgaRoomDraft {
  return {
    room_name: room.room_name,
    capacity: String(room.capacity || defaultCapacity),
    registration_ids: assignments.filter((item) => item.room_id === room.id).map((item) => item.registration_id).sort(),
  }
}

export function roomSaveRegistrationIds(draft: MgaRoomDraft, players: MgaRoomPlayer[]) {
  const registered = new Set(players.map((player) => player.registration_id))
  return [...new Set(draft.registration_ids)].filter((id) => registered.has(id)).sort()
}

export function roomDraftChanged(room: MgaRoom, draft: MgaRoomDraft, assignments: MgaRoomAssignment[], defaultCapacity: number) {
  const saved = makeMgaRoomDraft(room, assignments, defaultCapacity)
  return draft.room_name.trim() !== saved.room_name || Number(draft.capacity) !== Number(saved.capacity)
    || JSON.stringify([...new Set(draft.registration_ids)].sort()) !== JSON.stringify(saved.registration_ids)
}

export function roomAssignmentChoices(room: Pick<MgaRoom, "id" | "day_key">, players: MgaRoomPlayer[], assignments: MgaRoomAssignment[]) {
  const assignedElsewhere = new Set(assignments
    .filter((item) => item.day_key === room.day_key && item.room_id !== room.id)
    .map((item) => item.registration_id))
  return players.filter((player) => !assignedElsewhere.has(player.registration_id))
}

export function roomAssignmentConflicts(room: Pick<MgaRoom, "id" | "day_key">, registrationIds: string[], assignments: MgaRoomAssignment[]) {
  const selected = new Set(registrationIds)
  return [...new Set(assignments
    .filter((item) => item.day_key === room.day_key && item.room_id !== room.id && selected.has(item.registration_id))
    .map((item) => item.registration_id))]
}

export function canMoveRoomAssignment(currentTimeSlotId: string | null, currentRoomId: string | null, destinationTimeSlotId: string | null, destinationRoomId: string | null) {
  if (!currentTimeSlotId || !destinationTimeSlotId) return false
  if (currentTimeSlotId !== destinationTimeSlotId) return true
  return currentRoomId !== destinationRoomId && (currentRoomId !== null || destinationRoomId !== null)
}

export function roomSeatsAvailable(room: MgaRoom, assignments: MgaRoomAssignment[], registrationId: string) {
  const occupied = assignments.filter((item) => item.room_id === room.id && item.registration_id !== registrationId).length
  return Math.max(0, room.capacity - occupied)
}
