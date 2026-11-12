export const MGA_REGULAR_EVENT_ID = "c0b57945-4cda-4b0a-b533-821e87400893"

export const MGA_DAYS = [
  { key: "thursday", label: "Thursday", round: "Round 1" },
  { key: "friday", label: "Friday", round: "Round 2" },
  { key: "saturday", label: "Saturday", round: "Round 3" },
  { key: "sunday", label: "Sunday", round: "Final Round" },
] as const

export type MgaDayKey = (typeof MGA_DAYS)[number]["key"]

export type MgaRoomSelection = {
  day_key: MgaDayKey
  time_slot_id: string
  slot_number: number
  event_date: string
  starts_at: string
  eastern_label: string | null
  round_label: string | null
  course_name: string | null
}

export type MgaRoomPlayer = {
  registration_id: string
  canonical_player_id: string
  screen_name: string
  player_time_zone: string
  selections: MgaRoomSelection[]
}

export type MgaRoom = {
  id: string
  day_key: MgaDayKey
  time_slot_id: string
  room_number: number
  room_name: string
  capacity: number
  player_count: number
  published_at?: string | null
}

export type MgaRoomAssignment = {
  registration_id: string
  canonical_player_id: string
  day_key: MgaDayKey
  time_slot_id: string
  room_id: string
}

export type MgaRoomSnapshot = {
  room_capacity: number
  next_room_number: number
  days: Array<{ day_key: MgaDayKey; published_at: string | null }>
  time_slots: MgaRoomSelection[]
  players: MgaRoomPlayer[]
  rooms: MgaRoom[]
  assignments: MgaRoomAssignment[]
}

export function formatMgaLocalTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value))
}
