import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import Papa from "papaparse"

import { previewMonthlyWebsiteCsvRows, type MonthlyWebsiteObservation } from "@/lib/importer/adapters/monthlyWebsiteAdapter"
import { validateMonthlyWebsiteIdentities, type MonthlyIdentityDirectory } from "@/lib/importer/monthlyWebsiteIdentityValidation"

type Manifest = {
  normalizedCsvSha256: string
  rawRenderedRows: number
  scoreObservations: number
  missingScoreObservations: number
  finalization: { finalizedThrough: string }
}

export type MonthlyCommitRow = Record<string, unknown>

export type MonthlyCommitRequest = {
  p_source_filename: string
  p_source_sha256: string
  p_parser_version: string
  p_source_row_count: number
  p_rows: MonthlyCommitRow[]
}

export class MonthlyCommitValidationError extends Error {
  constructor(message: string, readonly status: 400 | 409) {
    super(message)
    this.name = "MonthlyCommitValidationError"
  }
}

function isRecord(value: unknown): value is MonthlyCommitRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function expectedPayload(row: MonthlyWebsiteObservation, canonicalPlayerId: string) {
  return {
    rowKey: row.sourceFingerprint,
    sourceRow: row.sourceRow,
    year: row.year,
    month: row.month,
    periodId: row.periodId,
    division: row.division,
    historicalName: row.historicalPlayerName,
    canonicalPlayerId,
    sourcePlayerId: row.sourcePlayerId,
    courseName: row.courseName,
    difficulty: row.difficulty,
    score: row.score,
    holeInOnes: row.holeInOnes,
    coursePlacement: row.coursePlacement,
    coursePoints: row.coursePoints,
    overallPlacement: row.overallPlacement,
    coursesPlayed: row.coursesPlayed,
    totalStrokes: row.totalStrokes,
    overallHn1: row.overallHn1,
    overallPoints: row.overallPoints,
    sourceUrl: row.sourceUrl,
  }
}

function samePayload(left: MonthlyCommitRow, right: MonthlyCommitRow) {
  return Object.keys(right).every((key) => left[key] === right[key])
}

function parseRequest(body: unknown): MonthlyCommitRequest {
  if (!isRecord(body)) throw new MonthlyCommitValidationError("The reviewed Monthly payload is incomplete.", 400)
  const rows = body.p_rows
  if (typeof body.p_source_filename !== "string"
    || !/^[0-9a-f]{64}$/.test(typeof body.p_source_sha256 === "string" ? body.p_source_sha256 : "")
    || typeof body.p_parser_version !== "string"
    || !Number.isInteger(body.p_source_row_count)
    || !Array.isArray(rows)
    || rows.length === 0) {
    throw new MonthlyCommitValidationError("The reviewed Monthly payload is incomplete.", 400)
  }
  return {
    p_source_filename: body.p_source_filename,
    p_source_sha256: body.p_source_sha256 as string,
    p_parser_version: body.p_parser_version,
    p_source_row_count: body.p_source_row_count as number,
    p_rows: rows.filter(isRecord),
  }
}

export async function validateMonthlyWebsiteCommitRequest(
  body: unknown,
  directory: MonthlyIdentityDirectory,
) {
  const request = parseRequest(body)
  if (request.p_source_filename !== "monthly-website-score-observations.csv") {
    throw new MonthlyCommitValidationError("The reviewed Monthly payload is incomplete.", 400)
  }
  if (request.p_rows.length !== (body as { p_rows: unknown[] }).p_rows.length) {
    throw new MonthlyCommitValidationError("Every reviewed Monthly row must be an object.", 400)
  }

  const root = join(process.cwd(), "docs", "historical-sources", "monthly", "website-recovery")
  const [manifestText, csvText] = await Promise.all([
    readFile(join(root, "monthly-website-source-manifest.json"), "utf8"),
    readFile(join(root, "monthly-website-score-observations.csv"), "utf8"),
  ])
  const manifest = JSON.parse(manifestText) as Manifest
  const actualSourceSha256 = createHash("sha256").update(csvText, "utf8").digest("hex")
  if (request.p_source_sha256 !== actualSourceSha256 || request.p_source_sha256 !== manifest.normalizedCsvSha256 || request.p_source_row_count !== manifest.rawRenderedRows) {
    throw new MonthlyCommitValidationError("The reviewed Monthly payload does not match the preserved source manifest.", 409)
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new MonthlyCommitValidationError("The preserved Monthly CSV could not be parsed.", 409)
  const preview = previewMonthlyWebsiteCsvRows(parsed.data, { finalizedThrough: manifest.finalization.finalizedThrough })
  if (preview.summary.totalRows !== manifest.rawRenderedRows
    || preview.summary.scoreRows !== manifest.scoreObservations
    || preview.summary.missingScoreRows !== manifest.missingScoreObservations
    || preview.summary.duplicateRows
    || preview.summary.conflictingRows
    || preview.summary.totalMismatches) {
    throw new MonthlyCommitValidationError("The preserved Monthly source failed validation. Refresh the preview before applying it.", 409)
  }

  const validSourceRows = preview.rows.filter((row) => row.importable && row.score !== null && row.issues.length === 0)
  const names = [...new Set(validSourceRows.map((row) => row.historicalPlayerName))]
  const identityValidation = validateMonthlyWebsiteIdentities(names, directory)
  const firstIdentityFailure = identityValidation.failures[0]
  if (firstIdentityFailure) {
    throw new MonthlyCommitValidationError(
      firstIdentityFailure.reason === "non_canonical"
        ? `Monthly identity review selected a non-canonical player for ${firstIdentityFailure.historicalName}.`
        : `Monthly identity review is incomplete for ${firstIdentityFailure.historicalName}.`,
      409,
    )
  }

  const incomingKeys = request.p_rows.map((row) => typeof row.rowKey === "string" ? row.rowKey : "")
  if (new Set(incomingKeys).size !== incomingKeys.length || incomingKeys.some((key) => !key)) {
    throw new MonthlyCommitValidationError("Reviewed Monthly rows must have unique source fingerprints.", 400)
  }
  const expectedRows = validSourceRows.map((row) => expectedPayload(row, identityValidation.canonicalByName.get(row.historicalPlayerName)!))
  if (expectedRows.length !== request.p_rows.length
    || new Set(expectedRows.map((row) => row.rowKey)).size !== new Set(incomingKeys).size
    || expectedRows.some((row) => !incomingKeys.includes(row.rowKey))) {
    throw new MonthlyCommitValidationError("The reviewed Monthly payload is missing an eligible source observation or includes an unknown row.", 409)
  }
  const expectedByKey = new Map(expectedRows.map((row) => [row.rowKey, row]))
  for (const incoming of request.p_rows) {
    const expected = expectedByKey.get(incoming.rowKey as string)
    if (!expected || !samePayload(incoming, expected)) {
      throw new MonthlyCommitValidationError("A reviewed Monthly row no longer matches the preserved source or canonical identity directory.", 409)
    }
  }

  return {
    request,
    expectedRows,
    source: {
      sourceSha256: actualSourceSha256,
      totalRows: preview.summary.totalRows,
      scoreRows: preview.summary.scoreRows,
      noSubmissionRows: preview.summary.noSubmissionRows,
      malformedRows: preview.summary.malformedRows,
      eligibleRows: validSourceRows.length,
      currentIncompleteRows: preview.summary.currentIncompleteRows,
    },
    requestBytes: Buffer.byteLength(JSON.stringify(body), "utf8"),
  }
}
