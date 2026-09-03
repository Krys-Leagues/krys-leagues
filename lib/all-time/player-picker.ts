export type CanonicalPlayerOption = {
  id: string
  screen_name: string
}

export function filterCanonicalPlayers<T extends CanonicalPlayerOption>(players: readonly T[], query: string, limit = 20) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery || limit <= 0) return [] as T[]
  return players
    .filter((player) => player.screen_name.toLowerCase().includes(normalizedQuery))
    .slice(0, limit)
}
