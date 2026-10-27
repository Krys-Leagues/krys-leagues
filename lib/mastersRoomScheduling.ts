export const MASTERS_ROOM_MAX_PLAYERS = 4

type MastersRoomSaveState = {
  finalized: boolean
  published: boolean
}

export type MastersRoomRepublishSnapshot = {
  groupLabel: string
  competition: string
  location: string | null
  instructions: string | null
  adminNotes: string | null
  finalized: boolean
  published: boolean
  entryIds: readonly string[]
}

const normalizedRoomText = (value: string | null | undefined) => value?.trim() || ""

function sameIds(left: readonly string[], right: readonly string[]) {
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return left.length === right.length
    && sortedLeft.every((value, index) => value === sortedRight[index])
}

export function isInstructionOnlyPublishedRoomRepublish(
  before: MastersRoomRepublishSnapshot,
  after: MastersRoomRepublishSnapshot,
) {
  return before.published
    && after.published
    && before.groupLabel.trim() === after.groupLabel.trim()
    && before.competition === after.competition
    && normalizedRoomText(before.location) === normalizedRoomText(after.location)
    && normalizedRoomText(before.adminNotes) === normalizedRoomText(after.adminNotes)
    && before.finalized === after.finalized
    && sameIds(before.entryIds, after.entryIds)
    && normalizedRoomText(before.instructions) !== normalizedRoomText(after.instructions)
}

export function validateMastersRoomPlayerIds(playerIds: readonly string[], state: MastersRoomSaveState): string | null {
  if (playerIds.length === 0) return "Select at least one player for this Masters room."
  if (playerIds.length > MASTERS_ROOM_MAX_PLAYERS) return `Masters rooms support a maximum of ${MASTERS_ROOM_MAX_PLAYERS} players.`
  if (new Set(playerIds).size !== playerIds.length) return "A player may appear only once in a Masters room."
  if (playerIds.length === 1 && (state.finalized || state.published)) return "A one-player Masters room is incomplete. Save it privately without finalizing until another player is assigned."
  return null
}
