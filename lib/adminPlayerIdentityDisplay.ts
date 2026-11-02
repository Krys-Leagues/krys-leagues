export type AdminIdentityPlayer = {
  id: string
  screen_name: string
  discord_id?: string | null
}

export type AdminIdentityLink = {
  historical_player_id: string
  canonical_player_id: string
}

export type AdminPlayerIdentityDisplay =
  | {
      kind: "canonical"
      canonicalUuid: string
      discordId: string | null
    }
  | {
      kind: "merged"
      originalUuid: string
      destinationUuid: string
      destinationName: string | null
      discordId: string | null
    }

export function buildAdminPlayerIdentityDisplay(
  player: AdminIdentityPlayer,
  identityLink: AdminIdentityLink | undefined,
  destinationPlayer: AdminIdentityPlayer | undefined,
): AdminPlayerIdentityDisplay {
  if (!identityLink) {
    return {
      kind: "canonical",
      canonicalUuid: player.id,
      discordId: player.discord_id ?? null,
    }
  }

  return {
    kind: "merged",
    originalUuid: player.id,
    destinationUuid: identityLink.canonical_player_id,
    destinationName: destinationPlayer?.screen_name ?? null,
    discordId: player.discord_id ?? null,
  }
}
