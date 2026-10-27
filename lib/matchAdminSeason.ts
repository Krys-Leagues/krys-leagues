export type MatchAdminSeason = {
  id: string
  season_number: number
  is_active: boolean
  is_locked: boolean
  start_date: string | null
  end_date: string | null
}

export type MatchAdminRoster = {
  season_id: string
  status: "draft" | "approved" | "locked"
}

export type MatchAdminSeasonResolution = {
  season: MatchAdminSeason
  source: "managed" | "legacy-fallback"
}

function isCurrentLegacyMatchSeason(
  season: MatchAdminSeason,
  today = new Date()
) {
  if (!season.is_active || season.is_locked) return false

  if (season.start_date !== null) {
    const startDate = new Date(`${season.start_date}T00:00:00.000Z`)
    if (Number.isNaN(startDate.getTime()) || startDate > today) return false
  }

  if (season.end_date === null) return true

  const endDate = new Date(`${season.end_date}T23:59:59.999Z`)
  return !Number.isNaN(endDate.getTime()) && endDate >= today
}

export function resolveCurrentMatchAdminSeason(
  seasons: MatchAdminSeason[],
  rosters: MatchAdminRoster[],
  requestedSeasonId?: string | null,
  today = new Date()
): MatchAdminSeasonResolution | null {
  const managedSeasonIds = new Set(rosters.map((roster) => roster.season_id))
  const currentManagedSeasonIds = new Set(
    rosters
      .filter((roster) => roster.status !== "locked")
      .map((roster) => roster.season_id)
  )

  const requestedSeason = seasons.find(
    (season) => season.id === requestedSeasonId && managedSeasonIds.has(season.id)
  )
  if (requestedSeason) {
    return { season: requestedSeason, source: "managed" }
  }

  const currentManagedSeason = seasons.find((season) =>
    currentManagedSeasonIds.has(season.id)
  )
  if (currentManagedSeason) {
    return { season: currentManagedSeason, source: "managed" }
  }

  const legacyCurrentSeason = seasons.find(
    (season) =>
      !managedSeasonIds.has(season.id) &&
      isCurrentLegacyMatchSeason(season, today)
  )
  return legacyCurrentSeason
    ? { season: legacyCurrentSeason, source: "legacy-fallback" }
    : null
}
