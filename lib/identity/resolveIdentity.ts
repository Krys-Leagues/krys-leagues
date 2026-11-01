import type {
  IdentityCandidate,
  IdentityMatchResult,
  IdentityPlayer,
  PlayerIdentityAlias,
  ResolveIdentityOptions,
} from "./types.ts"

import { normalizeIdentity } from "./normalizeIdentity.ts"
import { scoreIdentityMatch } from "./scoreIdentityMatch.ts"

type ResolveIdentityArgs = {
  importedName: string
  players: IdentityPlayer[]
  aliases: PlayerIdentityAlias[]
  options?: ResolveIdentityOptions
}

function canonicalPlayerId(player: IdentityPlayer) {
  return player.canonicalPlayerId ?? player.id
}

function uniqueCanonicalPlayers(players: IdentityPlayer[], matches: IdentityPlayer[]) {
  const canonicalIds = Array.from(new Set(matches.map(canonicalPlayerId)))
  if (canonicalIds.length !== 1) return null
  const canonicalId = canonicalIds[0]
  return players.find((player) => player.id === canonicalId)
    ?? matches.find((player) => canonicalPlayerId(player) === canonicalId)
    ?? null
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

  const exactRawVerifiedAliases = aliases.filter(
    (alias) =>
      alias.active &&
      alias.verified === true &&
      alias.aliasName === importedName
  )
  const exactRawAliasPlayers = exactRawVerifiedAliases
    .map((alias) => players.find((player) => player.id === alias.playerId))
    .filter((player): player is IdentityPlayer => Boolean(player))
  const exactRawAliasPlayer = uniqueCanonicalPlayers(
    players,
    exactRawAliasPlayers
  )

  if (exactRawAliasPlayer) {
    const canonicalId = canonicalPlayerId(exactRawAliasPlayer)
    return {
      importedName,
      normalizedName,
      status: "alias",
      playerId: canonicalId,
      screenName: exactRawAliasPlayer.screenName,
      confidence: 100,
      matchedSource: "historical_alias",
      candidates: [],
      autoLinkEligible: true,
      autoLinkReason: "verified historical alias",
    }
  }

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
      autoLinkEligible: false,
      autoLinkReason: null,
    }
  }

  const exactScreenPlayers = players.filter(
    (player) =>
      normalizeIdentity(player.screenName) ===
      normalizedName
  )

  const exactDiscordIdPlayers = players.filter(
    (player) => player.discordId?.trim() && player.discordId.trim() === importedName.trim()
  )

  const exactVerifiedAliases = aliases.filter(
    (alias) =>
      alias.active &&
      alias.verified === true &&
      normalizeIdentity(alias.normalizedAlias || alias.aliasName) === normalizedName
  )
  const exactAliasPlayers = exactVerifiedAliases
    .map((alias) => players.find((player) => player.id === alias.playerId))
    .filter((player): player is IdentityPlayer => Boolean(player))
  const authoritativePlayer = uniqueCanonicalPlayers(
    players,
    [...exactScreenPlayers, ...exactDiscordIdPlayers, ...exactAliasPlayers]
  )

  if (authoritativePlayer) {
    const canonicalId = canonicalPlayerId(authoritativePlayer)
    const hasVerifiedAlias = exactAliasPlayers.some((player) => canonicalPlayerId(player) === canonicalId)
    const hasExactDiscordId = exactDiscordIdPlayers.some((player) => canonicalPlayerId(player) === canonicalId)
    const aliasUsesIdentityLink = exactVerifiedAliases.some((alias) => alias.playerId !== canonicalId)
    const screenUsesIdentityLink = exactScreenPlayers.some((player) => player.id !== canonicalId)
      && !exactScreenPlayers.some((player) => player.id === canonicalId)
    return {
      importedName,
      normalizedName,
      status: hasVerifiedAlias ? "alias" : "exact",
      playerId: canonicalId,
      screenName: authoritativePlayer.screenName,
      confidence: 100,
      matchedSource: hasVerifiedAlias ? "historical_alias" : hasExactDiscordId ? "discord_id" : "screen_name",
      candidates: [],
      autoLinkEligible: true,
      autoLinkReason: hasVerifiedAlias
        ? aliasUsesIdentityLink ? "verified historical alias via canonical identity link" : "verified historical alias"
        : hasExactDiscordId ? "exact Discord ID"
        : screenUsesIdentityLink ? "exact screen name via canonical identity link" : "exact current screen name",
    }
  }

  const exactDiscordNames = players.filter(
    (player) =>
      player.discordName &&
      normalizeIdentity(player.discordName) ===
        normalizedName
  )
  const exactDiscordName = uniqueCanonicalPlayers(players, exactDiscordNames)

  if (exactDiscordName) {
    return {
      importedName,
      normalizedName,
      status: "normalized",
      playerId: canonicalPlayerId(exactDiscordName),
      screenName: exactDiscordName.screenName,
      confidence: 100,
      matchedSource: "discord_name",
      candidates: [],
      autoLinkEligible: false,
      autoLinkReason: null,
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
      autoLinkEligible: false,
      autoLinkReason: null,
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
    autoLinkEligible: false,
    autoLinkReason: null,
  }
}
