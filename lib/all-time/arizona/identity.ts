import type {
  IdentityPlayer,
  PlayerIdentityAlias,
} from "@/lib/identity"
import { normalizeIdentity, resolveIdentity } from "@/lib/identity"

import type { IdentityPreview } from "./types.ts"

export function previewIdentity(
  historicalPlayerName: string,
  players: IdentityPlayer[],
  aliases: PlayerIdentityAlias[]
): IdentityPreview {
  const normalized = normalizeIdentity(historicalPlayerName)
  const exactPlayerIds = new Set<string>()

  for (const player of players) {
    if (
      normalizeIdentity(player.screenName) === normalized ||
      (player.discordName && normalizeIdentity(player.discordName) === normalized)
    ) {
      exactPlayerIds.add(player.id)
    }
  }
  for (const alias of aliases) {
    if (alias.active && alias.normalizedAlias === normalized) {
      exactPlayerIds.add(alias.playerId)
    }
  }

  if (exactPlayerIds.size > 1) {
    return {
      historicalPlayerName,
      status: "ambiguous",
      playerId: null,
      canonicalScreenName: null,
      matchedSource: "conflicting_exact_identity",
      confidence: 100,
      candidates: players
        .filter((player) => exactPlayerIds.has(player.id))
        .map((player) => ({
          playerId: player.id,
          screenName: player.screenName,
          matchedValue: historicalPlayerName,
          confidence: 100,
        })),
    }
  }

  const result = resolveIdentity({
    importedName: historicalPlayerName,
    players,
    aliases,
    options: { minimumSuggestionConfidence: 60, maximumCandidates: 5 },
  })

  if (
    result.status === "exact" ||
    result.status === "normalized" ||
    result.status === "alias"
  ) {
    return {
      historicalPlayerName,
      status: "resolved",
      playerId: result.playerId,
      canonicalScreenName: result.screenName,
      matchedSource: result.matchedSource,
      confidence: result.confidence,
      candidates: [],
    }
  }

  if (result.status === "suggested") {
    return {
      historicalPlayerName,
      status: "ambiguous",
      playerId: null,
      canonicalScreenName: null,
      matchedSource: "suggestion_only",
      confidence: result.confidence,
      candidates: result.candidates.map((candidate) => ({
        playerId: candidate.playerId,
        screenName: candidate.screenName,
        matchedValue: candidate.matchedValue,
        confidence: candidate.confidence,
      })),
    }
  }

  return {
    historicalPlayerName,
    status: "unresolved",
    playerId: null,
    canonicalScreenName: null,
    matchedSource: "unknown",
    confidence: 0,
    candidates: [],
  }
}
