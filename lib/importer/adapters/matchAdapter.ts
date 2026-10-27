export const HISTORICAL_MATCH_COURSES = [
  "BLOKHAVEN EASY",
  "FORGOTTEN FAIRYLAND HARD",
  "HOLLYWOOD EASY",
] as const

export type HistoricalMatchOutcome = "W" | "L" | "D"

export type HistoricalMatchCourse = {
  courseName: string
  played: boolean
  outcome: HistoricalMatchOutcome | null
  holesWon: number | null
  sourceHolesWon: number | null
}

export type HistoricalMatchStanding = {
  divisionNumber: number
  finalRank: number
  historicalDisplayName: string
  played: number
  wins: number
  losses: number
  draws: number
  points: number
  holesWon: number
  courses: HistoricalMatchCourse[]
  canonicalPlayerId: string | null
  warnings: string[]
}

export type HistoricalMatchIgnoredRow = {
  divisionNumber: number
  sourceRow: number
  sourceName: string
  classification: "template_placeholder" | "blank_template_slot" | "structural_header" | "malformed"
  reason: string
}

export type HistoricalMatchFixture = {
  divisionNumber: number
  courseOrder: number
  courseName: string
  player1FinalRank: number
  player2FinalRank: number
  played: boolean
  player1HolesWon: number | null
  player2HolesWon: number | null
  sourceReference?: string | null
}

export type HistoricalMatchPreview = {
  evidenceLevel: "standings_only" | "aggregate_course" | "fixture_detailed"
  layout: "duplicated_final_side" | "single_side" | "ambiguous"
  seasonNumber: number | null
  historicalLabel: string
  year: number | null
  courses: string[]
  divisions: Array<{
    divisionNumber: number
    standings: HistoricalMatchStanding[]
  }>
  fixtures: HistoricalMatchFixture[]
  ignoredRows: HistoricalMatchIgnoredRow[]
  warnings: string[]
  audit: {
    seasonsFound: number
    populatedDivisions: number
    realPlayerRows: number
    duplicateHorizontalCopiesCollapsed: number
    templateRowsIgnored: number
    structuralHeadersIgnored: number
    malformedRows: number
    conflicts: number
    courseAppearancesPlayed: number
    courseAppearancesUnplayed: number
    authoritativeFixtures: number
  }
}

type SideLayout = {
  markerColumn: number
  headerRow: number
  nameColumn: number
  totals: [number, number, number, number, number, number]
  courseGroups: Array<[number, number, number, number]>
  courseNames: string[]
}

const OUTCOME_HEADERS = ["W", "L", "D", "HW"]
const TOTAL_HEADERS = ["P", "W", "L", "D", "PTS", "HW"]

function cell(matrix: string[][], row: number, column: number) {
  return String(matrix[row]?.[column] ?? "").trim()
}

function upper(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ")
}

function numberValue(value: string) {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isDash(value: string) {
  return /^[-–—]$/.test(value.trim())
}

function totalNumberValue(value: string) {
  if (value.trim() === "" || isDash(value)) return 0
  return numberValue(value)
}

function isMeaningfulOutcomeMarker(value: string) {
  const normalized = value.trim()
  if (normalized === "" || isDash(normalized)) return false
  const numeric = numberValue(normalized)
  return numeric === null ? true : numeric > 0
}

function matchesAt(values: string[], start: number, expected: string[]) {
  return expected.every((value, offset) => values[start + offset] === value)
}

function findSideLayout(
  matrix: string[][],
  markerRow: number,
  markerColumn: number,
  blockEnd: number
): SideLayout | null {
  for (let row = markerRow; row < Math.min(blockEnd, markerRow + 12); row += 1) {
    const values = (matrix[row] ?? []).map(upper)
    for (let start = markerColumn; start < values.length - 5; start += 1) {
      if (!matchesAt(values, start, TOTAL_HEADERS)) continue

      const courseGroups: Array<[number, number, number, number]> = []
      let cursor = start + TOTAL_HEADERS.length
      while (matchesAt(values, cursor, OUTCOME_HEADERS)) {
        courseGroups.push([cursor, cursor + 1, cursor + 2, cursor + 3])
        cursor += OUTCOME_HEADERS.length
      }

      if (courseGroups.length >= 3 && start > 0) {
        const courseNames = courseGroups.slice(0, 3).map((group, index) => {
          for (let titleRow = row - 1; titleRow >= Math.max(0, markerRow - 3); titleRow -= 1) {
            const title = cell(matrix, titleRow, group[0])
            if (/[A-Za-z]/.test(title)) return title
          }
          return HISTORICAL_MATCH_COURSES[index] ?? `Course ${index + 1}`
        })
        return {
          markerColumn,
          headerRow: row,
          nameColumn: start - 1,
          totals: [start, start + 1, start + 2, start + 3, start + 4, start + 5],
          courseGroups: courseGroups.slice(0, 3),
          courseNames,
        }
      }
    }
  }
  return null
}

function findDivisionMarkers(matrix: string[][]) {
  const markers: Array<{ row: number; column: number; divisionNumber: number }> = []
  matrix.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const match = upper(value).match(/^DIVISION\s*(\d+)$/)
      if (match) {
        markers.push({ row: rowIndex, column: columnIndex, divisionNumber: Number(match[1]) })
      }
    })
  })
  return markers
}

function nextDivisionRow(
  markers: ReturnType<typeof findDivisionMarkers>,
  markerRow: number,
  matrixLength: number
) {
  return markers.find((marker) => marker.row > markerRow)?.row ?? matrixLength
}

function isTemplateName(name: string) {
  return name === "" || /^\d+$/.test(name.trim()) || isByeName(name)
}

function isByeName(name: string) {
  return upper(name) === "BYE"
}

function isStructuralHeaderName(name: string) {
  return upper(name) === "KRYS' MATCH"
}

function isStructuralSeparatorRow(row: string[]) {
  return row.some((value) => {
    const normalized = upper(value)
    return normalized.includes("KRYS' MATCH PLAY") || /^SEASON\s+\d+\b/.test(normalized)
  })
}

function parseOutcome(
  matrix: string[][],
  row: number,
  columns: [number, number, number, number],
  warnings: string[]
): HistoricalMatchCourse {
  const markers = columns.slice(0, 3).map((column) =>
    isMeaningfulOutcomeMarker(cell(matrix, row, column))
  )
  const present = markers
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value)
  const sourceHolesWon = numberValue(cell(matrix, row, columns[3]))

  if (present.length !== 1) {
    if (present.length > 1) warnings.push("Contradictory course outcome markers.")
    return {
      courseName: "",
      played: false,
      outcome: null,
      holesWon: null,
      sourceHolesWon,
    }
  }

  return {
    courseName: "",
    played: true,
    outcome: (["W", "L", "D"] as const)[present[0].index],
    holesWon: sourceHolesWon,
    sourceHolesWon,
  }
}

function parseStanding(
  matrix: string[][],
  row: number,
  layout: SideLayout,
  divisionNumber: number,
  rank: number,
  courses: string[]
) {
  const name = cell(matrix, row, layout.nameColumn)
  const totals = layout.totals.map((column) => totalNumberValue(cell(matrix, row, column)))
  if (isTemplateName(name) || totals.some((value) => value === null)) return null

  const warnings: string[] = []
  const [played, wins, losses, draws, points, holesWon] = totals as number[]
  if (played !== wins + losses + draws) warnings.push("P does not equal W + L + D.")
  if (points !== wins * 3 + draws) warnings.push("PTS does not equal (W * 3) + D.")

  const courseRows = layout.courseGroups.map((columns, index) => ({
    ...parseOutcome(matrix, row, columns, warnings),
    courseName: courses[index] ?? `Course ${index + 1}`,
  }))

  return {
    divisionNumber,
    finalRank: rank,
    historicalDisplayName: name,
    played,
    wins,
    losses,
    draws,
    points,
    holesWon,
    courses: courseRows,
    canonicalPlayerId: null,
    warnings,
  } satisfies HistoricalMatchStanding
}

function standingSignature(standing: HistoricalMatchStanding) {
  return JSON.stringify({
    name: standing.historicalDisplayName,
    totals: [standing.played, standing.wins, standing.losses, standing.draws, standing.points, standing.holesWon],
    courses: standing.courses.map((course) => [course.outcome, course.sourceHolesWon]),
  })
}

export function previewHistoricalMatchCsv(matrix: string[][]): HistoricalMatchPreview {
  const labelCell = matrix.flat().map((value) => value.trim()).find((value) => /^SEASON\s+\d+\b/i.test(value)) ?? ""
  const seasonMatch = labelCell.match(/^SEASON\s+(\d+)\b/i)
  const markers = findDivisionMarkers(matrix)
  const warnings: string[] = []
  const ignoredRows: HistoricalMatchIgnoredRow[] = []
  const divisions: HistoricalMatchPreview["divisions"] = []
  let detectedCourses: string[] = [...HISTORICAL_MATCH_COURSES]
  let collapsed = 0
  let conflicts = 0
  let malformedRows = 0
  let structuralHeadersIgnored = 0
  const detectedLayouts = new Set<"duplicated_final_side" | "single_side">()
  let ambiguousStructure = false

  const markerGroups = Array.from(new Set(markers.map((marker) => marker.row)))
  for (const markerRow of markerGroups) {
    const rowMarkers = markers.filter((marker) => marker.row === markerRow)
    const divisionNumber = rowMarkers[0].divisionNumber
    const blockEnd = nextDivisionRow(markers, markerRow, matrix.length)
    const layouts = rowMarkers
      .map((marker) => findSideLayout(matrix, markerRow, marker.column, blockEnd))
      .filter((layout): layout is SideLayout => layout !== null)
      .sort((left, right) => left.nameColumn - right.nameColumn)

    const expectsDuplicatedLayout = rowMarkers.length > 1
    if (layouts.length === 0 || (expectsDuplicatedLayout && layouts.length < 2)) {
      warnings.push(expectsDuplicatedLayout
        ? `Division ${divisionNumber}: duplicated left/right structure is incomplete or ambiguous.`
        : `Division ${divisionNumber}: single-side structure was not recognized.`)
      malformedRows += 1
      conflicts += 1
      ambiguousStructure = true
      continue
    }

    const duplicated = expectsDuplicatedLayout
    detectedLayouts.add(duplicated ? "duplicated_final_side" : "single_side")
    const left = layouts[0]
    const source = duplicated ? layouts.at(-1)! : left
    detectedCourses = source.courseNames
    const dataStart = duplicated ? Math.max(left.headerRow, source.headerRow) + 1 : source.headerRow + 1
    const sourceStandings: HistoricalMatchStanding[] = []

    for (let row = dataStart; row < blockEnd; row += 1) {
      const sourceName = cell(matrix, row, source.nameColumn)
      const leftName = cell(matrix, row, left.nameColumn)

      if (isStructuralSeparatorRow(matrix[row] ?? [])) continue
      if ((matrix[row] ?? []).every((value) => String(value).trim() === "")) continue

      if (isStructuralHeaderName(leftName) || isStructuralHeaderName(sourceName)) {
        if (divisionNumber <= 5) {
          ignoredRows.push({
            divisionNumber,
            sourceRow: row + 1,
            sourceName: "KRYS' MATCH",
            classification: "structural_header",
            reason: "Structural section header",
          })
          structuralHeadersIgnored += 1
        }
        continue
      }

      if (isByeName(sourceName)) {
        ignoredRows.push({
          divisionNumber,
          sourceRow: row + 1,
          sourceName,
          classification: "template_placeholder",
          reason: "BYE / non-player slot",
        })
        continue
      }

      if (isTemplateName(sourceName) || divisionNumber > 5) {
        const ignoredName = sourceName || leftName
        ignoredRows.push({
          divisionNumber,
          sourceRow: row + 1,
          sourceName: ignoredName,
          classification: ignoredName === "" ? "blank_template_slot" : "template_placeholder",
          reason: ignoredName === "" ? "Blank template/player slot" : /^\d+$/.test(ignoredName) ? "Numeric template placeholder" : "Unsupported/template division row",
        })
        continue
      }

      const standing = parseStanding(matrix, row, source, divisionNumber, sourceStandings.length + 1, source.courseNames)
      if (standing) sourceStandings.push(standing)
      else if (sourceName !== "") {
        ignoredRows.push({ divisionNumber, sourceRow: row + 1, sourceName, classification: "malformed", reason: "Malformed player row" })
        malformedRows += 1
      }
    }

    if (duplicated) {
      const leftByName = new Map<string, HistoricalMatchStanding>()
      for (let row = dataStart; row < blockEnd; row += 1) {
        const candidate = parseStanding(matrix, row, left, divisionNumber, 0, left.courseNames)
        if (candidate) leftByName.set(upper(candidate.historicalDisplayName), candidate)
      }

      for (const standing of sourceStandings) {
        const duplicate = leftByName.get(upper(standing.historicalDisplayName))
        if (!duplicate) {
          standing.warnings.push("Matching left-side duplicate was not found.")
          conflicts += 1
        } else {
          collapsed += 1
          if (standingSignature(duplicate) !== standingSignature(standing)) {
            standing.warnings.push("Left and right source statistics disagree.")
            conflicts += 1
          }
        }
        conflicts += standing.warnings.length
      }
    } else {
      conflicts += sourceStandings.reduce((total, standing) => total + standing.warnings.length, 0)
    }

    if (sourceStandings.length > 0) divisions.push({ divisionNumber, standings: sourceStandings })
  }

  const layout = !ambiguousStructure && detectedLayouts.size === 1 ? Array.from(detectedLayouts)[0] : "ambiguous"
  if (detectedLayouts.size > 1) {
    warnings.push("Historical Match layout is ambiguous: single-side and duplicated division structures were both detected.")
    conflicts += 1
  }
  const allStandings = divisions.flatMap((division) => division.standings)
  const allCourses = allStandings.flatMap((standing) => standing.courses)
  return {
    evidenceLevel: "aggregate_course",
    layout,
    seasonNumber: seasonMatch ? Number(seasonMatch[1]) : null,
    historicalLabel: labelCell,
    year: null,
    courses: detectedCourses,
    divisions,
    fixtures: [],
    ignoredRows,
    warnings,
    audit: {
      seasonsFound: seasonMatch ? 1 : 0,
      populatedDivisions: divisions.length,
      realPlayerRows: allStandings.length,
      duplicateHorizontalCopiesCollapsed: collapsed,
      templateRowsIgnored: ignoredRows.filter((row) => row.classification === "template_placeholder" || row.classification === "blank_template_slot").length,
      structuralHeadersIgnored,
      malformedRows,
      conflicts,
      courseAppearancesPlayed: allCourses.filter((course) => course.played).length,
      courseAppearancesUnplayed: allCourses.filter((course) => !course.played).length,
      authoritativeFixtures: 0,
    },
  }
}
