export type CanonicalPlayerDisplayRow = {
  id: string
  screen_name: string | null
}

export type CanonicalPlayerDisplay = {
  label: string
  diagnosticId: string | null
}

/** Build the display lookup without filtering by active status. */
export function buildCanonicalPlayerMap(players: CanonicalPlayerDisplayRow[]) {
  return new Map(
    players
      .filter((player) => typeof player.screen_name === "string" && player.screen_name.length > 0)
      .map((player) => [player.id, player.screen_name!] as const),
  )
}

/** Keep unresolved IDs diagnostic-only instead of using them as player labels. */
export function resolveCanonicalPlayerDisplay(playerId: string, playerMap: Map<string, string>): CanonicalPlayerDisplay {
  const screenName = playerMap.get(playerId)
  return screenName
    ? { label: screenName, diagnosticId: null }
    : { label: "Unknown canonical player", diagnosticId: playerId }
}
