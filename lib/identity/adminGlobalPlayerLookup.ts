import "server-only"

import { createClient } from "@supabase/supabase-js"

import { canonicalAdminPlayerChoices, type AdminGlobalPlayerRow, type AdminIdentityLinkRow } from "@/lib/identity/adminGlobalPlayerCore"

export { canonicalAdminPlayerChoices } from "@/lib/identity/adminGlobalPlayerCore"

function createAdminDataClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Admin Global Players server access is not configured.")

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type AdminGlobalPlayerDirectoryEntry = {
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

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

export async function loadAdminGlobalPlayerDirectory(search = "") {
  const client = createAdminDataClient()
  const [playersResult, linksResult, aliasesResult] = await Promise.all([
    client
      .from("players")
      .select("id,screen_name,discord_id,discord_name,discord_username,status,active")
      .order("screen_name"),
    client
      .from("player_identity_links")
      .select("historical_player_id,canonical_player_id"),
    client
      .from("player_aliases")
      .select("player_id,alias,source")
      .eq("verified", true)
      .order("alias"),
  ])

  const error = playersResult.error || linksResult.error || aliasesResult.error
  if (error) throw error

  const players = (playersResult.data ?? []) as Array<{
    id: string
    screen_name: string
    discord_id: string | null
    discord_name: string | null
    discord_username: string | null
    status: string | null
    active: boolean | null
  }>
  const links = new Map(
    ((linksResult.data ?? []) as AdminIdentityLinkRow[]).map((link) => [
      link.historical_player_id,
      link.canonical_player_id,
    ]),
  )
  const aliasesByCanonicalId = new Map<string, Set<string>>()
  const identityAliasesByCanonicalId = new Map<string, Array<{ name: string; source: string | null }>>()

  for (const alias of (aliasesResult.data ?? []) as Array<{ player_id: string; alias: string; source: string | null }>) {
    const canonicalId = resolveCanonicalId(alias.player_id, links)
    const aliases = aliasesByCanonicalId.get(canonicalId) || new Set<string>()
    aliases.add(alias.alias)
    aliasesByCanonicalId.set(canonicalId, aliases)
    const identityAliases = identityAliasesByCanonicalId.get(canonicalId) || []
    if (!identityAliases.some((value) => value.name === alias.alias)) identityAliases.push({ name: alias.alias, source: alias.source })
    identityAliasesByCanonicalId.set(canonicalId, identityAliases)
  }

  const query = normalizeSearch(search)
  return players
    .filter((player) => player.active !== false && player.status !== "inactive" && player.status !== "archived")
    .filter((player) => resolveCanonicalId(player.id, links) === player.id)
    .map((player): AdminGlobalPlayerDirectoryEntry => ({
      id: player.id,
      screenName: player.screen_name,
      discordId: player.discord_id,
      discordName: player.discord_name,
      discordUsername: player.discord_username,
      discordLinked: Boolean(player.discord_id?.trim()),
      status: player.status,
      active: true,
      verifiedAliases: [...(aliasesByCanonicalId.get(player.id) || [])]
        .filter((alias) => normalizeSearch(alias) !== normalizeSearch(player.screen_name))
        .sort((left, right) => left.localeCompare(right)),
      identityAliases: (identityAliasesByCanonicalId.get(player.id) || []).sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .filter((player) => !query || [player.screenName, ...player.verifiedAliases].some((value) => normalizeSearch(value).includes(query)))
    .sort((left, right) => left.screenName.localeCompare(right.screenName))
}

export async function loadAdminGlobalPlayers(search = "") {
  const client = createAdminDataClient()
  const [playersResult, linksResult] = await Promise.all([
    client
      .from("players")
      .select("id,screen_name,status,active")
      .order("screen_name"),
    client
      .from("player_identity_links")
      .select("historical_player_id,canonical_player_id"),
  ])

  const error = playersResult.error || linksResult.error
  if (error) throw error

  return canonicalAdminPlayerChoices(
    (playersResult.data ?? []) as AdminGlobalPlayerRow[],
    (linksResult.data ?? []) as AdminIdentityLinkRow[],
    search,
  )
}
