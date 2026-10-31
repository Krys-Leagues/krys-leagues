import { createHash } from "node:crypto"

import Papa from "papaparse"
import { ARIZONA_COURSES, ARIZONA_SOURCE_COURSE } from "./catalog.ts"

import type {
  AllTimeCourseTarget,
  ArizonaCourseCode,
  ArizonaCsvIssue,
  ArizonaCsvParseResult,
  ArizonaSourceRecord,
} from "./types.ts"

type CsvRow = Record<string, string | undefined>

const FORBIDDEN_COMBINED_COLUMNS = new Set([
  "easy_score",
  "hard_score",
  "combined_score",
  "source_authority",
])

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_|_$/g, "")
}

function field(row: CsvRow, ...names: string[]) {
  for (const name of names) {
    const value = row[name]
    if (value !== undefined) return value
  }
  return ""
}

function optionalPositiveInteger(value: string) {
  if (!value.trim()) return null
  if (!/^[1-9]\d*$/.test(value.trim())) return undefined
  return Number(value)
}

export function parseArizonaCourseCsv(
  csvText: string,
  target: AllTimeCourseTarget | ArizonaCourseCode,
  csvFilename: string,
  csvFileHash = sha256(csvText)
): ArizonaCsvParseResult {
  const course = typeof target === "string"
    ? { ...(target === "AME" ? ARIZONA_COURSES.Easy : ARIZONA_COURSES.Hard), sourceCourseName: ARIZONA_SOURCE_COURSE }
    : target
  const courseCode = course.code
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizedHeader,
  })
  const issues: ArizonaCsvIssue[] = []
  const records: ArizonaSourceRecord[] = []
  const headers = new Set((parsed.meta.fields ?? []).map(normalizedHeader))

  if ([...FORBIDDEN_COMBINED_COLUMNS].some((header) => headers.has(header))) {
    issues.push({
      category: "course_mapping_issue",
      csvRow: 1,
      historicalPlayerName: null,
      rawScore: null,
      message: "Combined/Easy+Hard score columns are not accepted by this one-course importer.",
    })
    return { courseCode, csvFilename, csvFileHash, records, issues }
  }
  if (!headers.has("historical_player_name") && !headers.has("player_name") && !headers.has("name")) {
    issues.push({ category: "invalid_row", csvRow: 1, historicalPlayerName: null, rawScore: null, message: "Missing historical_player_name column." })
  }
  if (!headers.has("score")) {
    issues.push({ category: "invalid_row", csvRow: 1, historicalPlayerName: null, rawScore: null, message: "Missing score column." })
  }
  if (issues.length) return { courseCode, csvFilename, csvFileHash, records, issues }

  const seen = new Set<string>()
  parsed.data.forEach((row, index) => {
    const csvRow = index + 2
    const historicalPlayerName = field(row, "historical_player_name", "player_name", "name")
    const rawScore = field(row, "score")
    const declaredCourse = field(row, "course_code").trim().toUpperCase()
    const sourceRow = optionalPositiveInteger(field(row, "source_row"))
    const rank = optionalPositiveInteger(field(row, "rank", "source_rank"))

    if (declaredCourse && declaredCourse !== courseCode) {
      issues.push({ category: "course_mapping_issue", csvRow, historicalPlayerName: historicalPlayerName || null, rawScore: rawScore || null, message: `CSV row declares ${declaredCourse}; selected target is ${courseCode}.` })
      return
    }
    if (!historicalPlayerName || !/^-?\d+$/.test(rawScore.trim()) || sourceRow === undefined || rank === undefined) {
      issues.push({ category: "invalid_row", csvRow, historicalPlayerName: historicalPlayerName || null, rawScore: rawScore || null, message: !historicalPlayerName ? "Historical player name is required." : !/^-?\d+$/.test(rawScore.trim()) ? "Score must be an integer; negative, zero, and positive values are allowed." : "Source row and rank must be positive integers when supplied." })
      return
    }

    const score = Number(rawScore)
    const logicalKey = `${courseCode}\u001f${historicalPlayerName}\u001f${score}`
    if (seen.has(logicalKey)) {
      issues.push({ category: "duplicate_source_row", csvRow, historicalPlayerName, rawScore, message: "Duplicate player/score row skipped within this CSV." })
      return
    }
    seen.add(logicalKey)
    const sourceWorkbook = field(row, "source_workbook").trim() || csvFilename
    records.push({
      courseCode,
      difficulty: course.difficulty,
      canonicalBaseMap: course.baseMap,
      canonicalDisplayName: course.displayName,
      sourceCourseName: course.sourceCourseName,
      sourceWorksheet: "All Time",
      sourceFilename: sourceWorkbook,
      sourceFileHash: csvFileHash,
      sourceRow: sourceRow ?? csvRow,
      sourceRank: rank,
      sourceNameCell: `CSV row ${csvRow}:historical_player_name`,
      sourceScoreCell: `CSV row ${csvRow}:score`,
      historicalPlayerName,
      score,
      fingerprint: sha256([csvFileHash, courseCode, String(csvRow), historicalPlayerName, String(score)].join("\u001f")),
      csvFilename,
      csvRow,
      sourceDate: field(row, "source_date").trim() || null,
      notes: field(row, "notes").trim() || null,
    })
  })

  for (const error of parsed.errors) {
    issues.push({ category: "invalid_row", csvRow: (error.row ?? 0) + 2, historicalPlayerName: null, rawScore: null, message: error.message })
  }
  return { courseCode, csvFilename, csvFileHash, records, issues }
}
