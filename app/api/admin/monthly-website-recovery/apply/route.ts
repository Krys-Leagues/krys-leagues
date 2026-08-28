import { createHash, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import Papa from "papaparse"

import { authorizedAdminClient, loadIdentityDirectory } from "@/app/api/admin/records/arizona-modern/_shared"
import { previewMonthlyWebsiteCsvRows, type MonthlyWebsiteObservation } from "@/lib/importer/adapters/monthlyWebsiteAdapter"

function jsonError(message: string, status: number, correlationId?: string) {
  return Response.json({ error: message, correlationId }, { status, headers: { "Cache-Control": "no-store" } })
}

export const dynamic = "force-dynamic"

type Manifest = {
  normalizedCsvSha256: string
  rawRenderedRows: number
  scoreObservations: number
  missingScoreObservations: number
  finalization: { finalizedThrough: string }
}

type ReviewedRow = Record<string, unknown>

function isRecord(value: unknown): value is ReviewedRow {
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

function samePayload(left: ReviewedRow, right: ReviewedRow) {
  return Object.keys(right).every((key) => left[key] === right[key])
}

export async function POST(request: Request) {
  const correlationId = randomUUID()
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error

  try {
    const body = await request.json() as {
      p_source_filename?: unknown
      p_source_sha256?: unknown
      p_parser_version?: unknown
      p_source_row_count?: unknown
      p_rows?: unknown
    }
    const sourceFilename = typeof body.p_source_filename === "string" ? body.p_source_filename : ""
    const sourceSha256 = typeof body.p_source_sha256 === "string" ? body.p_source_sha256 : ""
    const parserVersion = typeof body.p_parser_version === "string" ? body.p_parser_version : ""
    const sourceRowCount = typeof body.p_source_row_count === "number" ? body.p_source_row_count : 0
    if (sourceFilename !== "monthly-website-score-observations.csv"
      || !/^[0-9a-f]{64}$/.test(sourceSha256)
      || !parserVersion
      || !Number.isInteger(sourceRowCount)
      || !Array.isArray(body.p_rows)
      || body.p_rows.length === 0) {
      return jsonError("The reviewed Monthly payload is incomplete.", 400, correlationId)
    }

    const root = join(process.cwd(), "docs", "historical-sources", "monthly", "website-recovery")
    const [manifestText, csvText] = await Promise.all([
      readFile(join(root, "monthly-website-source-manifest.json"), "utf8"),
      readFile(join(root, "monthly-website-score-observations.csv"), "utf8"),
    ])
    const manifest = JSON.parse(manifestText) as Manifest
    const actualSourceSha256 = createHash("sha256").update(csvText, "utf8").digest("hex")
    if (sourceSha256 !== actualSourceSha256 || sourceSha256 !== manifest.normalizedCsvSha256 || sourceRowCount !== manifest.rawRenderedRows) {
      return jsonError("The reviewed Monthly payload does not match the preserved source manifest.", 409, correlationId)
    }

    const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
    if (parsed.errors.length) return jsonError("The preserved Monthly CSV could not be parsed.", 409, correlationId)
    const preview = previewMonthlyWebsiteCsvRows(parsed.data, { finalizedThrough: manifest.finalization.finalizedThrough })
    if (preview.summary.totalRows !== manifest.rawRenderedRows
      || preview.summary.scoreRows !== manifest.scoreObservations
      || preview.summary.missingScoreRows !== manifest.missingScoreObservations
      || preview.summary.duplicateRows
      || preview.summary.conflictingRows
      || preview.summary.totalMismatches) {
      return jsonError("The preserved Monthly source failed validation. Refresh the preview before applying it.", 409, correlationId)
    }

    const validSourceRows = preview.rows.filter((row) => row.importable && row.score !== null && row.issues.length === 0)
    const directory = await loadIdentityDirectory(authorization.supabase!)
    const names = [...new Set(validSourceRows.map((row) => row.historicalPlayerName))]
    const identityByName = new Map(directory.matchNames(names).map((match) => [match.importedName, match]))
    const canonicalByName = new Map<string, string>()
    for (const name of names) {
      const match = identityByName.get(name)
      if (!match?.autoLinkEligible || !match.playerId) return jsonError(`Monthly identity review is incomplete for ${name}.`, 409, correlationId)
      const canonicalId = directory.canonicalId(match.playerId)
      const canonicalPlayer = directory.rawPlayers.find((player) => player.id === canonicalId && directory.canonicalId(player.id) === canonicalId)
      if (!canonicalPlayer) return jsonError(`Monthly identity review selected a non-canonical player for ${name}.`, 409, correlationId)
      canonicalByName.set(name, canonicalId)
    }

    const incomingRows = body.p_rows.filter(isRecord)
    if (incomingRows.length !== body.p_rows.length) return jsonError("Every reviewed Monthly row must be an object.", 400, correlationId)
    const incomingKeys = incomingRows.map((row) => typeof row.rowKey === "string" ? row.rowKey : "")
    if (new Set(incomingKeys).size !== incomingKeys.length || incomingKeys.some((key) => !key)) return jsonError("Reviewed Monthly rows must have unique source fingerprints.", 400, correlationId)
    const expectedRows = validSourceRows.map((row) => expectedPayload(row, canonicalByName.get(row.historicalPlayerName)!))
    if (expectedRows.length !== incomingRows.length || new Set(expectedRows.map((row) => row.rowKey)).size !== new Set(incomingKeys).size || expectedRows.some((row) => !incomingKeys.includes(row.rowKey))) {
      return jsonError("The reviewed Monthly payload is missing an eligible source observation or includes an unknown row.", 409, correlationId)
    }
    const expectedByKey = new Map(expectedRows.map((row) => [row.rowKey, row]))
    for (const incoming of incomingRows) {
      const expected = expectedByKey.get(incoming.rowKey as string)
      if (!expected || !samePayload(incoming, expected)) return jsonError("A reviewed Monthly row no longer matches the preserved source or canonical identity directory.", 409, correlationId)
    }

    const { data, error } = await authorization.supabase!.rpc("commit_historical_monthly_preview", {
      p_source_filename: sourceFilename,
      p_source_sha256: sourceSha256,
      p_parser_version: parserVersion,
      p_source_row_count: sourceRowCount,
      p_rows: expectedRows,
    })
    if (error) return jsonError("The Monthly database transaction rejected this source.", 422, correlationId)
    return Response.json({ data, correlationId }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return jsonError("The Monthly Apply request could not be completed.", 400, correlationId)
  }
}
