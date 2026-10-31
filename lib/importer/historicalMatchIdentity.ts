import type { PlayerIdentityAlias } from "@/lib/identity"
import type { PlayerRecord } from "./loadPlayers"

export type ExistingPlayerSearchResult = PlayerRecord & {
  aliases: string[]
  matchedBy: string[]
}

export type HistoricalStandingIdentityRpcArgs = {
  p_historical_match_standing_id: string
  p_approved_player_id: string | null
  p_resolution_note: string | null
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function searchExistingPlayers(
  players: PlayerRecord[],
  aliases: PlayerIdentityAlias[],
  search: string
): ExistingPlayerSearchResult[] {
  const query = normalized(search)
  if (!query) return []
  const aliasesByPlayer = new Map<string, string[]>()
  for (const alias of aliases) {
    const values = aliasesByPlayer.get(alias.playerId) ?? []
    values.push(alias.aliasName)
    aliasesByPlayer.set(alias.playerId, values)
  }

  return players.flatMap((player) => {
    const playerAliases = aliasesByPlayer.get(player.id) ?? []
    const evidence: Array<[string, string | null]> = [
      ["current screen name", player.screen_name],
      ["Discord name", player.discord_name],
      ["Discord username", player.discord_username],
      ["Discord ID", player.discord_id],
      ...playerAliases.map((alias): [string, string] => ["known alias", alias]),
    ]
    const matchedBy = Array.from(new Set(evidence
      .filter(([, value]) => value && normalized(value).includes(query))
      .map(([label]) => label)))
    return matchedBy.length ? [{ ...player, aliases: playerAliases, matchedBy }] : []
  }).slice(0, 30)
}

export function historicalStandingIdentityRpcArgs(
  standingId: string,
  playerId: string | null,
  note: string | null
): HistoricalStandingIdentityRpcArgs {
  return {
    p_historical_match_standing_id: standingId,
    p_approved_player_id: playerId,
    p_resolution_note: note,
  }
}
