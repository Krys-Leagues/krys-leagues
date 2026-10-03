export type DoublesHoleRows = { homePlayerOne: number[]; homePlayerTwo: number[]; awayPlayerOne: number[]; awayPlayerTwo: number[] }
export type DoublesCourseTotals = { homeHolesWon: number; awayHolesWon: number; tiedHoles: number; invalidHoles: number }

export function validateDoublesHoleRow(row: unknown): row is number[] {
  return Array.isArray(row) && row.length === 18 && row.every((value) => value === 0 || value === 1)
}

export function deriveDoublesCourseTotals(rows: DoublesHoleRows): DoublesCourseTotals {
  if (![rows.homePlayerOne, rows.homePlayerTwo, rows.awayPlayerOne, rows.awayPlayerTwo].every(validateDoublesHoleRow)) {
    throw new Error("Each Doubles team requires two 18-hole rows containing only 0 or 1")
  }
  let homeHolesWon = 0
  let awayHolesWon = 0
  let tiedHoles = 0
  let invalidHoles = 0
  for (let index = 0; index < 18; index += 1) {
    const homeAlive = rows.homePlayerOne[index] === 1 || rows.homePlayerTwo[index] === 1
    const awayAlive = rows.awayPlayerOne[index] === 1 || rows.awayPlayerTwo[index] === 1
    if (homeAlive && awayAlive) tiedHoles += 1
    else if (homeAlive) homeHolesWon += 1
    else if (awayAlive) awayHolesWon += 1
    else invalidHoles += 1
  }
  return { homeHolesWon, awayHolesWon, tiedHoles, invalidHoles }
}

export function deriveDoublesOverallResult(homeCourse: DoublesCourseTotals, awayCourse: DoublesCourseTotals) {
  if (homeCourse.invalidHoles || awayCourse.invalidHoles) throw new Error("0+0 versus 0+0 requires correction before a result can be calculated")
  const homeHolesWon = homeCourse.homeHolesWon + awayCourse.homeHolesWon
  const awayHolesWon = homeCourse.awayHolesWon + awayCourse.awayHolesWon
  return { homeHolesWon, awayHolesWon, outcome: homeHolesWon > awayHolesWon ? "HOME_WIN" as const : awayHolesWon > homeHolesWon ? "AWAY_WIN" as const : "DRAW" as const }
}

export function provisionalDoublesState(input: { homeSubmitted: boolean; awaySubmitted: boolean; homeCourseComplete: boolean; awayCourseComplete: boolean; homeOverall: number | null; awayOverall: number | null }) {
  if (!input.homeSubmitted && !input.awaySubmitted) return "LIVE" as const
  if (!input.homeSubmitted || !input.awaySubmitted || !input.homeCourseComplete || !input.awayCourseComplete) return "LIVE" as const
  if (input.homeOverall === null || input.awayOverall === null || input.homeOverall !== input.awayOverall) return "ADMIN_REVIEW_NEEDED" as const
  return "PENDING" as const
}
