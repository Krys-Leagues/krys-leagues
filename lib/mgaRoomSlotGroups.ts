import type { MgaDayKey, MgaRoomPlayer, MgaRoomSelection } from "./mgaRegular"

export type MgaRoomSlotGroup = MgaRoomSelection & {
  players: MgaRoomPlayer[]
}

export function groupMgaRoomSlots(
  timeSlots: MgaRoomSelection[],
  players: MgaRoomPlayer[],
  dayKey: MgaDayKey,
): MgaRoomSlotGroup[] {
  const grouped = new Map<string, MgaRoomSlotGroup>()
  for (const slot of timeSlots) {
    if (slot.day_key === dayKey) grouped.set(slot.time_slot_id, { ...slot, players: [] })
  }

  for (const player of players) {
    for (const selection of player.selections || []) {
      if (selection.day_key !== dayKey) continue
      const group = grouped.get(selection.time_slot_id) || { ...selection, players: [] }
      group.players.push(player)
      grouped.set(selection.time_slot_id, group)
    }
  }

  return [...grouped.values()].sort(
    (a, b) => a.event_date.localeCompare(b.event_date) || a.slot_number - b.slot_number,
  )
}
