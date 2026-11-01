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

export function getDiscordPlayerLoginDestination(
  resolution: DiscordPlayerLoginResolution,
  requestedDestination: string | null,
) {
  if (resolution?.resolution_status === "matched" && resolution.canonical_player_id) {
    return requestedDestination || "/dashboard"
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
