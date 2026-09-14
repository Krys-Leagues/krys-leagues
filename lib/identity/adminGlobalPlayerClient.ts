export type ProtectedAdminGlobalPlayer = {
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

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

export function globalPlayerMatchesSearch(player: ProtectedAdminGlobalPlayer, search: string) {
  const query = normalizeSearch(search)
  if (!query) return true
  return [player.screenName, ...player.verifiedAliases]
    .map(normalizeSearch)
    .some((candidate) => candidate.includes(query))
}

export function globalPlayerIdentitySummary(player: ProtectedAdminGlobalPlayer) {
  if (!player.discordLinked) return "Discord not linked"
  const name = player.discordName || player.discordUsername
  return name ? `Discord: ${name}` : "Discord linked"
}

export async function loadProtectedAdminGlobalPlayers(search = "") {
  const response = await fetch(`/api/admin/records/player-search?q=${encodeURIComponent(search)}&details=identity`, {
    cache: "no-store",
  })
  const payload = await response.json() as { players?: unknown; error?: unknown }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Global Players could not be loaded.")
  }
  if (!Array.isArray(payload.players)) return []

  return payload.players.filter((player): player is ProtectedAdminGlobalPlayer => {
    if (!player || typeof player !== "object") return false
    const value = player as Partial<ProtectedAdminGlobalPlayer>
    return typeof value.id === "string" && typeof value.screenName === "string"
  })
}
