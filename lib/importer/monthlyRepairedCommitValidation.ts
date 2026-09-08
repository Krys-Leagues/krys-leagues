import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"
import Papa from "papaparse"

import { REVIEWED_MONTHLY_IDENTITY_OVERRIDES, validateMonthlyWebsiteIdentities, type MonthlyIdentityDirectory } from "@/lib/importer/monthlyWebsiteIdentityValidation"
import { classifyMonthlyProductionOverlap, type MonthlyProductionRow } from "@/lib/importer/monthlyRepairedHistory"
import { MonthlyCommitValidationError, type MonthlyCommitRequest } from "@/lib/importer/monthlyWebsiteCommitValidation"

const packageRoot = join(process.cwd(), "docs", "historical-sources", "monthly", "repaired-history", "amateur-extended")
export const FINAL_REPAIRED_MONTHLY_SOURCE = "amateur-extended/repaired-monthly-observations.tsv"
export const FINAL_REPAIRED_MONTHLY_PARSER = "historical-monthly-repaired-v3-amateur-extended"

type FinalPackageManifest = {
  counts: {
    import_ready_numeric_observations: number
    blank_unplayed_evidence: number
    zero_scores: number
    negative_scores: number
    positive_scores: number
    malformed: number
    duplicate_logical_keys: number
    duplicate_fingerprints: number
    quarantined_rows: number
  }
  file_sha256: Record<string, string>
  finalization: {
    finalizedThrough: string
    currentIncompletePeriod: string
    currentPeriodReason: string
  }
}

export type FinalPackageRow = {
  source_row: string
  logical_observation_key: string
  merge_status: string
  repaired_source_fingerprint: string
  period: string
  year: string
  month: string
  period_id: string
  division: string
  division_id: string
  historical_player_name: string
  source_player_id: string
  course_name: string
  difficulty: string
  score_text: string
  score_numeric: string
  played_state: string
  hole_in_ones: string
  course_placement: string
  course_points: string
  overall_placement: string
  courses_played: string
  total_strokes: string
  overall_hole_in_ones: string
  overall_points: string
  source_url: string
  old_source_row: string
  fresh_source_row: string
  fresh_raw_sha256: string
  fresh_raw_file: string
  provenance_sources: string
}

type ProductionRow = {
  period_id: number | null
  period_year: number
  period_month: number
  division: string
  canonical_player_id: string
  historical_player_name: string
  course_name: string
  difficulty: "easy" | "hard"
  score: number | null
}

const divisionIds: Record<string, string> = {
  Master: "21",
  Elite: "22",
  "Pro 1": "23",
  "Pro 2": "24",
  "Pro 3": "25",
  "Semi Pro 1": "113",
  "Semi Pro 2": "114",
  "Semi Pro 3": "115",
  "Amateur 1": "26",
  "Amateur 2": "27",
  "Amateur 3": "28",
  Beginner: "81",
  Welcome: "62",
}

function requiredText(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new MonthlyCommitValidationError(`Every final Monthly row requires ${label}.`, 409)
  return trimmed
}

function integerValue(value: string, label: string, required = false) {
  const trimmed = value.trim()
  if (!trimmed) {
    if (required) throw new MonthlyCommitValidationError(`Every final Monthly row requires ${label}.`, 409)
    return null
  }
  if (!/^-?\d+$/.test(trimmed)) throw new MonthlyCommitValidationError(`Final Monthly ${label} must be an integer.`, 409)
  return Number(trimmed)
}

function canonicalLogicalKey(row: Pick<FinalPackageRow, "period_id" | "division_id" | "course_name" | "difficulty">, canonicalPlayerId: string) {
  return [row.period_id, row.division_id, canonicalPlayerId, row.course_name, row.difficulty].join("|")
}

function parseRequest(body: unknown): MonthlyCommitRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new MonthlyCommitValidationError("The repaired Monthly request is incomplete.", 400)
  const value = body as Record<string, unknown>
  const sourceFilename = value.p_source_filename
  const sourceSha256 = value.p_source_sha256
  const parserVersion = value.p_parser_version
  const sourceRowCount = value.p_source_row_count
  if (typeof sourceFilename !== "string"
    || typeof sourceSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(sourceSha256)
    || sourceSha256 !== sourceSha256.toLowerCase()
    || typeof parserVersion !== "string"
    || typeof sourceRowCount !== "number"
    || !Number.isInteger(sourceRowCount)) {
    throw new MonthlyCommitValidationError("The repaired Monthly request is incomplete.", 400)
  }
  return {
    p_source_filename: sourceFilename,
    p_source_sha256: sourceSha256,
    p_parser_version: parserVersion,
    p_source_row_count: sourceRowCount,
    p_rows: [],
  }
}

export async function loadFinalRepairedPackage() {
  const [manifestText, observationsText] = await Promise.all([
    readFile(join(packageRoot, "repaired-monthly-manifest.json"), "utf8"),
    readFile(join(packageRoot, "repaired-monthly-observations.tsv"), "utf8"),
  ])
  const manifest = JSON.parse(manifestText) as FinalPackageManifest
  const actualSha256 = createHash("sha256").update(observationsText, "utf8").digest("hex")
  const expectedSha256 = manifest.file_sha256["repaired-monthly-observations.tsv"]?.toLowerCase()
  if (!expectedSha256 || actualSha256 !== expectedSha256) throw new MonthlyCommitValidationError("The final repaired Monthly package failed its SHA-256 check.", 409)
  const parsed = Papa.parse<FinalPackageRow>(observationsText, { header: true, delimiter: "\t", skipEmptyLines: true })
  if (parsed.errors.length) throw new MonthlyCommitValidationError("The final repaired Monthly package could not be parsed.", 409)
  if (parsed.data.length !== manifest.counts.import_ready_numeric_observations) throw new MonthlyCommitValidationError("The final repaired Monthly package count does not match its manifest.", 409)
  return { manifest, rows: parsed.data, sourceSha256: actualSha256 }
}

async function readProduction(supabase: SupabaseClient, periodIds: number[]) {
  const rows: ProductionRow[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase
      .from("historical_monthly_score_observations")
      .select("period_id, period_year, period_month, division, canonical_player_id, historical_player_name, course_name, difficulty, score")
      .in("period_id", periodIds)
      .range(offset, offset + pageSize - 1)
    if (result.error) throw new MonthlyCommitValidationError(`Production overlap could not be read: ${result.error.message}`, 409)
    rows.push(...((result.data ?? []) as ProductionRow[]))
    if ((result.data ?? []).length < pageSize) return rows
  }
}

function provenanceFor(row: FinalPackageRow) {
  const reviewedIdentity = REVIEWED_MONTHLY_IDENTITY_OVERRIDES[row.historical_player_name]
  return [{
    sourceKind: row.provenance_sources.trim() || "OTHER_AUTHORITATIVE",
    sourceFingerprint: row.repaired_source_fingerprint,
    originalSourceRow: integerValue(row.source_row, "source row"),
    sourceFile: row.fresh_raw_file.trim() || null,
    sourceUrl: row.source_url.trim() || null,
    sourceScoreText: row.score_text,
    playedState: "PLAYED",
    rawSha256: row.fresh_raw_sha256.trim() || null,
    reviewedIdentity: reviewedIdentity ? {
      historicalSourceName: reviewedIdentity.sourceName,
      historicalSourcePlayerId: reviewedIdentity.sourcePlayerId,
      mergeTargetSourceId: reviewedIdentity.mergeTargetSourceId,
      historicalTargetName: reviewedIdentity.historicalTargetName,
      canonicalPublicPlayerId: reviewedIdentity.canonicalPlayerId,
    } : null,
  }]
}

export async function validateMonthlyRepairedCommitRequest(
  body: unknown,
  supabase: SupabaseClient,
  directory: MonthlyIdentityDirectory,
) {
  const request = parseRequest(body)
  if (request.p_source_filename !== FINAL_REPAIRED_MONTHLY_SOURCE || request.p_parser_version !== FINAL_REPAIRED_MONTHLY_PARSER) {
    throw new MonthlyCommitValidationError("Only the final 19,015-row repaired Monthly package may be committed.", 409)
  }

  const packageData = await loadFinalRepairedPackage()
  if (request.p_source_sha256 !== packageData.sourceSha256 || request.p_source_row_count !== packageData.rows.length) {
    throw new MonthlyCommitValidationError("The request does not match the final repaired Monthly package.", 409)
  }

  const validRows = packageData.rows.filter(row => row.played_state === "PLAYED" && row.merge_status !== "QUARANTINED_REVIEW")
  for (const row of validRows) {
    requiredText(row.repaired_source_fingerprint, "a source fingerprint")
    requiredText(row.logical_observation_key, "a source logical key")
    requiredText(row.period_id, "a period ID")
    requiredText(row.division_id, "a division ID")
    requiredText(row.division, "a division")
    requiredText(row.historical_player_name, "an exact historical player name")
    requiredText(row.course_name, "a course name")
    requiredText(row.source_url, "a source URL")
    const reviewedIdentity = REVIEWED_MONTHLY_IDENTITY_OVERRIDES[row.historical_player_name]
    if (reviewedIdentity && row.source_player_id.trim() !== reviewedIdentity.sourcePlayerId) {
      throw new MonthlyCommitValidationError(`The reviewed Monthly identity source ID does not match ${row.historical_player_name}.`, 409)
    }
    if (!/^(easy|hard)$/.test(row.difficulty)) throw new MonthlyCommitValidationError("Every final Monthly row requires difficulty easy or hard.", 409)
    if (!/^-?\d+$/.test(row.score_numeric.trim())) throw new MonthlyCommitValidationError("Every final Monthly row requires a numeric score; blanks are evidence-only.", 409)
  }
  if (validRows.length !== packageData.manifest.counts.import_ready_numeric_observations) throw new MonthlyCommitValidationError("The final package contains an importable-row exclusion that is not represented in its manifest.", 409)

  const names = [...new Set(validRows.map(row => row.historical_player_name))]
  const identityValidation = validateMonthlyWebsiteIdentities(names, directory, { reviewedOverrides: REVIEWED_MONTHLY_IDENTITY_OVERRIDES })
  if (identityValidation.failures.length) throw new MonthlyCommitValidationError(`Required Monthly identities are unresolved: ${identityValidation.failures.map(failure => failure.historicalName).join(", ")}`, 409)
  const matches = directory.matchNames(names)
  const identity = {
    exact: matches.filter(match => match.autoLinkEligible && match.evidence !== "historical_alias").length,
    mapped: matches.filter(match => match.autoLinkEligible && match.evidence === "historical_alias").length,
    ambiguous: matches.filter(match => !match.autoLinkEligible && (match.status === "exact" || match.status === "close")).length,
    unresolved: matches.filter(match => !match.autoLinkEligible && match.status !== "exact" && match.status !== "close").length,
  }

  const sourceRows: MonthlyProductionRow[] = validRows.map(row => ({
    logicalObservationKey: canonicalLogicalKey(row, identityValidation.canonicalByName.get(row.historical_player_name)!),
    score: Number(row.score_numeric),
    playedState: "PLAYED",
  }))
  const periodIds = [...new Set(validRows.map(row => Number(row.period_id)))]
  const production = await readProduction(supabase, periodIds)
  const productionRows: MonthlyProductionRow[] = production.map(row => ({
    logicalObservationKey: [row.period_id, divisionIds[row.division] || `label:${row.division}`, row.canonical_player_id, row.course_name, row.difficulty].join("|"),
    score: row.score,
    playedState: row.score === null ? "UNPLAYED" : "PLAYED",
  }))
  const overlap = classifyMonthlyProductionOverlap(sourceRows, productionRows, true)
  if (overlap.trueConflictRows > 0) throw new MonthlyCommitValidationError(`Protected Monthly import aborted: ${overlap.trueConflictRows} true Production conflict(s) detected before writing.`, 409)

  const missingKeys = new Set(overlap.classifications.filter(row => row.status === "MISSING FROM PRODUCTION").map(row => row.logicalObservationKey))
  const expectedRows = validRows.map((row, index) => {
    const canonicalPlayerId = identityValidation.canonicalByName.get(row.historical_player_name)!
    const logicalKey = canonicalLogicalKey(row, canonicalPlayerId)
    if (!missingKeys.has(logicalKey)) return null
    return {
      rowKey: row.repaired_source_fingerprint,
      sourceRow: index + 1,
      originalSourceRow: integerValue(row.source_row, "source row", true),
      year: integerValue(row.year, "period year", true),
      month: integerValue(row.month, "period month", true),
      periodId: integerValue(row.period_id, "period ID", true),
      division: row.division,
      historicalName: row.historical_player_name,
      canonicalPlayerId,
      sourcePlayerId: row.source_player_id.trim() || null,
      courseName: row.course_name,
      difficulty: row.difficulty,
      score: Number(row.score_numeric),
      scoreText: row.score_text,
      holeInOnes: integerValue(row.hole_in_ones, "hole-in-one count"),
      coursePlacement: integerValue(row.course_placement, "course placement"),
      coursePoints: integerValue(row.course_points, "course points"),
      overallPlacement: integerValue(row.overall_placement, "overall placement"),
      coursesPlayed: integerValue(row.courses_played, "courses played"),
      totalStrokes: integerValue(row.total_strokes, "total strokes"),
      overallHn1: integerValue(row.overall_hole_in_ones, "overall hole-in-one count"),
      overallPoints: integerValue(row.overall_points, "overall points"),
      sourceUrl: row.source_url,
      provenance: provenanceFor(row),
      logicalKey,
    }
  }).filter((row): row is NonNullable<typeof row> => row !== null)

  const rowKeys = new Set(expectedRows.map(row => row.rowKey))
  const logicalKeys = new Set(expectedRows.map(row => row.logicalKey))
  if (rowKeys.size !== expectedRows.length || logicalKeys.size !== expectedRows.length) throw new MonthlyCommitValidationError("Protected Monthly import aborted: duplicate source or logical keys remain.", 409)

  return {
    request,
    expectedRows,
    source: {
      sourceSha256: packageData.sourceSha256,
      totalRows: packageData.rows.length,
      eligibleRows: validRows.length,
      zeroRows: validRows.filter(row => Number(row.score_numeric) === 0).length,
      negativeRows: validRows.filter(row => Number(row.score_numeric) < 0).length,
      positiveRows: validRows.filter(row => Number(row.score_numeric) > 0).length,
      finalization: packageData.manifest.finalization,
    },
    identity: { ...identity, scoredIdentities: names.length, failures: identityValidation.failures },
    overlap,
    requestBytes: Buffer.byteLength(JSON.stringify({ ...request, p_rows: expectedRows }), "utf8"),
  }
}
