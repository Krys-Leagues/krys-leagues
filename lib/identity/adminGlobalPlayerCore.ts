export type AdminGlobalPlayer = {
  id: string
  screen_name: string
}

export type AdminGlobalPlayerRow = AdminGlobalPlayer & {
  status: string | null
  active: boolean | null
}

export type AdminIdentityLinkRow = {
  historical_player_id: string
  canonical_player_id: string
}

function resolveCanonicalId(playerId: string, links: Map<string, string>) {
  const visited = new Set<string>()
  let current = playerId

  while (links.has(current) && !visited.has(current)) {
    visited.add(current)
    current = links.get(current)!
  }

  return current
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

export function canonicalAdminPlayerChoices(
  players: AdminGlobalPlayerRow[],
  identityLinks: AdminIdentityLinkRow[],
  search = "",
): AdminGlobalPlayer[] {
  const links = new Map(identityLinks.map((link) => [link.historical_player_id, link.canonical_player_id]))
  const query = normalizeSearch(search)

  return players
    .filter((player) => player.active !== false)
    .filter((player) => player.status !== "inactive" && player.status !== "archived")
    .filter((player) => resolveCanonicalId(player.id, links) === player.id)
    .filter((player) => !query || normalizeSearch(player.screen_name).includes(query))
    .map(({ id, screen_name }) => ({ id, screen_name }))
    .sort((left, right) => left.screen_name.localeCompare(right.screen_name))
}
