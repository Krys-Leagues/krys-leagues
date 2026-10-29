import { createHash } from "node:crypto"
import { inflateRawSync } from "node:zlib"

import {
  ALL_TIME_WORKSHEET,
  ARIZONA_COURSES,
  ARIZONA_SOURCE_COURSE,
} from "./catalog.ts"
import type {
  ArizonaDifficulty,
  ArizonaParseIssue,
  ArizonaSourceRecord,
  ArizonaWorkbookParseResult,
} from "./types.ts"

type ZipEntry = {
  compression: number
  compressedSize: number
  localHeaderOffset: number
}

type CellValue = string | number | null

const textDecoder = new TextDecoder("utf-8")

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex")
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const minimum = Math.max(0, bytes.length - 65_557)
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset
    }
  }
  throw new Error("The workbook is not a supported ZIP-based Excel file.")
}

function readZipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEndOfCentralDirectory(bytes)
  const entryCount = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const entries = new Map<string, ZipEntry>()

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("The Excel archive central directory is invalid.")
    }
    const compression = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    entries.set(name, { compression, compressedSize, localHeaderOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function readZipText(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string) {
  const entry = entries.get(name)
  if (!entry) throw new Error(`Required workbook part ${name} is missing.`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const offset = entry.localHeaderOffset
  if (view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error(`Workbook part ${name} has an invalid local header.`)
  }
  const nameLength = view.getUint16(offset + 26, true)
  const extraLength = view.getUint16(offset + 28, true)
  const start = offset + 30 + nameLength + extraLength
  const compressed = bytes.subarray(start, start + entry.compressedSize)
  if (entry.compression === 0) return textDecoder.decode(compressed)
  if (entry.compression === 8) return inflateRawSync(compressed).toString("utf8")
  throw new Error(`Workbook part ${name} uses unsupported ZIP compression ${entry.compression}.`)
}

function getAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return match ? decodeXml(match[1]) : null
}

function normalizeRelationshipTarget(target: string) {
  const withoutLeadingSlash = target.replace(/^\//, "")
  return withoutLeadingSlash.startsWith("xl/")
    ? withoutLeadingSlash
    : `xl/${withoutLeadingSlash.replace(/^\.\//, "")}`
}

function findAllTimeWorksheetPath(bytes: Uint8Array, entries: Map<string, ZipEntry>) {
  const workbookXml = readZipText(bytes, entries, "xl/workbook.xml")
  const sheetTag = [...workbookXml.matchAll(/<sheet\b[^>]*\/>/g)].find(
    (match) => getAttribute(match[0], "name") === ALL_TIME_WORKSHEET
  )?.[0]
  if (!sheetTag) throw new Error('Worksheet "All Time" was not found.')
  const relationshipId = getAttribute(sheetTag, "r:id")
  if (!relationshipId) throw new Error('Worksheet "All Time" has no relationship ID.')

  const relationshipsXml = readZipText(
    bytes,
    entries,
    "xl/_rels/workbook.xml.rels"
  )
  const relationshipTag = [...relationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g)].find(
    (match) => getAttribute(match[0], "Id") === relationshipId
  )?.[0]
  const target = relationshipTag ? getAttribute(relationshipTag, "Target") : null
  if (!target) throw new Error('Worksheet "All Time" target was not found.')
  return normalizeRelationshipTarget(target)
}

function readSharedStrings(bytes: Uint8Array, entries: Map<string, ZipEntry>) {
  if (!entries.has("xl/sharedStrings.xml")) return []
  const xml = readZipText(bytes, entries, "xl/sharedStrings.xml")
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1]))
      .join("")
  )
}

function columnNumber(reference: string) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? ""
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0)
}

function columnLetters(column: number) {
  let value = column
  let result = ""
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

function parseCell(tag: string, body: string, sharedStrings: string[]): CellValue {
  const type = getAttribute(tag, "t")
  if (type === "inlineStr") {
    return [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((match) => decodeXml(match[1]))
      .join("")
  }
  const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]
  if (raw === undefined) return null
  const decoded = decodeXml(raw)
  if (type === "s") return sharedStrings[Number(decoded)] ?? null
  if (type === "str") return decoded
  const numeric = Number(decoded)
  return Number.isFinite(numeric) ? numeric : decoded
}

function parseRelevantCells(xml: string, sharedStrings: string[], sourceCourseName: string) {
  const rowOne = new Map<number, CellValue>()
  const rawCells: Array<{ reference: string; row: number; column: number; value: CellValue }> = []

  for (const match of xml.matchAll(/(<c\b[^>]*\br="([A-Z]+(\d+))"[^>]*>)([\s\S]*?)<\/c>/g)) {
    const reference = match[2]
    const row = Number(match[3])
    const column = columnNumber(reference)
    const value = parseCell(match[1], match[4], sharedStrings)
    if (row === 1) rowOne.set(column, value)
    rawCells.push({ reference, row, column, value })
  }

  const headerCourseColumn = [...rowOne.entries()].find(
    ([column, value]) =>
      value === sourceCourseName &&
      rowOne.get(column - 1) === "Easy" &&
      rowOne.get(column + 1) === "Hard"
  )?.[0]
  if (!headerCourseColumn) {
    const matches = [...rowOne.entries()]
      .filter(([, value]) => value === sourceCourseName)
      .map(([column]) => [column, rowOne.get(column - 1), rowOne.get(column + 1)])
    throw new Error(
      `The exact source heading "${sourceCourseName}" Easy block was not found on All Time row 1: ${JSON.stringify(matches)}`
    )
  }
  const sourceColumn = headerCourseColumn - 2

  const relevant = new Map<string, CellValue>()
  for (const cell of rawCells) {
    if (cell.row > 1 && cell.column >= sourceColumn - 1 && cell.column <= sourceColumn + 3) {
      relevant.set(cell.reference, cell.value)
    }
  }
  return { sourceColumn, relevant }
}

function integerScore(value: CellValue) {
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

export function parseIndividualCourseWorkbook(
  input: Uint8Array,
  sourceFilename: string,
  sourceCourseName: string,
  courses: Record<ArizonaDifficulty, { code: string; difficulty: ArizonaDifficulty; baseMap: string; displayName: string }>
): ArizonaWorkbookParseResult {
  const entries = readZipEntries(input)
  const worksheetPath = findAllTimeWorksheetPath(input, entries)
  const worksheetXml = readZipText(input, entries, worksheetPath)
  const sharedStrings = readSharedStrings(input, entries)
  const { sourceColumn, relevant } = parseRelevantCells(worksheetXml, sharedStrings, sourceCourseName)
  const sourceFileHash = sha256(input)
  const records: ArizonaSourceRecord[] = []
  const issues: ArizonaParseIssue[] = []
  const logicalFingerprints = new Set<string>()

  for (const difficulty of ["Easy", "Hard"] as const) {
    const course = courses[difficulty]
    if (!course) {
      issues.push({
        category: "course_mapping_issue",
        sourceFilename,
        sourceWorksheet: ALL_TIME_WORKSHEET,
        sourceRow: null,
        difficulty,
        historicalPlayerName: null,
        rawScore: null,
        message: `No explicit mapping exists for ${sourceCourseName} ${difficulty}.`,
      })
      continue
    }

    const nameColumn = sourceColumn + (difficulty === "Easy" ? 0 : 2)
    const scoreColumn = nameColumn + 1
    const rankColumn = sourceColumn - 1

    for (let row = 2; row <= 1_048_576; row += 1) {
      const nameCell = `${columnLetters(nameColumn)}${row}`
      const scoreCell = `${columnLetters(scoreColumn)}${row}`
      const rankCell = `${columnLetters(rankColumn)}${row}`
      const nameValue = relevant.get(nameCell) ?? null
      const scoreValue = relevant.get(scoreCell) ?? null
      const rankValue = relevant.get(rankCell) ?? null
      const rawName = nameValue === "" ? null : nameValue
      const rawScore = scoreValue === "" ? null : scoreValue
      const rawRank = rankValue === "" ? null : rankValue
      if (rawName === null && rawScore === null && rawRank === null) break
      if (rawName === null && rawScore === null) continue

      const historicalPlayerName = typeof rawName === "string" ? rawName : null
      const score = integerScore(rawScore)
      if (!historicalPlayerName || score === null) {
        issues.push({
          category: "invalid_score",
          sourceFilename,
          sourceWorksheet: ALL_TIME_WORKSHEET,
          sourceRow: row,
          difficulty,
          historicalPlayerName,
          rawScore,
          message: !historicalPlayerName
            ? "A score row has no historical player name."
            : "The historical player row has no valid integer score.",
        })
        continue
      }

      const logicalFingerprint = sha256(
        [sourceFileHash, course.code, historicalPlayerName, String(score)].join("\u001f")
      )
      if (logicalFingerprints.has(logicalFingerprint)) {
        issues.push({
          category: "duplicate_source_row",
          sourceFilename,
          sourceWorksheet: ALL_TIME_WORKSHEET,
          sourceRow: row,
          difficulty,
          historicalPlayerName,
          rawScore: score,
          message: "The same player and score occur more than once in this source course.",
        })
      }
      logicalFingerprints.add(logicalFingerprint)

      records.push({
        courseCode: course.code,
        difficulty,
        canonicalBaseMap: course.baseMap,
        canonicalDisplayName: course.displayName,
        sourceCourseName,
        sourceWorksheet: ALL_TIME_WORKSHEET,
        sourceFilename,
        sourceFileHash,
        sourceRow: row,
        sourceRank: typeof rawRank === "number" && Number.isInteger(rawRank) ? rawRank : null,
        sourceNameCell: nameCell,
        sourceScoreCell: scoreCell,
        historicalPlayerName,
        score,
        fingerprint: sha256(
          [
            sourceFileHash,
            ALL_TIME_WORKSHEET,
            course.code,
            String(row),
            nameCell,
            scoreCell,
            historicalPlayerName,
            String(score),
          ].join("\u001f")
        ),
      })
    }
  }

  return {
    sourceFilename,
    sourceFileHash,
    sourceWorksheet: ALL_TIME_WORKSHEET,
    sourceCourseName,
    records,
    issues,
  }
}

export function parseArizonaModernWorkbook(input: Uint8Array, sourceFilename: string) {
  return parseIndividualCourseWorkbook(input, sourceFilename, ARIZONA_SOURCE_COURSE, ARIZONA_COURSES)
}
