export type MonthlyPresentationRow = {
  canonicalPlayerId: string
  playerName: string
  year: number
  month: number
  division: string
  courseName: string
  difficulty: "easy" | "hard"
  score: number
  holeInOnes: number | null
  coursePlacement: number | null
  coursePoints: number | null
  overallPlacement: number | null
  coursesPlayed: number | null
  totalStrokes: number | null
  overallHoleInOnes: number | null
  overallPoints: number | null
}

export type MonthlyPeriodRecord = MonthlyPresentationRow

export type MonthlyCareerStats = {
  eventsPlayed: number
  scoredCourses: number
  averageCourseScore: number | null
  bestCourseScore: number | null
  totalHoleInOnes: number | null
  averageHoleInOnes: number | null
  bestOverallFinish: number | null
  wins: number
  topThreeFinishes: number
  totalPoints: number | null
  averagePoints: number | null
  bestTotalStrokes: number | null
  averageTotalStrokes: number | null
}

export function monthlyPeriodKey(row: Pick<MonthlyPresentationRow, "year" | "month">) {
  return `${row.year}-${String(row.month).padStart(2, "0")}`
}

export function monthlyPeriodRecordKey(row: Pick<MonthlyPresentationRow, "year" | "month" | "division">) {
  return `${monthlyPeriodKey(row)}:${row.division}`
}

export function uniqueMonthlyPeriodRecords(rows: MonthlyPresentationRow[]) {
  return Array.from(new Map(rows.map(row => [monthlyPeriodRecordKey(row), row])).values())
    .sort((left, right) => right.year - left.year || right.month - left.month || left.division.localeCompare(right.division))
}

export function monthlyCourseMapName(courseName: string) {
  return courseName.trim().replace(/\s+(?:easy|hard)$/i, "").trim() || courseName.trim()
}

export function calculateMonthlyCareerStats(rows: MonthlyPresentationRow[]): MonthlyCareerStats {
  const periodRecords = uniqueMonthlyPeriodRecords(rows)
  const eventKeys = new Set(rows.map(monthlyPeriodKey))
  const scores = rows.filter(row => Number.isFinite(row.score)).map(row => row.score)
  const holeInOnes = rows.map(row => row.holeInOnes).filter((value): value is number => value !== null && Number.isFinite(value))
  const placements = periodRecords.map(row => row.overallPlacement).filter((value): value is number => value !== null && Number.isFinite(value))
  const points = periodRecords.map(row => row.overallPoints).filter((value): value is number => value !== null && Number.isFinite(value))
  const totalStrokes = periodRecords.map(row => row.totalStrokes).filter((value): value is number => value !== null && Number.isFinite(value))
  const podiumEventKeys = (limit: number) => new Set(periodRecords.filter(row => row.overallPlacement !== null && row.overallPlacement <= limit).map(monthlyPeriodKey)).size

  return {
    eventsPlayed: eventKeys.size,
    scoredCourses: rows.length,
    averageCourseScore: scores.length ? scores.reduce((total, value) => total + value, 0) / scores.length : null,
    bestCourseScore: scores.length ? Math.min(...scores) : null,
    totalHoleInOnes: holeInOnes.length ? holeInOnes.reduce((total, value) => total + value, 0) : null,
    averageHoleInOnes: holeInOnes.length ? holeInOnes.reduce((total, value) => total + value, 0) / holeInOnes.length : null,
    bestOverallFinish: placements.length ? Math.min(...placements) : null,
    wins: podiumEventKeys(1),
    topThreeFinishes: podiumEventKeys(3),
    totalPoints: points.length ? points.reduce((total, value) => total + value, 0) : null,
    averagePoints: points.length ? points.reduce((total, value) => total + value, 0) / points.length : null,
    bestTotalStrokes: totalStrokes.length ? Math.min(...totalStrokes) : null,
    averageTotalStrokes: totalStrokes.length ? totalStrokes.reduce((total, value) => total + value, 0) / totalStrokes.length : null,
  }
}
