import type { HistoricalMatchPreview, HistoricalMatchOutcome } from "./adapters/matchAdapter"

export type ManualMatchEvidence = "standings_only" | "aggregate_course"
export type ManualMatchCourse = { id: string; name: string }
export type ManualMatchAppearance = { played: boolean; outcome: HistoricalMatchOutcome | null; holesWon: number | null }
export type ManualMatchStanding = {
  id: string; finalRank: number; historicalDisplayName: string; played: number; wins: number; losses: number
  draws: number; points: number; holesWon: number; appearances: Record<string, ManualMatchAppearance>
}
export type ManualMatchDivision = { id: string; divisionNumber: number; standings: ManualMatchStanding[] }
export type ManualHistoricalMatchDraft = {
  seasonNumber: number; historicalLabel: string; year: number | null; evidenceLevel: ManualMatchEvidence
  sourceReference: string; courses: ManualMatchCourse[]; divisions: ManualMatchDivision[]
}

export function emptyManualStanding(id: string, rank = 1): ManualMatchStanding {
  return { id, finalRank: rank, historicalDisplayName: "", played: 0, wins: 0, losses: 0, draws: 0, points: 0, holesWon: 0, appearances: {} }
}

export function validateManualHistoricalMatch(draft: ManualHistoricalMatchDraft) {
  const errors: string[] = []
  if (!Number.isInteger(draft.seasonNumber) || draft.seasonNumber <= 0) errors.push("Season number must be a positive whole number.")
  if (!draft.historicalLabel.trim()) errors.push("Historical season label is required.")
  if (draft.year !== null && (!Number.isInteger(draft.year) || draft.year < 1900 || draft.year > 2200)) errors.push("Year must be blank or a valid four-digit year.")
  if (draft.divisions.length === 0) errors.push("At least one division is required.")
  const divisionNumbers = new Set<number>()
  for (const division of draft.divisions) {
    if (!Number.isInteger(division.divisionNumber) || division.divisionNumber <= 0) errors.push("Every division needs a positive whole-number division number.")
    if (divisionNumbers.has(division.divisionNumber)) errors.push(`Division ${division.divisionNumber} is duplicated.`)
    divisionNumbers.add(division.divisionNumber)
    if (division.standings.length === 0) errors.push(`Division ${division.divisionNumber} needs at least one player.`)
    const ranks = new Set<number>()
    for (const standing of division.standings) {
      const label = `Division ${division.divisionNumber}, rank ${standing.finalRank || "?"}`
      if (!standing.historicalDisplayName.trim()) errors.push(`${label}: historical display name is required.`)
      if (!Number.isInteger(standing.finalRank) || standing.finalRank <= 0 || ranks.has(standing.finalRank)) errors.push(`${label}: rank must be a unique positive whole number.`)
      ranks.add(standing.finalRank)
      for (const [name, value] of Object.entries({ P: standing.played, W: standing.wins, L: standing.losses, D: standing.draws, PTS: standing.points, HW: standing.holesWon })) {
        if (!Number.isFinite(value) || value < 0) errors.push(`${label}: ${name} must be zero or greater.`)
      }
      if (standing.played !== standing.wins + standing.losses + standing.draws) errors.push(`${label}: P must equal W + L + D.`)
      if (standing.points !== standing.wins * 3 + standing.draws) errors.push(`${label}: PTS must equal (W × 3) + D.`)
      if (draft.evidenceLevel === "aggregate_course") {
        let complete = true, w = 0, l = 0, d = 0, hw = 0
        for (const course of draft.courses) {
          const appearance = standing.appearances[course.id]
          if (!appearance?.played) continue
          if (!appearance.outcome || appearance.holesWon === null || appearance.holesWon < 0) {
            errors.push(`${label}, ${course.name || "unnamed course"}: played rows require one outcome and HW of zero or greater.`)
            complete = false
          } else {
            if (appearance.outcome === "W") w += 1
            if (appearance.outcome === "L") l += 1
            if (appearance.outcome === "D") d += 1
            hw += appearance.holesWon
          }
        }
        if (complete && draft.courses.length > 0 && [w + l + d, w, l, d, hw].some((value, index) => value !== [standing.played, standing.wins, standing.losses, standing.draws, standing.holesWon][index])) {
          errors.push(`${label}: complete course results disagree with standing P/W/L/D/HW totals.`)
        }
      }
    }
  }
  if (draft.evidenceLevel === "aggregate_course") {
    if (draft.courses.length === 0) errors.push("Aggregate course evidence requires at least one course.")
    const names = new Set<string>()
    for (const course of draft.courses) {
      const name = course.name.trim().toUpperCase()
      if (!name) errors.push("Every course needs a name.")
      if (names.has(name)) errors.push(`Course ${course.name} is duplicated.`)
      names.add(name)
    }
  }
  return Array.from(new Set(errors))
}

export function manualHistoricalMatchPreview(draft: ManualHistoricalMatchDraft): HistoricalMatchPreview {
  const courses = draft.evidenceLevel === "aggregate_course" ? draft.courses : []
  const divisions = draft.divisions.map((division) => ({
    divisionNumber: division.divisionNumber,
    standings: division.standings.map((standing) => ({
      divisionNumber: division.divisionNumber, finalRank: standing.finalRank,
      historicalDisplayName: standing.historicalDisplayName, played: standing.played, wins: standing.wins,
      losses: standing.losses, draws: standing.draws, points: standing.points, holesWon: standing.holesWon,
      courses: courses.map((course) => {
        const value = standing.appearances[course.id] ?? { played: false, outcome: null, holesWon: null }
        return { courseName: course.name, played: value.played, outcome: value.played ? value.outcome : null, holesWon: value.played ? value.holesWon : null, sourceHolesWon: value.played ? value.holesWon : null }
      }), canonicalPlayerId: null, warnings: [],
    })),
  }))
  const appearances = divisions.flatMap((division) => division.standings.flatMap((standing) => standing.courses))
  return {
    evidenceLevel: draft.evidenceLevel, layout: "single_side", seasonNumber: draft.seasonNumber,
    historicalLabel: draft.historicalLabel, year: draft.year, courses: courses.map((course) => course.name), divisions,
    ignoredRows: [], warnings: [], audit: { seasonsFound: 1, populatedDivisions: divisions.length,
      realPlayerRows: divisions.reduce((total, division) => total + division.standings.length, 0),
      duplicateHorizontalCopiesCollapsed: 0, templateRowsIgnored: 0, structuralHeadersIgnored: 0,
      malformedRows: 0, conflicts: 0, courseAppearancesPlayed: appearances.filter((item) => item.played).length,
      courseAppearancesUnplayed: appearances.filter((item) => !item.played).length, authoritativeFixtures: 0 },
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}` }
  return JSON.stringify(value)
}

export async function manualHistoricalSourceSha(draft: ManualHistoricalMatchDraft) {
  const facts = { entryMethod: "manual", evidenceLevel: draft.evidenceLevel, seasonNumber: draft.seasonNumber,
    historicalLabel: draft.historicalLabel, year: draft.year, sourceReference: draft.sourceReference,
    courses: draft.courses.map((course) => course.name), divisions: draft.divisions.map((division) => ({ divisionNumber: division.divisionNumber,
      standings: division.standings.map((standing) => ({ finalRank: standing.finalRank, historicalDisplayName: standing.historicalDisplayName,
        played: standing.played, wins: standing.wins, losses: standing.losses, draws: standing.draws, points: standing.points,
        holesWon: standing.holesWon, appearances: draft.courses.map((course) => standing.appearances[course.id] ?? { played: false, outcome: null, holesWon: null }) })) })) }
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(facts))).then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""))
}
