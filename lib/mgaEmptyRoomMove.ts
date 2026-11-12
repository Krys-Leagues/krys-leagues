import type { MgaRoom, MgaRoomSelection } from "@/lib/mgaRegular"

export function canMoveEmptyMgaRoom(room: MgaRoom, dayPublished: boolean): boolean {
  return !dayPublished && !room.published_at && room.player_count === 0
}

export function sameDayEmptyRoomMoveSlots(
  room: MgaRoom,
  timeSlots: MgaRoomSelection[],
): MgaRoomSelection[] {
  return timeSlots
    .filter((slot) => slot.day_key === room.day_key && slot.time_slot_id !== room.time_slot_id)
    .filter((slot, index, all) => all.findIndex((candidate) => candidate.time_slot_id === slot.time_slot_id) === index)
    .sort((a, b) => a.slot_number - b.slot_number)
}
