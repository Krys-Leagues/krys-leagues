export const MASTERS_ROOM_MAX_PLAYERS = 4

export function validateMastersRoomPlayerIds(playerIds: readonly string[]): string | null {
  if (playerIds.length === 0) return "Select at least one player for this Masters room."
  if (playerIds.length > MASTERS_ROOM_MAX_PLAYERS) return `Masters rooms support a maximum of ${MASTERS_ROOM_MAX_PLAYERS} players.`
  if (new Set(playerIds).size !== playerIds.length) return "A player may appear only once in a Masters room."
  return null
}
