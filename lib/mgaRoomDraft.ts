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

export function roomSeatsAvailable(room: MgaRoom, assignments: MgaRoomAssignment[], registrationId: string) {
  const occupied = assignments.filter((item) => item.room_id === room.id && item.registration_id !== registrationId).length
  return Math.max(0, room.capacity - occupied)
}
