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

export type MonthlyOverallConflict = {
  key: string
  playerName: string
  fields: string[]
  values: Record<string, number[]>
}

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

const overallFields = ["overallPlacement", "coursesPlayed", "totalStrokes", "overallHoleInOnes", "overallPoints"] as const

function rowMetadataCompleteness(row: MonthlyPresentationRow) {
  return overallFields.reduce((count, field) => count + (row[field] !== null && Number.isFinite(row[field]) ? 1 : 0), 0)
}

function stableRowOrder(left: MonthlyPresentationRow, right: MonthlyPresentationRow) {
  return rowMetadataCompleteness(right) - rowMetadataCompleteness(left)
    || left.courseName.localeCompare(right.courseName)
    || left.difficulty.localeCompare(right.difficulty)
}

export function buildMonthlyOverallRows(rows: MonthlyPresentationRow[]) {
  const groups = new Map<string, MonthlyPresentationRow[]>()
  for (const row of rows) {
    const key = `${monthlyPeriodRecordKey(row)}:${row.canonicalPlayerId}`
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }

  const overallRows: MonthlyPresentationRow[] = []
  const conflicts: MonthlyOverallConflict[] = []

  for (const [key, group] of groups) {
    const candidates = group.filter(row => row.overallPoints !== null && Number.isFinite(row.overallPoints))
    if (candidates.length === 0) continue

    const values: Record<string, number[]> = {}
    const fields: string[] = []
    for (const field of overallFields) {
      const distinctValues = Array.from(new Set(candidates
        .map(row => row[field])
        .filter((value): value is number => value !== null && Number.isFinite(value))))
      if (distinctValues.length > 1) {
        fields.push(field)
        values[field] = distinctValues
      }
    }

    if (fields.length > 0) {
      conflicts.push({ key, playerName: candidates[0].playerName, fields, values })
      continue
    }

    const representative = candidates.slice().sort(stableRowOrder)[0]
    const merged = { ...representative }
    for (const field of overallFields) {
      const value = candidates
        .map(row => row[field])
        .find((candidate): candidate is number => candidate !== null && Number.isFinite(candidate))
      merged[field] = value ?? null
    }
    overallRows.push(merged)
  }

  return { rows: overallRows, conflicts }
}

export function uniqueMonthlyPeriodRecords(rows: MonthlyPresentationRow[]) {
  const overall = buildMonthlyOverallRows(rows)
  const overallByPeriod = new Map(overall.rows.map(row => [monthlyPeriodRecordKey(row), row]))
  const groups = new Map<string, MonthlyPresentationRow[]>()
  for (const row of rows) {
    const key = monthlyPeriodRecordKey(row)
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }

  return Array.from(groups, ([key, group]) => {
    const overallRow = overallByPeriod.get(key)
    if (overallRow) return overallRow
    const representative = group.slice().sort(stableRowOrder)[0]
    return { ...representative, overallPlacement: null, coursesPlayed: null, totalStrokes: null, overallHoleInOnes: null, overallPoints: null }
  })
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
