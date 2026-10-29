import type { HistoricalMatchPreview, HistoricalMatchOutcome } from "./adapters/matchAdapter"
import { calculateHistoricalMatchFixtures, type ManualMatchFixture } from "./historicalMatchFixtures.ts"

export type ManualMatchEvidence = "standings_only" | "aggregate_course" | "fixture_detailed"
export type ManualMatchCourse = { id: string; name: string }
export type ManualMatchAppearance = { played: boolean; outcome: HistoricalMatchOutcome | null; holesWon: number | null }
export type ManualMatchStanding = { id: string; finalRank: number; historicalDisplayName: string; played: number; wins: number; losses: number; draws: number; points: number; holesWon: number; appearances: Record<string, ManualMatchAppearance> }
export type ManualMatchDivision = { id: string; divisionNumber: number; standings: ManualMatchStanding[] }
export type ManualHistoricalMatchDraft = { seasonNumber: number; historicalLabel: string; year: number | null; evidenceLevel: ManualMatchEvidence; sourceReference: string; courses: ManualMatchCourse[]; divisions: ManualMatchDivision[]; fixtures: ManualMatchFixture[] }

export function emptyManualStanding(id: string, rank = 1): ManualMatchStanding {
  return { id, finalRank: rank, historicalDisplayName: "", played: 0, wins: 0, losses: 0, draws: 0, points: 0, holesWon: 0, appearances: {} }
}

export function validateManualHistoricalMatch(draft: ManualHistoricalMatchDraft) {
  const errors: string[] = []
  const calculation = calculateHistoricalMatchFixtures(draft.courses, draft.divisions, draft.fixtures, draft.sourceReference)
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
      const totals = draft.evidenceLevel === "fixture_detailed" ? calculation.totalsByStandingId.get(standing.id)! : standing
      for (const [name, value] of Object.entries({ P: totals.played, W: totals.wins, L: totals.losses, D: totals.draws, PTS: totals.points, HW: totals.holesWon })) if (!Number.isFinite(value) || value < 0) errors.push(`${label}: ${name} must be zero or greater.`)
      if (totals.played !== totals.wins + totals.losses + totals.draws) errors.push(`${label}: P must equal W + L + D.`)
      if (totals.points !== totals.wins * 3 + totals.draws) errors.push(`${label}: PTS must equal (W × 3) + D.`)
      if (draft.evidenceLevel === "aggregate_course") {
        let complete = true, w = 0, l = 0, d = 0, hw = 0
        for (const course of draft.courses) {
          const appearance = standing.appearances[course.id]
          if (!appearance?.played) { if (appearance && (appearance.outcome !== null || appearance.holesWon !== null)) { errors.push(`${label}, ${course.name || "unnamed course"}: unplayed rows require a null outcome and null HW.`); complete = false }; continue }
          if (!appearance.outcome || appearance.holesWon === null || appearance.holesWon < 0) { errors.push(`${label}, ${course.name || "unnamed course"}: played rows require one outcome and HW of zero or greater.`); complete = false }
          else { if (appearance.outcome === "W") w += 1; if (appearance.outcome === "L") l += 1; if (appearance.outcome === "D") d += 1; hw += appearance.holesWon }
        }
        if (complete && draft.courses.length > 0 && [w + l + d, w, l, d, hw].some((value, index) => value !== [standing.played, standing.wins, standing.losses, standing.draws, standing.holesWon][index])) errors.push(`${label}: complete course results disagree with standing P/W/L/D/HW totals.`)
      }
    }
  }
  if (draft.evidenceLevel !== "standings_only") {
    if (draft.courses.length === 0) errors.push(`${draft.evidenceLevel === "fixture_detailed" ? "Detailed matchup" : "Aggregate course"} evidence requires at least one course.`)
    const names = new Set<string>()
    for (const course of draft.courses) { const name = course.name.trim().toUpperCase(); if (!name) errors.push("Every course needs a name."); if (names.has(name)) errors.push(`Course ${course.name} is duplicated.`); names.add(name) }
  }
  if (draft.evidenceLevel === "fixture_detailed") { if (draft.fixtures.length === 0) errors.push("Detailed matchup evidence requires at least one fixture."); errors.push(...calculation.errors) }
  return Array.from(new Set(errors))
}

export function manualHistoricalMatchPreview(draft: ManualHistoricalMatchDraft): HistoricalMatchPreview {
  const courses = draft.evidenceLevel === "standings_only" ? [] : draft.courses
  const calculation = calculateHistoricalMatchFixtures(draft.courses, draft.divisions, draft.fixtures, draft.sourceReference)
  const divisions = draft.divisions.map((division) => ({ divisionNumber: division.divisionNumber, standings: division.standings.map((standing) => {
    const totals = draft.evidenceLevel === "fixture_detailed" ? calculation.totalsByStandingId.get(standing.id)! : standing
    const appearances = draft.evidenceLevel === "fixture_detailed" ? calculation.appearancesByStandingId.get(standing.id) ?? [] : courses.map((course) => { const value = standing.appearances[course.id] ?? { played: false, outcome: null, holesWon: null }; return { courseName: course.name, played: value.played, outcome: value.played ? value.outcome : null, holesWon: value.played ? value.holesWon : null, sourceHolesWon: value.played ? value.holesWon : null } })
    return { divisionNumber: division.divisionNumber, finalRank: standing.finalRank, historicalDisplayName: standing.historicalDisplayName, ...totals, courses: appearances, canonicalPlayerId: null, warnings: [] }
  }) }))
  const appearances = divisions.flatMap((division) => division.standings.flatMap((standing) => standing.courses))
  const fixtures = draft.evidenceLevel === "fixture_detailed" ? calculation.fixtures : []
  return { evidenceLevel: draft.evidenceLevel, layout: "single_side", seasonNumber: draft.seasonNumber, historicalLabel: draft.historicalLabel, year: draft.year, courses: courses.map((course) => course.name), divisions, fixtures, ignoredRows: [], warnings: [], audit: { seasonsFound: 1, populatedDivisions: divisions.length, realPlayerRows: divisions.reduce((total, division) => total + division.standings.length, 0), duplicateHorizontalCopiesCollapsed: 0, templateRowsIgnored: 0, structuralHeadersIgnored: 0, malformedRows: 0, conflicts: 0, courseAppearancesPlayed: appearances.filter((item) => item.played).length, courseAppearancesUnplayed: appearances.filter((item) => !item.played).length, authoritativeFixtures: fixtures.length } }
}

function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}` }; return JSON.stringify(value) }

export async function manualHistoricalSourceSha(draft: ManualHistoricalMatchDraft) {
  const preview = manualHistoricalMatchPreview(draft)
  const facts = { entryMethod: "manual", evidenceLevel: draft.evidenceLevel, seasonNumber: draft.seasonNumber, historicalLabel: draft.historicalLabel, year: draft.year, sourceReference: draft.sourceReference, courses: preview.courses, divisions: preview.divisions.map((division) => ({ divisionNumber: division.divisionNumber, standings: division.standings.map(({ finalRank, historicalDisplayName, played, wins, losses, draws, points, holesWon, courses }) => ({ finalRank, historicalDisplayName, played, wins, losses, draws, points, holesWon, courses: courses.map(({ courseName, played: coursePlayed, outcome, holesWon: courseHw }) => ({ courseName, played: coursePlayed, outcome, holesWon: courseHw })) })) })), fixtures: preview.fixtures }
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(facts))).then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""))
}
