export type CanonicalPlayer = {
  id: string
  screenName: string
  aliases?: readonly string[]
}

export type HistoricalIdentityInput = {
  historicalName: string
  playerId?: string | null
  sourceKey?: string
}

export type IdentityResolution = {
  historicalName: string
  normalizedName: string
  sourceKey?: string
  status: "resolved" | "unresolved" | "ambiguous"
  playerId?: string
  candidates: readonly string[]
  reason:
    | "STORED_PLAYER_ID"
    | "EXACT_SCREEN_NAME"
    | "EXACT_ALIAS"
    | "MISSING_NAME"
    | "NO_EXACT_MATCH"
    | "AMBIGUOUS_EXACT_MATCH"
    | "INVALID_STORED_PLAYER_ID"
}

export type IdentityDryRunReport = {
  total: number
  resolved: number
  unresolved: number
  ambiguous: number
  results: readonly IdentityResolution[]
}

export function normalizeIdentityName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US")
}

function addCandidate(
  index: Map<string, CanonicalPlayer[]>,
  name: string,
  player: CanonicalPlayer,
): void {
  const normalized = normalizeIdentityName(name)
  if (!normalized) return
  const candidates = index.get(normalized) ?? []
  if (!candidates.some((candidate) => candidate.id === player.id)) {
    candidates.push(player)
  }
  index.set(normalized, candidates)
}

export function buildIdentityIndex(
  players: readonly CanonicalPlayer[],
): ReadonlyMap<string, readonly CanonicalPlayer[]> {
  const index = new Map<string, CanonicalPlayer[]>()
  for (const player of players) {
    addCandidate(index, player.screenName, player)
    for (const alias of player.aliases ?? []) addCandidate(index, alias, player)
  }
  return index
}

export function resolveHistoricalIdentity(
  input: HistoricalIdentityInput,
  players: readonly CanonicalPlayer[],
): IdentityResolution {
  const normalizedName = normalizeIdentityName(input.historicalName)
  const byId = input.playerId
    ? players.find((player) => player.id === input.playerId)
    : undefined

  if (input.playerId) {
    if (byId) {
      return {
        historicalName: input.historicalName,
        normalizedName,
        sourceKey: input.sourceKey,
        status: "resolved",
        playerId: byId.id,
        candidates: [byId.id],
        reason: "STORED_PLAYER_ID",
      }
    }
    return {
      historicalName: input.historicalName,
      normalizedName,
      sourceKey: input.sourceKey,
      status: "unresolved",
      candidates: [],
      reason: "INVALID_STORED_PLAYER_ID",
    }
  }

  if (!normalizedName) {
    return {
      historicalName: input.historicalName,
      normalizedName,
      sourceKey: input.sourceKey,
      status: "unresolved",
      candidates: [],
      reason: "MISSING_NAME",
    }
  }

  const candidates = buildIdentityIndex(players).get(normalizedName) ?? []
  if (candidates.length === 1) {
    const candidate = candidates[0]
    const matchedAlias = (candidate.aliases ?? []).some(
      (alias) => normalizeIdentityName(alias) === normalizedName,
    )
    return {
      historicalName: input.historicalName,
      normalizedName,
      sourceKey: input.sourceKey,
      status: "resolved",
      playerId: candidate.id,
      candidates: [candidate.id],
      reason: matchedAlias ? "EXACT_ALIAS" : "EXACT_SCREEN_NAME",
    }
  }

  if (candidates.length > 1) {
    return {
      historicalName: input.historicalName,
      normalizedName,
      sourceKey: input.sourceKey,
      status: "ambiguous",
      candidates: candidates.map((candidate) => candidate.id).sort(),
      reason: "AMBIGUOUS_EXACT_MATCH",
    }
  }

  return {
    historicalName: input.historicalName,
    normalizedName,
    sourceKey: input.sourceKey,
    status: "unresolved",
    candidates: [],
    reason: "NO_EXACT_MATCH",
  }
}

export function dryRunIdentityReconciliation(
  inputs: readonly HistoricalIdentityInput[],
  players: readonly CanonicalPlayer[],
): IdentityDryRunReport {
  const results = inputs.map((input) => resolveHistoricalIdentity(input, players))
  return {
    total: results.length,
    resolved: results.filter((result) => result.status === "resolved").length,
    unresolved: results.filter((result) => result.status === "unresolved").length,
    ambiguous: results.filter((result) => result.status === "ambiguous").length,
    results,
  }
}
