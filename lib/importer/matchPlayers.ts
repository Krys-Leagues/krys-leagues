import type { PlayerRecord } from "./loadPlayers"
import type {
  IdentityPlayer,
  PlayerIdentityAlias,
} from "../identity/types.ts"
import { resolveIdentity } from "../identity/resolveIdentity.ts"
import type { PlayerIdentityLink } from "./loadPlayerIdentityLinks"

export type PlayerMatch = {
  importedName: string
  playerId: string | null
  matchedName: string | null
  confidence: number
  status: "exact" | "close" | "new"
  evidence: string
  autoLinkEligible: boolean
  autoLinkReason: string | null
}

export function matchPlayers(
  importedNames: string[],
  players: PlayerRecord[],
  aliases: PlayerIdentityAlias[] = [],
  identityLinks: PlayerIdentityLink[] = []
): PlayerMatch[] {
  const directCanonicalIds = new Map(identityLinks.map((link) => [link.historicalPlayerId, link.canonicalPlayerId]))
  const canonicalIds = new Map<string, string>()
  for (const link of identityLinks) {
    const visited = new Set<string>()
    let current = link.historicalPlayerId
    while (directCanonicalIds.has(current) && !visited.has(current)) {
      visited.add(current)
      current = directCanonicalIds.get(current)!
    }
    canonicalIds.set(link.historicalPlayerId, current)
  }
  const identityPlayers: IdentityPlayer[] =
    players.map((player) => ({
      id: player.id,
      canonicalPlayerId: canonicalIds.get(player.id) ?? player.id,
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
        evidence: result.matchedSource,
        autoLinkEligible: result.autoLinkEligible,
        autoLinkReason: result.autoLinkReason,
      }
    }

    if (result.status === "suggested") {
      return {
        importedName: name,
        playerId: result.playerId,
        matchedName: result.screenName,
        confidence: result.confidence,
        status: "close",
        evidence: result.matchedSource,
        autoLinkEligible: false,
        autoLinkReason: null,
      }
    }

    return {
      importedName: name,
      playerId: null,
      matchedName: null,
      confidence: 0,
      status: "new",
      evidence: "none",
      autoLinkEligible: false,
      autoLinkReason: null,
    }
  })
}
