export type CanonicalPublicPlayer = {
  id: string
  screen_name: string
  status: string | null
  active: boolean | null
  avatar_path: string | null
  is_server_booster: boolean
  has_krys_server_tag: boolean
  profile_badges: string[]
  identity_player_ids: string[]
}

export type CanonicalIdentity = {
  canonical_player_id: string
  identity_player_ids: string[] | null
}

export type PublicPlayerRow = Omit<CanonicalPublicPlayer, "identity_player_ids">

export function buildCanonicalPublicPlayerChoices(
  players: PublicPlayerRow[],
  identities: Array<CanonicalIdentity | null>,
) {
  const canonicalPlayers = new Map<string, CanonicalPublicPlayer>()

  for (let index = 0; index < players.length; index += 1) {
    const player = players[index]
    const status = player.status?.trim().toLowerCase()
    const identity = identities[index]

    if (player.active !== true || status === "merged" || status === "retired" || status === "archived") continue
    if (!identity || identity.canonical_player_id !== player.id) continue

    canonicalPlayers.set(player.id, {
      ...player,
      identity_player_ids:
        identity.identity_player_ids && identity.identity_player_ids.length > 0
          ? Array.from(new Set(identity.identity_player_ids))
          : [player.id],
    })
  }

  return Array.from(canonicalPlayers.values()).sort((left, right) =>
    left.screen_name.localeCompare(right.screen_name)
  )
}
