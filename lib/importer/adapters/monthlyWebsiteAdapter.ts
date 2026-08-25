export type MonthlyWebsiteLeader = {
  placement: number | null
  historicalPlayerName: string
  sourcePlayerId: string | null
  coursesPlayed: number | null
  totalStrokes: number | null
  overallHn1: number | null
  overallPoints: number | null
}

export type MonthlyWebsiteCourseRow = {
  placement: number | null
  historicalPlayerName: string
  sourcePlayerId: string | null
  score: number | null
  holeInOnes: number | null
  points: number | null
}

export type MonthlyWebsiteCourse = {
  course: string
  difficulty: "easy" | "hard"
  rows: MonthlyWebsiteCourseRow[]
}

export type MonthlyWebsiteDivisionView = {
  period: string
  division: string
  sourceUrl: string
  periodId: number | null
  leaders: MonthlyWebsiteLeader[]
  courses: MonthlyWebsiteCourse[]
}

export type MonthlyWebsiteObservation = {
  sourceRow: number
  period: string
  year: number
  month: number
  periodId: number | null
  division: string
  historicalPlayerName: string
  sourcePlayerId: string | null
  courseName: string
  difficulty: "easy" | "hard"
  score: number | null
  holeInOnes: number | null
  coursePlacement: number | null
  coursePoints: number | null
  overallPlacement: number | null
  coursesPlayed: number | null
  totalStrokes: number | null
  overallHn1: number | null
  overallPoints: number | null
  sourceUrl: string
  sourceFingerprint: string
  issues: string[]
}

export type MonthlyWebsitePreview = {
  rows: MonthlyWebsiteObservation[]
  summary: {
    totalRows: number
    scoreRows: number
    missingScoreRows: number
    duplicateRows: number
    conflictingRows: number
    negativeScores: number
    totalMismatches: number
  }
}

export type MonthlyWebsiteCsvRow = Record<string, string>

const months = new Map([
  ["January", 1], ["February", 2], ["March", 3], ["April", 4],
  ["May", 5], ["June", 6], ["July", 7], ["August", 8],
  ["September", 9], ["October", 10], ["November", 11], ["December", 12],
])

function parsePeriod(period: string) {
  const match = period.trim().match(/^(\d{4})\s+([A-Za-z]+)$/)
  const month = match ? months.get(match[2]) ?? null : null
  const year = match ? Number(match[1]) : null
  if (year === null || month === null || !Number.isSafeInteger(year)) throw new Error(`Invalid Monthly period: ${period}`)
  return { year, month }
}

function fingerprint(row: Omit<MonthlyWebsiteObservation, "sourceFingerprint" | "issues" | "sourceRow">) {
  return [
    "monthly-website", row.period, row.periodId, row.division, row.historicalPlayerName,
    row.sourcePlayerId, row.courseName, row.difficulty, row.score, row.holeInOnes,
    row.coursePlacement, row.coursePoints,
  ].map(value => String(value ?? "∅")).join("\u001f")
}

function leaderMap(leaders: MonthlyWebsiteLeader[]) {
  return new Map(leaders.map(leader => [leader.historicalPlayerName, leader]))
}

export function previewMonthlyWebsiteViews(views: MonthlyWebsiteDivisionView[]): MonthlyWebsitePreview {
  const rows: MonthlyWebsiteObservation[] = []
  let sourceRow = 0
  for (const view of views) {
    if (!view.division.trim()) throw new Error("Monthly division is required")
    const { year, month } = parsePeriod(view.period)
    const leaders = leaderMap(view.leaders)
    for (const course of view.courses) {
      if (!course.course.trim()) throw new Error("Monthly course name is required")
      for (const source of course.rows) {
        if (!source.historicalPlayerName.trim()) continue
        const leader = leaders.get(source.historicalPlayerName)
        const base = {
          period: view.period,
          year,
          month,
          periodId: view.periodId,
          division: view.division,
          historicalPlayerName: source.historicalPlayerName,
          sourcePlayerId: source.sourcePlayerId,
          courseName: course.course,
          difficulty: course.difficulty,
          score: source.score,
          holeInOnes: source.holeInOnes,
          coursePlacement: source.placement,
          coursePoints: source.points,
          overallPlacement: leader?.placement ?? null,
          coursesPlayed: leader?.coursesPlayed ?? null,
          totalStrokes: leader?.totalStrokes ?? null,
          overallHn1: leader?.overallHn1 ?? null,
          overallPoints: leader?.overallPoints ?? null,
          sourceUrl: view.sourceUrl,
        } satisfies Omit<MonthlyWebsiteObservation, "sourceFingerprint" | "issues" | "sourceRow">
        const issues = source.score === null ? ["Score is missing from the authoritative rendered row."] : []
        rows.push({ ...base, sourceRow: ++sourceRow, sourceFingerprint: fingerprint(base), issues })
      }
    }
  }

  const occurrences = new Map<string, MonthlyWebsiteObservation[]>()
  for (const row of rows) occurrences.set(row.sourceFingerprint, [...(occurrences.get(row.sourceFingerprint) ?? []), row])
  const duplicateRows = rows.filter(row => (occurrences.get(row.sourceFingerprint)?.length ?? 0) > 1).length
  const conflictingRows = [...new Map(rows.map(row => [`${row.period}|${row.division}|${row.historicalPlayerName}|${row.courseName}|${row.difficulty}`, row.score])).entries()]
    .filter(([key]) => new Set(rows.filter(row => `${row.period}|${row.division}|${row.historicalPlayerName}|${row.courseName}|${row.difficulty}` === key).map(row => row.score)).size > 1).length
  const totalMismatches = views.reduce((count, view) => {
    const byName = new Map<string, number[]>()
    for (const course of view.courses) for (const row of course.rows) if (row.score !== null) byName.set(row.historicalPlayerName, [...(byName.get(row.historicalPlayerName) ?? []), row.score])
    return count + view.leaders.filter(leader => {
      const scores = byName.get(leader.historicalPlayerName) ?? []
      return leader.totalStrokes !== null && leader.coursesPlayed !== null && scores.length === leader.coursesPlayed && scores.length > 0 && scores.reduce((sum, score) => sum + score, 0) !== leader.totalStrokes
    }).length
  }, 0)
  return {
    rows,
    summary: {
      totalRows: rows.length,
      scoreRows: rows.filter(row => row.score !== null).length,
      missingScoreRows: rows.filter(row => row.score === null).length,
      duplicateRows,
      conflictingRows,
      negativeScores: rows.filter(row => row.score !== null && row.score < 0).length,
      totalMismatches,
    },
  }
}

function csvInteger(value: string | undefined) {
  const normalized = value?.trim() ?? ""
  if (!normalized || !/^-?\d+$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function summarizeMonthlyRows(rows: MonthlyWebsiteObservation[], totalMismatches: number): MonthlyWebsitePreview {
  const fingerprints = new Map<string, number>()
  const observations = new Map<string, Set<number | null>>()
  for (const row of rows) {
    fingerprints.set(row.sourceFingerprint, (fingerprints.get(row.sourceFingerprint) ?? 0) + 1)
    const key = `${row.period}|${row.division}|${row.historicalPlayerName}|${row.courseName}|${row.difficulty}`
    observations.set(key, new Set([...(observations.get(key) ?? []), row.score]))
  }
  return {
    rows,
    summary: {
      totalRows: rows.length,
      scoreRows: rows.filter(row => row.score !== null).length,
      missingScoreRows: rows.filter(row => row.score === null).length,
      duplicateRows: rows.filter(row => (fingerprints.get(row.sourceFingerprint) ?? 0) > 1).length,
      conflictingRows: [...observations.values()].filter(scores => scores.size > 1).length,
      negativeScores: rows.filter(row => row.score !== null && row.score < 0).length,
      totalMismatches,
    },
  }
}

export function previewMonthlyWebsiteCsvRows(sourceRows: MonthlyWebsiteCsvRow[]): MonthlyWebsitePreview {
  const rows: MonthlyWebsiteObservation[] = sourceRows.map((source, index) => {
    const base = {
      period: source.period?.trim() ?? "",
      year: csvInteger(source.year) ?? 0,
      month: csvInteger(source.month) ?? 0,
      periodId: csvInteger(source.period_id),
      division: source.division?.trim() ?? "",
      historicalPlayerName: source.historical_player_name ?? "",
      sourcePlayerId: source.source_player_id?.trim() || null,
      courseName: source.course_name?.trim() ?? "",
      difficulty: source.difficulty === "hard" ? "hard" as const : "easy" as const,
      score: csvInteger(source.score),
      holeInOnes: csvInteger(source.hole_in_ones),
      coursePlacement: csvInteger(source.course_placement),
      coursePoints: csvInteger(source.course_points),
      overallPlacement: csvInteger(source.overall_placement),
      coursesPlayed: csvInteger(source.courses_played),
      totalStrokes: csvInteger(source.total_strokes),
      overallHn1: csvInteger(source.overall_hole_in_ones),
      overallPoints: csvInteger(source.overall_points),
      sourceUrl: source.source_url?.trim() ?? "",
    } satisfies Omit<MonthlyWebsiteObservation, "sourceFingerprint" | "issues" | "sourceRow">
    const issues: string[] = []
    if (!base.period || base.year === 0 || base.month === 0) issues.push("Period is missing or invalid.")
    if (!base.division) issues.push("Division is missing.")
    if (!base.historicalPlayerName.trim()) issues.push("Historical player name is missing.")
    if (!base.courseName) issues.push("Course name is missing.")
    if (base.score === null) issues.push("Score is missing from the authoritative rendered row.")
    return { ...base, sourceRow: csvInteger(source.source_row) ?? index + 1, sourceFingerprint: fingerprint(base), issues }
  })

  const byPlayerPeriod = new Map<string, MonthlyWebsiteObservation[]>()
  for (const row of rows) {
    const key = `${row.period}|${row.division}|${row.historicalPlayerName}`
    byPlayerPeriod.set(key, [...(byPlayerPeriod.get(key) ?? []), row])
  }
  const totalMismatches = [...byPlayerPeriod.values()].filter(group => {
    const first = group[0]
    const scores = group.map(row => row.score).filter((score): score is number => score !== null)
    return first.totalStrokes !== null && first.coursesPlayed !== null && scores.length === first.coursesPlayed && scores.length > 0 && scores.reduce((sum, score) => sum + score, 0) !== first.totalStrokes
  }).length
  return summarizeMonthlyRows(rows, totalMismatches)
}
