export type CanonicalPlayerDisplay = {
  source_player_id: string
  canonical_player_id: string | null
  screen_name: string | null
  eligible: boolean
}

export type CanonicalIdentityResolution = {
  source_player_id: string
  canonical_player_id: string | null
}

export type CanonicalCurrentPlayerRow = {
  id: string
  screen_name: string
  status: string | null
  active: boolean | null
}

const unavailableStatuses = new Set(["retired", "merged", "archived"])

export function isCanonicalCurrentPlayer(player: CanonicalCurrentPlayerRow) {
  return player.active === true && !unavailableStatuses.has(player.status?.trim().toLowerCase() || "")
}

export function buildCanonicalPlayerDisplays(
  sourcePlayerIds: string[],
  resolutions: CanonicalIdentityResolution[],
  canonicalPlayers: CanonicalCurrentPlayerRow[],
) {
  const resolutionBySource = new Map(
    resolutions.map((resolution) => [resolution.source_player_id, resolution.canonical_player_id]),
  )
  const playerById = new Map(canonicalPlayers.map((player) => [player.id, player]))

  return Array.from(new Set(sourcePlayerIds.filter(Boolean))).map((sourcePlayerId) => {
    const canonicalPlayerId = resolutionBySource.get(sourcePlayerId) || null
    const canonicalPlayer = canonicalPlayerId ? playerById.get(canonicalPlayerId) : null
    const eligible = Boolean(canonicalPlayer && isCanonicalCurrentPlayer(canonicalPlayer))

    return {
      source_player_id: sourcePlayerId,
      canonical_player_id: canonicalPlayerId,
      screen_name: eligible ? canonicalPlayer?.screen_name || null : null,
      eligible,
    } satisfies CanonicalPlayerDisplay
  })
}

export function uniqueCanonicalCurrentPlayers(displays: CanonicalPlayerDisplay[]) {
  const unique = new Map<string, { id: string; screen_name: string }>()

  for (const display of displays) {
    if (!display.eligible || !display.canonical_player_id || !display.screen_name) continue
    unique.set(display.canonical_player_id, {
      id: display.canonical_player_id,
      screen_name: display.screen_name,
    })
  }

  return Array.from(unique.values()).sort((left, right) =>
    left.screen_name.localeCompare(right.screen_name),
  )
}

export function findCanonicalFamilyConflicts(
  sourcePlayerIds: string[],
  displays: CanonicalPlayerDisplay[],
) {
  const displayBySource = new Map(displays.map((display) => [display.source_player_id, display]))
  const sourcesByCanonical = new Map<string, Set<string>>()

  for (const sourcePlayerId of sourcePlayerIds) {
    const display = displayBySource.get(sourcePlayerId)
    if (!display?.eligible || !display.canonical_player_id) continue
    const sources = sourcesByCanonical.get(display.canonical_player_id) || new Set<string>()
    sources.add(sourcePlayerId)
    sourcesByCanonical.set(display.canonical_player_id, sources)
  }

  return Array.from(sourcesByCanonical.entries())
    .filter(([, sources]) => sources.size > 1)
    .map(([canonicalPlayerId, sources]) => ({
      canonical_player_id: canonicalPlayerId,
      source_player_ids: Array.from(sources),
    }))
}

export function historicalPlayerName(
  display: CanonicalPlayerDisplay | undefined,
  explicitHistoricalName: string | null | undefined,
) {
  if (display?.eligible && display.screen_name) return display.screen_name
  return explicitHistoricalName?.trim() || "Unresolved Player"
}
