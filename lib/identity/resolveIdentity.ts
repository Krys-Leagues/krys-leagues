import {
  IdentityCandidate,
  IdentityMatchResult,
  IdentityPlayer,
  PlayerIdentityAlias,
  ResolveIdentityOptions,
} from "./types"

import { normalizeIdentity } from "./normalizeIdentity"
import { scoreIdentityMatch } from "./scoreIdentityMatch"

type ResolveIdentityArgs = {
  importedName: string
  players: IdentityPlayer[]
  aliases: PlayerIdentityAlias[]
  options?: ResolveIdentityOptions
}

export function resolveIdentity({
  importedName,
  players,
  aliases,
  options,
}: ResolveIdentityArgs): IdentityMatchResult {
  const normalizedName =
    normalizeIdentity(importedName)

  const minimumSuggestionConfidence =
    options?.minimumSuggestionConfidence ?? 60

  const maximumCandidates =
    options?.maximumCandidates ?? 5

  if (!normalizedName) {
    return {
      importedName,
      normalizedName,
      status: "unmatched",
      playerId: null,
      screenName: null,
      confidence: 0,
      matchedSource: "unknown",
      candidates: [],
    }
  }

  const exactPlayer = players.find(
    (player) =>
      normalizeIdentity(player.screenName) ===
      normalizedName
  )

  if (exactPlayer) {
    return {
      importedName,
      normalizedName,
      status: "exact",
      playerId: exactPlayer.id,
      screenName: exactPlayer.screenName,
      confidence: 100,
      matchedSource: "screen_name",
      candidates: [],
    }
  }

  const exactDiscordName = players.find(
    (player) =>
      player.discordName &&
      normalizeIdentity(player.discordName) ===
        normalizedName
  )

  if (exactDiscordName) {
    return {
      importedName,
      normalizedName,
      status: "normalized",
      playerId: exactDiscordName.id,
      screenName: exactDiscordName.screenName,
      confidence: 100,
      matchedSource: "discord_name",
      candidates: [],
    }
  }

  const exactAliasPlayerIds = Array.from(
    new Set(
      aliases
        .filter(
          (alias) =>
            alias.active &&
            alias.normalizedAlias === normalizedName
        )
        .map((alias) => alias.playerId)
        .filter((playerId) =>
          players.some((player) => player.id === playerId)
        )
    )
  )

  if (exactAliasPlayerIds.length === 1) {
    const player = players.find(
      (item) => item.id === exactAliasPlayerIds[0]
    )

    if (player) {
      return {
        importedName,
        normalizedName,
        status: "alias",
        playerId: player.id,
        screenName: player.screenName,
        confidence: 100,
        matchedSource: "historical_alias",
        candidates: [],
      }
    }
  }

  const candidates: IdentityCandidate[] = []

  for (const player of players) {
    const screenScore = scoreIdentityMatch(
      importedName,
      player.screenName
    )

    if (
      screenScore.confidence >=
      minimumSuggestionConfidence
    ) {
      candidates.push({
        playerId: player.id,
        screenName: player.screenName,
        matchedValue: player.screenName,
        matchedSource: "screen_name",
        confidence: screenScore.confidence,
        reasons: screenScore.reasons,
      })
    }

    if (player.discordName) {
      const discordScore = scoreIdentityMatch(
        importedName,
        player.discordName
      )

      if (
        discordScore.confidence >=
        minimumSuggestionConfidence
      ) {
        candidates.push({
          playerId: player.id,
          screenName: player.screenName,
          matchedValue: player.discordName,
          matchedSource: "discord_name",
          confidence: discordScore.confidence,
          reasons: discordScore.reasons,
        })
      }
    }
  }

  for (const alias of aliases) {
    if (!alias.active) {
      continue
    }

    const player = players.find(
      (item) => item.id === alias.playerId
    )

    if (!player) {
      continue
    }

    const aliasScore = scoreIdentityMatch(
      importedName,
      alias.aliasName
    )

    if (
      aliasScore.confidence >=
      minimumSuggestionConfidence
    ) {
      candidates.push({
        playerId: player.id,
        screenName: player.screenName,
        matchedValue: alias.aliasName,
        matchedSource: "historical_alias",
        confidence: aliasScore.confidence,
        reasons: aliasScore.reasons,
      })
    }
  }

  const bestByPlayer = new Map<
    string,
    IdentityCandidate
  >()

  for (const candidate of candidates) {
    const existing = bestByPlayer.get(
      candidate.playerId
    )

    if (
      !existing ||
      candidate.confidence >
        existing.confidence
    ) {
      bestByPlayer.set(
        candidate.playerId,
        candidate
      )
    }
  }

  const rankedCandidates = Array.from(
    bestByPlayer.values()
  )
    .sort(
      (left, right) =>
        right.confidence - left.confidence
    )
    .slice(0, maximumCandidates)

  const bestCandidate =
    rankedCandidates[0] ?? null

  if (!bestCandidate) {
    return {
      importedName,
      normalizedName,
      status: "unmatched",
      playerId: null,
      screenName: null,
      confidence: 0,
      matchedSource: "unknown",
      candidates: [],
    }
  }

  return {
    importedName,
    normalizedName,
    status: "suggested",
    playerId: bestCandidate.playerId,
    screenName: bestCandidate.screenName,
    confidence: bestCandidate.confidence,
    matchedSource:
      bestCandidate.matchedSource,
    candidates: rankedCandidates,
  }
}
