import type { KwtDivision } from "./kwtNetCompetition.ts"

export type KwtSeason15Week = {
  season: 15
  week: number
  eventIdentifier: `KWTS15W${number}`
  courseName: string
  easyCourseCode: string
  hardCourseCode: string
}

/**
 * The Season 15 order is an approved planning contract. Dates and freeze
 * cutoffs deliberately do not live here: they must come from an authorized
 * Week Setup record before a week becomes active.
 */
export const KWT_SEASON_15_WEEKS: readonly KwtSeason15Week[] = [
  ["Raptor Cliffs", "RCE", "RCH"],
  ["Wallace & Gromit", "WGE", "WGH"],
  ["Myst", "MYE", "MYH"],
  ["Around the World", "AWE", "AWH"],
  ["Viva Las Elvis", "ELE", "ELH"],
  ["Gloop Lair", "GLE", "GLH"],
  ["20,000 Leagues", "TLE", "TLH"],
  ["Escape from Planet Xylodon", "XPE", "XPH"],
  ["Holiday Hideaway", "HHE", "HHH"],
  ["Original Gothic", "OGE", "OGH"],
  ["Crystal Lair", "CLE", "CLH"],
  ["Labyrinth", "LBE", "LBH"],
].map(([courseName, easyCourseCode, hardCourseCode], index) => ({
  season: 15,
  week: index + 1,
  eventIdentifier: `KWTS15W${String(index + 1).padStart(2, "0")}` as `KWTS15W${number}`,
  courseName,
  easyCourseCode,
  hardCourseCode,
}))

export const KWT_NET_DIVISION_FILTERS: readonly (KwtDivision | "PROVISIONAL" | "ALL")[] = [
  "ALL", "ELITE", "PRO", "SEMI-PRO", "AMATEUR", "PROVISIONAL",
]

export type KwtVerifiedPointsSchedule = readonly number[]

/**
 * Tied players share competition rank and therefore share the points for that
 * rank. The first ten values are verified by the published Week 01 export;
 * ranks 11–19 use the approved 9-to-1 continuation. Ranks after 19 receive
 * zero, never a fabricated value.
 */
export const KWT_OFFICIAL_POINTS: KwtVerifiedPointsSchedule = [25, 21, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

export function pointsForKwtRank(rank: number, schedule: KwtVerifiedPointsSchedule = KWT_OFFICIAL_POINTS): number | null {
  if (!Number.isInteger(rank) || rank < 1) return null
  return schedule[rank - 1] ?? 0
}

export function filterKwtDivision<T extends { division?: string | null }>(rows: readonly T[], division: KwtDivision | "PROVISIONAL" | "ALL") {
  if (division === "ALL") return [...rows]
  return rows.filter((row) => row.division === division)
}

export function isSeason15Week(value: KwtSeason15Week, week: number) {
  return value.season === 15 && value.week === week
}
