import type { HistoricalMatchCourse, HistoricalMatchFixture, HistoricalMatchOutcome } from "./adapters/matchAdapter"

export type FixtureCourseInput = { id: string; name: string }
export type FixtureStandingInput = { id: string; finalRank: number; historicalDisplayName: string }
export type FixtureDivisionInput = { id: string; divisionNumber: number; standings: FixtureStandingInput[] }
export type ManualMatchFixture = { id: string; divisionId: string; courseId: string; player1StandingId: string; player2StandingId: string; played: boolean; player1HolesWon: number | null; player2HolesWon: number | null }
export type FixtureStandingTotals = { played: number; wins: number; losses: number; draws: number; points: number; holesWon: number }
export type HistoricalMatchFixtureCalculation = { fixtures: HistoricalMatchFixture[]; totalsByStandingId: Map<string, FixtureStandingTotals>; appearancesByStandingId: Map<string, HistoricalMatchCourse[]>; errors: string[] }

const emptyTotals = (): FixtureStandingTotals => ({ played: 0, wins: 0, losses: 0, draws: 0, points: 0, holesWon: 0 })

export function calculateHistoricalMatchFixtures(courses: FixtureCourseInput[], divisions: FixtureDivisionInput[], fixtureInputs: ManualMatchFixture[], sourceReference = ""): HistoricalMatchFixtureCalculation {
  const errors: string[] = [], totalsByStandingId = new Map<string, FixtureStandingTotals>(), appearancesByStandingId = new Map<string, HistoricalMatchCourse[]>(), facts: HistoricalMatchFixture[] = []
  const divisionById = new Map(divisions.map((division) => [division.id, division]))
  const courseById = new Map(courses.map((course, index) => [course.id, { ...course, order: index + 1 }]))
  const used = new Set<string>(), pairs = new Set<string>()
  for (const division of divisions) for (const standing of division.standings) totalsByStandingId.set(standing.id, emptyTotals())
  for (const input of fixtureInputs) {
    const division = divisionById.get(input.divisionId), course = courseById.get(input.courseId)
    const player1 = division?.standings.find((standing) => standing.id === input.player1StandingId), player2 = division?.standings.find((standing) => standing.id === input.player2StandingId)
    const label = `${division ? `Division ${division.divisionNumber}` : "Unknown division"}, ${course?.name || "unnamed course"}`
    if (!division) errors.push(`${label}: fixture division is invalid.`)
    if (!course || !course.name.trim()) errors.push(`${label}: fixture course is missing or unnamed.`)
    if (!player1 || !player2) errors.push(`${label}: both fixture participants must belong to this division.`)
    if (!division || !course || !player1 || !player2) continue
    if (player1.id === player2.id) errors.push(`${label}: a player cannot be paired against themselves.`)
    const playerKeys = [`${division.id}:${course.id}:${player1.id}`, `${division.id}:${course.id}:${player2.id}`]
    if (playerKeys.some((key) => used.has(key))) errors.push(`${label}: a player appears more than once on this course.`)
    playerKeys.forEach((key) => used.add(key))
    const pairKey = `${division.id}:${course.id}:${[player1.id, player2.id].sort().join(":")}`
    if (pairs.has(pairKey)) errors.push(`${label}: this pairing is duplicated or reversed.`)
    pairs.add(pairKey)
    if (input.played) {
      if (!Number.isInteger(input.player1HolesWon) || input.player1HolesWon! < 0 || !Number.isInteger(input.player2HolesWon) || input.player2HolesWon! < 0) { errors.push(`${label}: played fixtures require two whole-number HW values of zero or greater.`); continue }
    } else if (input.player1HolesWon !== null || input.player2HolesWon !== null) { errors.push(`${label}: Did Not Play fixtures require both HW values to be blank.`); continue }
    const p1Hw = input.played ? input.player1HolesWon! : null, p2Hw = input.played ? input.player2HolesWon! : null
    facts.push({ divisionNumber: division.divisionNumber, courseOrder: course.order, courseName: course.name, player1FinalRank: player1.finalRank, player2FinalRank: player2.finalRank, played: input.played, player1HolesWon: p1Hw, player2HolesWon: p2Hw, sourceReference: sourceReference.trim() || null })
    let p1Outcome: HistoricalMatchOutcome | null = null, p2Outcome: HistoricalMatchOutcome | null = null
    if (input.played) {
      p1Outcome = p1Hw! > p2Hw! ? "W" : p1Hw! < p2Hw! ? "L" : "D"; p2Outcome = p1Outcome === "W" ? "L" : p1Outcome === "L" ? "W" : "D"
      for (const [standing, outcome, holesWon] of [[player1, p1Outcome, p1Hw], [player2, p2Outcome, p2Hw]] as const) { const totals = totalsByStandingId.get(standing.id)!; totals.played += 1; if (outcome === "W") totals.wins += 1; if (outcome === "L") totals.losses += 1; if (outcome === "D") totals.draws += 1; totals.points = totals.wins * 3 + totals.draws; totals.holesWon += holesWon! }
    }
    for (const [standing, outcome, holesWon] of [[player1, p1Outcome, p1Hw], [player2, p2Outcome, p2Hw]] as const) { const appearances = appearancesByStandingId.get(standing.id) ?? []; appearances.push({ courseName: course.name, played: input.played, outcome, holesWon, sourceHolesWon: holesWon }); appearancesByStandingId.set(standing.id, appearances) }
  }
  facts.sort((a, b) => a.divisionNumber - b.divisionNumber || a.courseOrder - b.courseOrder || a.player1FinalRank - b.player1FinalRank || a.player2FinalRank - b.player2FinalRank)
  return { fixtures: facts, totalsByStandingId, appearancesByStandingId, errors: Array.from(new Set(errors)) }
}
