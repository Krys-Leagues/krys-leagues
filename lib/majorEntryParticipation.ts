import type { MajorEntry } from "@/lib/majors"

export const ACTIVE_MAJOR_ENTRY_STATUSES = ["registered", "confirmed"] as const

export type MajorEntrantAddState = "available" | "already_active" | "reactivate_required" | "existing_conflict"

export function isActiveMajorEntryStatus(status: MajorEntry["status"]) {
  return ACTIVE_MAJOR_ENTRY_STATUSES.includes(status as (typeof ACTIVE_MAJOR_ENTRY_STATUSES)[number])
}

export function majorEntrantAddState(entries: MajorEntry[], playerId: string): MajorEntrantAddState {
  const existing = entries.find((entry) => entry.player_id === playerId)
  if (!existing) return "available"
  if (existing.status === "withdrawn") return "reactivate_required"
  if (isActiveMajorEntryStatus(existing.status)) return "already_active"
  return "existing_conflict"
}

export function majorRoomStateAfterWithdrawal(activePlayersRemaining: number) {
  if (activePlayersRemaining < 0 || activePlayersRemaining > 4) {
    throw new Error("Masters room player count must be between 0 and 4.")
  }

  return activePlayersRemaining >= 2
    ? { playable: true, publicationMustBeCleared: false, label: "PLAYABLE" as const }
    : { playable: false, publicationMustBeCleared: true, label: "NEEDS PLAYER — SOLO PLAY NOT ALLOWED" as const }
}

export function mayRemoveWithdrawnPlayerFromRoom(input: {
  roomStartsAt: string
  now: string
  hasScoreActivity: boolean
}) {
  return !input.hasScoreActivity && new Date(input.roomStartsAt).getTime() > new Date(input.now).getTime()
}
