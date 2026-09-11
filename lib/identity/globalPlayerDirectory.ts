type PlayerRow = {
  id: string
  screen_name: string
  discord_id: string | null
  discord_name: string | null
  discord_username: string | null
  status: string | null
  active: boolean | null
}

type IdentityLinkRow = {
  historical_player_id: string
  canonical_player_id: string
}

type AliasRow = {
  player_id: string
  alias: string
  source: string | null
}

export type GlobalPlayerDirectoryEntry = {
  id: string
  screenName: string
  discordId: string | null
  discordName: string | null
  discordUsername: string | null
  discordLinked: boolean
  status: string | null
  active: boolean
  verifiedAliases: string[]
  identityAliases: Array<{ name: string; source: string | null }>
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

export function normalizeGlobalPlayerSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

export function globalPlayerMatchesSearch(player: GlobalPlayerDirectoryEntry, search: string) {
  const query = normalizeGlobalPlayerSearch(search)
  if (!query) return true

  return [player.screenName, ...player.verifiedAliases]
    .map(normalizeGlobalPlayerSearch)
    .some((candidate) => candidate.includes(query))
}

export function globalPlayerIdentitySummary(player: GlobalPlayerDirectoryEntry) {
  if (!player.discordLinked) return "Discord not linked"
  const name = player.discordName || player.discordUsername
  return name ? `Discord: ${name}` : "Discord linked"
}

export async function loadGlobalPlayerDirectory() {
  const response = await fetch("/api/admin/players?view=directory", { credentials: "same-origin", cache: "no-store" })
  const payload = await response.json() as { error?: string; players?: PlayerRow[]; links?: IdentityLinkRow[]; aliases?: AliasRow[] }
  if (!response.ok) throw new Error(payload.error || "Global player directory could not be loaded.")

  const players = (payload.players || []) as PlayerRow[]
  const links = new Map(
    ((payload.links || []) as IdentityLinkRow[]).map((link) => [
      link.historical_player_id,
      link.canonical_player_id,
    ]),
  )
  const aliasesByCanonicalId = new Map<string, Set<string>>()
  const identityAliasesByCanonicalId = new Map<string, Array<{ name: string; source: string | null }>>()

  for (const alias of (payload.aliases || []) as AliasRow[]) {
    const canonicalId = resolveCanonicalId(alias.player_id, links)
    const aliases = aliasesByCanonicalId.get(canonicalId) || new Set<string>()
    aliases.add(alias.alias)
    aliasesByCanonicalId.set(canonicalId, aliases)
    const identityAliases = identityAliasesByCanonicalId.get(canonicalId) || []
    if (!identityAliases.some(value => value.name === alias.alias)) identityAliases.push({ name: alias.alias, source: alias.source })
    identityAliasesByCanonicalId.set(canonicalId, identityAliases)
  }

  return players
    .filter((player) => resolveCanonicalId(player.id, links) === player.id)
    .map((player): GlobalPlayerDirectoryEntry => ({
      id: player.id,
      screenName: player.screen_name,
      discordId: player.discord_id,
      discordName: player.discord_name,
      discordUsername: player.discord_username,
      discordLinked: Boolean(player.discord_id?.trim()),
      status: player.status,
      active: player.active !== false && player.status !== "inactive" && player.status !== "archived",
      verifiedAliases: [...(aliasesByCanonicalId.get(player.id) || [])]
        .filter((alias) => normalizeGlobalPlayerSearch(alias) !== normalizeGlobalPlayerSearch(player.screen_name))
        .sort((left, right) => left.localeCompare(right)),
      identityAliases: (identityAliasesByCanonicalId.get(player.id) || []).sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.screenName.localeCompare(right.screenName))
}
