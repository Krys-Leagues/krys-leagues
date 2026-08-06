import type { PlayerRecord } from "./loadPlayers"
import type {
  IdentityPlayer,
  PlayerIdentityAlias,
} from "@/lib/identity"
import { resolveIdentity } from "@/lib/identity"

export type PlayerMatch = {
  importedName: string
  playerId: string | null
  matchedName: string | null
  confidence: number
  status: "exact" | "close" | "new"
}

export function matchPlayers(
  importedNames: string[],
  players: PlayerRecord[],
  aliases: PlayerIdentityAlias[] = []
): PlayerMatch[] {
  const identityPlayers: IdentityPlayer[] =
    players.map((player) => ({
      id: player.id,
      screenName: player.screen_name,
      discordName: player.discord_name,
      discordId: player.discord_id,
      active: player.active,
    }))

  return importedNames.map((name) => {
    const result = resolveIdentity({
      importedName: name,
      players: identityPlayers,
      aliases,
      options: {
        minimumSuggestionConfidence: 60,
        maximumCandidates: 5,
      },
    })

    if (
      result.status === "exact" ||
      result.status === "normalized" ||
      result.status === "alias"
    ) {
      return {
        importedName: name,
        playerId: result.playerId,
        matchedName: result.screenName,
        confidence: result.confidence,
        status: "exact",
      }
    }

    if (result.status === "suggested") {
      return {
        importedName: name,
        playerId: result.playerId,
        matchedName: result.screenName,
        confidence: result.confidence,
        status: "close",
      }
    }

    return {
      importedName: name,
      playerId: null,
      matchedName: null,
      confidence: 0,
      status: "new",
    }
  })
}