export type AdminPlayer = {
  id: string
  screen_name: string
  discord_id: string | null
  discord_name: string | null
  discord_username: string | null
  discord_avatar: string | null
  status: string | null
  active: boolean | null
  division: string | null
  avatar_path: string | null
  is_server_booster: boolean
  has_krys_server_tag: boolean
  profile_badges: string[]
}

type AdminPlayersResponse = {
  players?: AdminPlayer[]
  leagueMemberships?: Array<{
    player_id: string | null
    league_type: string
    season_number: number
    division: string
  }>
  tournamentEntries?: Array<{
    player_id: string | null
    tournament_type: string
    bracket: string | null
    status: string | null
  }>
  identityLinks?: Array<{
    historical_player_id: string
    canonical_player_id: string
  }>
  error?: string
}

export async function loadProtectedAdminPlayerDirectory() {
  const response = await fetch("/api/admin/players", {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => null) as AdminPlayersResponse | null

  if (!response.ok) {
    throw new Error(payload?.error || "Global Players could not be loaded.")
  }

  if (!Array.isArray(payload?.players)
    || !Array.isArray(payload.leagueMemberships)
    || !Array.isArray(payload.tournamentEntries)
    || !Array.isArray(payload.identityLinks)) {
    throw new Error("Global Players returned an invalid response.")
  }

  return {
    players: payload.players.map((player) => ({
      ...player,
      is_server_booster: Boolean(player.is_server_booster),
      has_krys_server_tag: Boolean(player.has_krys_server_tag),
      profile_badges: Array.isArray(player.profile_badges)
        ? player.profile_badges.filter((badge): badge is string => typeof badge === "string")
        : [],
    })),
    leagueMemberships: payload.leagueMemberships,
    tournamentEntries: payload.tournamentEntries,
    identityLinks: payload.identityLinks,
  }
}

export async function loadProtectedAdminPlayers() {
  return (await loadProtectedAdminPlayerDirectory()).players
}

export async function loadProtectedAdminPlayersResult() {
  try {
    return { data: await loadProtectedAdminPlayers(), error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Global Players could not be loaded."),
    }
  }
}
