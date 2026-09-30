export type DiscordPlayerLoginResolution = {
  resolution_status?: "matched" | "no_match" | "conflict"
  canonical_player_id?: string | null
} | null

export function getAuthenticatedDiscordId(user: {
  identities?: Array<{
    provider?: string
    identity_data?: Record<string, unknown>
  }>
}) {
  const discordIdentity = user.identities?.find((identity) => identity.provider === "discord")
  const identityData = discordIdentity?.identity_data
  const value = identityData?.provider_id ?? identityData?.id ?? identityData?.sub
  return typeof value === "string" ? value.trim() : ""
}

export function getAuthenticatedDiscordName(user: {
  user_metadata?: Record<string, unknown>
  identities?: Array<{
    provider?: string
    identity_data?: Record<string, unknown>
  }>
}) {
  const discordIdentity = user.identities?.find((identity) => identity.provider === "discord")
  const sources = [user.user_metadata, discordIdentity?.identity_data]
  for (const source of sources) {
    for (const key of ["global_name", "preferred_username", "username", "name"]) {
      const value = source?.[key]
      if (typeof value === "string" && value.trim()) return value.trim()
    }
  }
  return ""
}

export function getDiscordPlayerLoginDestination(
  resolution: DiscordPlayerLoginResolution,
  requestedDestination: string | null,
) {
  if (resolution?.resolution_status === "matched" && resolution.canonical_player_id) {
    return requestedDestination || "/player-dashboard"
  }

  if (resolution?.resolution_status === "no_match") {
    return requestedDestination?.startsWith("/register") ||
      requestedDestination?.startsWith("/testing-access") ||
      requestedDestination === "/join"
      ? requestedDestination
      : "/join"
  }

  return null
}
