export const HISTORICAL_STROKE_PARSER_VERSION = "historical-stroke-v1"

export type HistoricalStrokeOutcome = "W" | "L" | "D"

export type HistoricalStrokeIssue = {
  code: string
  message: string
  sourceRow: number | null
  divisionNumber: number | null
  historicalDisplayName: string | null
}

export type HistoricalStrokeCourseAppearance = {
  courseOrder: number
  courseName: string
  played: boolean
  score: number | null
  rawScoreToken: string
  winMarker: boolean
  lossMarker: boolean
  drawMarker: boolean
  outcome: HistoricalStrokeOutcome | null
}

export type HistoricalStrokeStanding = {
  divisionNumber: number
  sourceRow: number
  sourcePosition: number | null
  historicalDisplayName: string
  canonicalPlayerId: string | null
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  strokes: number
  sourceDisplayPosition: number | null
  courses: HistoricalStrokeCourseAppearance[]
}

export type HistoricalStrokeDivision = {
  divisionNumber: number
  sourceLabel: string
  populated: boolean
  standings: HistoricalStrokeStanding[]
  sourceDisplayOrder: string[]
}

export type HistoricalStrokeClassifiedRow = {
  classification: "bye" | "template"
  divisionNumber: number
  sourceRow: number
  sourcePosition: number | null
  sourceName: string
  rawValues: string[]
}

export type HistoricalStrokePreview = {
  parserVersion: string
  source: {
    filename: string | null
    sourceSha256: string | null
    rows: number
    columnsPerRow: number | null
  }
  season: {
    seasonNumber: number | null
    historicalSeasonLabel: string
    rawHeader: string
    historicalYear: null
    rawEndDateText: string
  }
  divisions: HistoricalStrokeDivision[]
  byeRows: HistoricalStrokeClassifiedRow[]
  templateRows: HistoricalStrokeClassifiedRow[]
  malformedRows: Array<{
    divisionNumber: number
    sourceRow: number
    sourceName: string
    rawValues: string[]
    reason: string
  }>
  issues: HistoricalStrokeIssue[]
  audit: {
    sourceRowsScanned: number
    columnsPerRow: number | null
    divisionsFound: number
    populatedDivisions: number
    standingsParsed: number
    byeRowsClassified: number
    templateRowsClassified: number
    duplicateRecordsCollapsed: number
    leftRightConflicts: number
    malformedRealPlayerRows: number
    statisticalConflicts: number
    totalCourseAppearances: number
    playedCourseAppearances: number
    unplayedCourseAppearances: number
    negativePlayedScores: number
    positivePlayedScores: number
    numericZeroPlayedScores: number
    historicalFixtures: 0
  }
}

export type HistoricalStrokeParserOptions = {
  filename?: string
  sourceSha256?: string
}

type SideRecord = Omit<HistoricalStrokeStanding, "sourceDisplayPosition"> & {
  rawValues: string[]
}

const HALF_WIDTH = 20
const COURSE_NAMES = ["8BIT EASY", "ALICE HARD", "UPSIDE EASY"] as const
const COURSE_STARTS = [8, 12, 16] as const

function trimCell(matrix: string[][], row: number, column: number) {
  return String(matrix[row]?.[column] ?? "").trim()
}

function parseInteger(value: string) {
  if (!/^-?\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function markerIsSet(value: string) {
  const trimmed = value.trim()
  return trimmed !== "" && trimmed !== "0"
}

function parseCourse(
  matrix: string[][],
  row: number,
  offset: number,
  courseIndex: number
): HistoricalStrokeCourseAppearance {
  const start = offset + COURSE_STARTS[courseIndex]
  const rawScoreToken = trimCell(matrix, row, start)
  const score = rawScoreToken === "-" || rawScoreToken === "" ? null : parseInteger(rawScoreToken)
  const winMarker = markerIsSet(trimCell(matrix, row, start + 1))
  const lossMarker = markerIsSet(trimCell(matrix, row, start + 2))
  const drawMarker = markerIsSet(trimCell(matrix, row, start + 3))
  const outcomes = [winMarker && "W", lossMarker && "L", drawMarker && "D"].filter(Boolean) as HistoricalStrokeOutcome[]
  const played = score !== null || outcomes.length > 0
  return {
    courseOrder: courseIndex + 1,
    courseName: COURSE_NAMES[courseIndex],
    played,
    score,
    rawScoreToken,
    winMarker,
    lossMarker,
    drawMarker,
    outcome: outcomes.length === 1 ? outcomes[0] : null,
  }
}

function parseSideRecord(
  matrix: string[][],
  row: number,
  offset: number,
  divisionNumber: number
): { record: SideRecord | null; malformedReason: string | null; name: string; position: number | null } {
  const name = trimCell(matrix, row, offset + 1)
  const position = parseInteger(trimCell(matrix, row, offset))
  if (!name) return { record: null, malformedReason: null, name, position }
  const totalCells = Array.from({ length: 6 }, (_, index) => trimCell(matrix, row, offset + 2 + index))
  const totals = totalCells.map(parseInteger)
  if (totals.some((value) => value === null)) {
    return { record: null, malformedReason: "Overall P/W/D/L/PTS/STROKES values must be integers.", name, position }
  }
  const [played, wins, draws, losses, points, strokes] = totals as number[]
  return {
    name,
    position,
    malformedReason: null,
    record: {
      divisionNumber,
      sourceRow: row + 1,
      sourcePosition: position,
      historicalDisplayName: name,
      canonicalPlayerId: null,
      played,
      wins,
      draws,
      losses,
      points,
      strokes,
      courses: COURSE_NAMES.map((_, index) => parseCourse(matrix, row, offset, index)),
      rawValues: matrix[row].slice(offset, offset + HALF_WIDTH),
    },
  }
}

function recordSignature(record: SideRecord) {
  return JSON.stringify({
    totals: [record.played, record.wins, record.draws, record.losses, record.points, record.strokes],
    courses: record.courses.map((course) => [
      course.rawScoreToken,
      course.winMarker,
      course.lossMarker,
      course.drawMarker,
    ]),
  })
}

function addIssue(
  issues: HistoricalStrokeIssue[],
  code: string,
  message: string,
  standing: Pick<HistoricalStrokeStanding, "sourceRow" | "divisionNumber" | "historicalDisplayName">
) {
  issues.push({
    code,
    message,
    sourceRow: standing.sourceRow,
    divisionNumber: standing.divisionNumber,
    historicalDisplayName: standing.historicalDisplayName,
  })
}

function validateStanding(standing: HistoricalStrokeStanding, issues: HistoricalStrokeIssue[]) {
  if (standing.played !== standing.wins + standing.draws + standing.losses) {
    addIssue(issues, "overall_played_mismatch", "P does not equal W + D + L.", standing)
  }
  if (standing.points !== standing.wins * 3 + standing.draws) {
    addIssue(issues, "points_mismatch", "PTS does not equal W * 3 + D.", standing)
  }
  const playedCourses = standing.courses.filter((course) => course.played)
  if (playedCourses.length !== standing.played) {
    addIssue(issues, "played_course_count_mismatch", "Played course count does not equal P.", standing)
  }
  const courseWins = playedCourses.filter((course) => course.outcome === "W").length
  const courseDraws = playedCourses.filter((course) => course.outcome === "D").length
  const courseLosses = playedCourses.filter((course) => course.outcome === "L").length
  if (courseWins !== standing.wins || courseDraws !== standing.draws || courseLosses !== standing.losses) {
    addIssue(issues, "course_outcome_totals_mismatch", "Course W/D/L totals do not equal overall W/D/L.", standing)
  }
  for (const course of standing.courses) {
    const markerCount = Number(course.winMarker) + Number(course.lossMarker) + Number(course.drawMarker)
    if (markerCount > 1) addIssue(issues, "contradictory_course_outcome", `${course.courseName} has contradictory W/L/D markers.`, standing)
    if (course.played && course.score === null) addIssue(issues, "played_course_missing_score", `${course.courseName} is played but has no numeric score.`, standing)
    if (!course.played && markerCount > 0) addIssue(issues, "unplayed_course_has_outcome", `${course.courseName} is unplayed but has a result marker.`, standing)
    if (!course.played && course.rawScoreToken !== "-") addIssue(issues, "unplayed_course_token", `${course.courseName} is unplayed without the standalone '-' token.`, standing)
  }
  if (playedCourses.every((course) => course.score !== null)) {
    const scoreTotal = playedCourses.reduce((sum, course) => sum + (course.score ?? 0), 0)
    if (scoreTotal !== standing.strokes) addIssue(issues, "stroke_total_mismatch", "Played course scores do not sum to STROKES.", standing)
  }
}

export function parseHistoricalStrokeCsvRows(csvText: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    if (character === '"') {
      if (quoted && csvText[index + 1] === '"') {
        value += '"'
        index += 1
      } else quoted = !quoted
    } else if (character === "," && !quoted) {
      row.push(value)
      value = ""
    } else if ((character === "\r" || character === "\n") && !quoted) {
      if (character === "\r" && csvText[index + 1] === "\n") index += 1
      row.push(value)
      rows.push(row)
      row = []
      value = ""
    } else value += character
  }
  if (value !== "" || row.length > 0) {
    row.push(value)
    rows.push(row)
  }
  return rows
}

export function parseHistoricalStrokeMatrix(
  matrix: string[][],
  options: HistoricalStrokeParserOptions = {}
): HistoricalStrokePreview {
  const issues: HistoricalStrokeIssue[] = []
  const widths = new Set(matrix.map((row) => row.length))
  const columnsPerRow = widths.size === 1 ? matrix[0]?.length ?? 0 : null
  if (widths.size !== 1) {
    issues.push({ code: "inconsistent_row_width", message: "CSV rows do not have a consistent column count.", sourceRow: null, divisionNumber: null, historicalDisplayName: null })
  }
  const rawHeader = matrix.flat().map((cell) => cell.trim()).find((cell) => /^SEASON\s+\d+\*/i.test(cell)) ?? ""
  const headerMatch = rawHeader.match(/^SEASON\s+(\d+)(\*)?\s+(ENDS\s+.+)$/i)
  const seasonNumber = headerMatch ? Number(headerMatch[1]) : null
  const historicalSeasonLabel = headerMatch ? `${headerMatch[1]}${headerMatch[2] ?? ""}` : ""
  const rawEndDateText = headerMatch?.[3] ?? ""
  if (!headerMatch) {
    issues.push({ code: "invalid_season_header", message: "Historical Stroke season header was not recognized.", sourceRow: null, divisionNumber: null, historicalDisplayName: null })
  }

  const sectionRows = matrix.flatMap((row, rowIndex) => {
    const match = row[0]?.match(/KRYS' SEASON STROKE\s*-\s*DIVISION\s+(\d+)/i)
    return match ? [{ rowIndex, divisionNumber: Number(match[1]), sourceLabel: row[0].trim() }] : []
  })
  const divisions: HistoricalStrokeDivision[] = []
  const byeRows: HistoricalStrokeClassifiedRow[] = []
  const templateRows: HistoricalStrokeClassifiedRow[] = []
  const malformedRows: HistoricalStrokePreview["malformedRows"] = []
  let duplicateRecordsCollapsed = 0
  let leftRightConflicts = 0

  sectionRows.forEach((section, sectionIndex) => {
    const blockEnd = sectionRows[sectionIndex + 1]?.rowIndex ?? matrix.length
    const headerRow = matrix.slice(section.rowIndex, blockEnd).findIndex((row) => row[1]?.trim() === "PLAYER" && row[21]?.trim() === "PLAYER")
    if (headerRow < 0) {
      issues.push({ code: "missing_division_headers", message: `Division ${section.divisionNumber} column headers were not found.`, sourceRow: section.rowIndex + 1, divisionNumber: section.divisionNumber, historicalDisplayName: null })
      return
    }
    const firstDataRow = section.rowIndex + headerRow + 1
    const leftRecords: SideRecord[] = []
    const rightRecords: SideRecord[] = []
    for (let row = firstDataRow; row < blockEnd; row += 1) {
      if (matrix[row].every((cell) => cell.trim() === "")) continue
      const left = parseSideRecord(matrix, row, 0, section.divisionNumber)
      const right = parseSideRecord(matrix, row, HALF_WIDTH, section.divisionNumber)
      if (section.divisionNumber >= 6 && !left.name) {
        templateRows.push({
          classification: "template",
          divisionNumber: section.divisionNumber,
          sourceRow: row + 1,
          sourcePosition: left.position,
          sourceName: "",
          rawValues: matrix[row].slice(0, HALF_WIDTH),
        })
        continue
      }
      if (left.name.toUpperCase() === "BYE") {
        byeRows.push({ classification: "bye", divisionNumber: section.divisionNumber, sourceRow: row + 1, sourcePosition: left.position, sourceName: left.name, rawValues: matrix[row].slice(0, HALF_WIDTH) })
        if (right.name.toUpperCase() === "BYE") duplicateRecordsCollapsed += 1
        continue
      }
      if (left.malformedReason) {
        malformedRows.push({ divisionNumber: section.divisionNumber, sourceRow: row + 1, sourceName: left.name, rawValues: matrix[row].slice(0, HALF_WIDTH), reason: left.malformedReason })
        continue
      }
      if (left.record) leftRecords.push(left.record)
      if (right.record && right.name.toUpperCase() !== "BYE") rightRecords.push(right.record)
    }
    const rightByName = new Map(rightRecords.map((record, index) => [record.historicalDisplayName, { record, displayPosition: index + 1 }]))
    const standings = leftRecords.map((left) => {
      const right = rightByName.get(left.historicalDisplayName)
      if (!right || recordSignature(left) !== recordSignature(right.record)) {
        leftRightConflicts += 1
        addIssue(issues, "left_right_conflict", right ? "Left and right statistics disagree." : "Matching right-side display record was not found.", left)
      } else duplicateRecordsCollapsed += 1
      const standing: HistoricalStrokeStanding = { ...left, sourceDisplayPosition: right?.displayPosition ?? null }
      validateStanding(standing, issues)
      return standing
    })
    divisions.push({
      divisionNumber: section.divisionNumber,
      sourceLabel: section.sourceLabel,
      populated: standings.length > 0,
      standings,
      sourceDisplayOrder: rightRecords.map((record) => record.historicalDisplayName),
    })
  })

  const standings = divisions.flatMap((division) => division.standings)
  const appearances = standings.flatMap((standing) => standing.courses)
  const playedAppearances = appearances.filter((appearance) => appearance.played)
  const statisticalConflicts = issues.filter((issue) => issue.code !== "left_right_conflict" && issue.code !== "inconsistent_row_width" && issue.code !== "invalid_season_header" && issue.code !== "missing_division_headers").length
  return {
    parserVersion: HISTORICAL_STROKE_PARSER_VERSION,
    source: {
      filename: options.filename ?? null,
      sourceSha256: options.sourceSha256?.toLowerCase() ?? null,
      rows: matrix.length,
      columnsPerRow,
    },
    season: { seasonNumber, historicalSeasonLabel, rawHeader, historicalYear: null, rawEndDateText },
    divisions,
    byeRows,
    templateRows,
    malformedRows,
    issues,
    audit: {
      sourceRowsScanned: matrix.length,
      columnsPerRow,
      divisionsFound: divisions.length,
      populatedDivisions: divisions.filter((division) => division.populated).length,
      standingsParsed: standings.length,
      byeRowsClassified: byeRows.length,
      templateRowsClassified: templateRows.length,
      duplicateRecordsCollapsed,
      leftRightConflicts,
      malformedRealPlayerRows: malformedRows.length,
      statisticalConflicts,
      totalCourseAppearances: appearances.length,
      playedCourseAppearances: playedAppearances.length,
      unplayedCourseAppearances: appearances.length - playedAppearances.length,
      negativePlayedScores: playedAppearances.filter((appearance) => (appearance.score ?? 0) < 0).length,
      positivePlayedScores: playedAppearances.filter((appearance) => (appearance.score ?? 0) > 0).length,
      numericZeroPlayedScores: playedAppearances.filter((appearance) => appearance.score === 0).length,
      historicalFixtures: 0,
    },
  }
}

export function parseHistoricalStrokeCsv(
  csvText: string,
  options: HistoricalStrokeParserOptions = {}
) {
  return parseHistoricalStrokeMatrix(parseHistoricalStrokeCsvRows(csvText), options)
}
