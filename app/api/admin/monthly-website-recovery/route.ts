import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"
import Papa from "papaparse"
import { authorizedAdminClient } from "@/app/api/admin/records/arizona-modern/_shared"
import { isMonthlyLegacyMergedPlaceholder, previewMonthlyWebsiteCsvRows } from "@/lib/importer/adapters/monthlyWebsiteAdapter"
import { matchPlayers, type PlayerMatch } from "@/lib/importer/matchPlayers"
import { normalizeIdentity } from "@/lib/identity/normalizeIdentity"
import { validateMonthlyWebsiteIdentities } from "@/lib/importer/monthlyWebsiteIdentityValidation"

type Manifest = {
  normalizedCsvSha256: string
  rawRenderedRows: number
  scoreObservations: number
  missingScoreObservations: number
  coverage: { earliest: string; latest: string; periodCount: number; periods: string[] }
  finalization: { finalizedThrough: string; activePeriodPolicy: string; currentPeriodReason: string }
}
type PlayerRow = { id: string; screen_name: string; discord_name: string | null; discord_username: string | null; discord_id: string | null; active: boolean; status: string | null }
type AliasRow = { id: string; player_id: string; alias: string; normalized_alias: string; source: string | null; verified: boolean }
type LinkRow = { historical_player_id: string; canonical_player_id: string }
type ExistingScoreRow = {
  historical_monthly_import_id: string
  source_fingerprint: string
  period_year: number
  period_month: number
  division: string
  historical_player_name: string
  course_name: string
  difficulty: string
  score: number
  canonical_player_id: string
}
type ExistingImportRow = { id: string; source_sha256: string }
const scorePageSize = 1000
const root = join(process.cwd(), "docs", "historical-sources", "monthly", "website-recovery")

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

function canonicalId(playerId: string, links: LinkRow[]) {
  const direct = new Map(links.map(link => [link.historical_player_id, link.canonical_player_id]))
  const visited = new Set<string>()
  let current = playerId
  while (direct.has(current) && !visited.has(current)) {
    visited.add(current)
    current = direct.get(current)!
  }
  return current
}

function publicMatch(name: string, match: PlayerMatch | undefined) {
  const legacyMergedPlaceholder = isMonthlyLegacyMergedPlaceholder(name)
  const resolved = Boolean(match?.playerId && match.autoLinkEligible && match.confidence === 100 && (!legacyMergedPlaceholder || match.evidence === "historical_alias"))
  return {
    key: normalizeIdentity(name),
    historicalName: name,
    status: resolved ? "resolved" as const : legacyMergedPlaceholder ? "unresolved" as const : match?.status === "close" || match?.status === "exact" ? "ambiguous" as const : "unresolved" as const,
    playerId: resolved ? match?.playerId ?? null : null,
    playerName: resolved ? match?.matchedName ?? null : null,
    suggestedPlayerId: resolved || legacyMergedPlaceholder ? null : match?.playerId ?? null,
    suggestedPlayerName: resolved || legacyMergedPlaceholder ? null : match?.matchedName ?? null,
    confidence: match?.confidence ?? 0,
    evidence: match?.evidence ?? "none",
  }
}

async function readExistingScores(supabase: SupabaseClient) {
  const rows: ExistingScoreRow[] = []
  for (let offset = 0; ; offset += scorePageSize) {
    const result = await supabase
      .from("historical_monthly_score_observations")
      .select("historical_monthly_import_id, source_fingerprint, period_year, period_month, division, historical_player_name, course_name, difficulty, score, canonical_player_id")
      .range(offset, offset + scorePageSize - 1)
    if (result.error) return { rows: [], error: result.error }
    rows.push(...((result.data ?? []) as ExistingScoreRow[]))
    if ((result.data ?? []).length < scorePageSize) return { rows, error: null }
  }
}

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error
  const supabase = authorization.supabase!
  try {
    const [manifestText, csvText] = await Promise.all([
      readFile(join(root, "monthly-website-source-manifest.json"), "utf8"),
      readFile(join(root, "monthly-website-score-observations.csv"), "utf8"),
    ])
    const manifest = JSON.parse(manifestText) as Manifest
    const sourceSha256 = createHash("sha256").update(csvText, "utf8").digest("hex")
    if (sourceSha256 !== manifest.normalizedCsvSha256) throw new Error("source_sha_mismatch")
    const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
    if (parsed.errors.length) throw new Error("csv_parse_error")
    const preview = previewMonthlyWebsiteCsvRows(parsed.data, { finalizedThrough: manifest.finalization.finalizedThrough })
    if (preview.summary.totalRows !== manifest.rawRenderedRows || preview.summary.scoreRows !== manifest.scoreObservations || preview.summary.missingScoreRows !== manifest.missingScoreObservations) throw new Error("source_count_mismatch")
    if (preview.summary.duplicateRows || preview.summary.conflictingRows || preview.summary.totalMismatches) throw new Error("source_validation_error")

    const [playersResult, aliasesResult, linksResult, importsResult] = await Promise.all([
      supabase.from("players").select("id, screen_name, discord_name, discord_username, discord_id, active, status").order("screen_name"),
      supabase.from("player_aliases").select("id, player_id, alias, normalized_alias, source, verified").eq("verified", true).order("alias"),
      supabase.from("player_identity_links").select("historical_player_id, canonical_player_id"),
      supabase.from("historical_monthly_imports").select("id, source_sha256, source_row_count, applied_row_count, committed_by, committed_at"),
    ])
    if (playersResult.error || aliasesResult.error || linksResult.error) throw new Error("identity_load_error")
    const links = (linksResult.data ?? []) as LinkRow[]
    const allPlayers = (playersResult.data ?? []) as PlayerRow[]
    const players = allPlayers.filter(player => canonicalId(player.id, links) === player.id)
    const aliases = ((aliasesResult.data ?? []) as AliasRow[]).map(alias => ({ ...alias, player_id: canonicalId(alias.player_id, links) }))
    const historicalNames = [...new Map(preview.rows.filter(row => row.importable).map(row => [normalizeIdentity(row.historicalPlayerName), row.historicalPlayerName])).values()]
    const playerRecords = players.map(player => ({ ...player }))
    const identityAliases = aliases.map(alias => ({ id: alias.id, playerId: alias.player_id, aliasName: alias.alias, normalizedAlias: alias.normalized_alias, source: "historical_alias" as const, active: true, verified: alias.verified }))
    const matchResults = matchPlayers(historicalNames, playerRecords, identityAliases, links.map(link => ({ historicalPlayerId: link.historical_player_id, canonicalPlayerId: link.canonical_player_id })))
    const identityCandidates = historicalNames.map((name, index) => publicMatch(name, matchResults[index]))
    const validSourceRows = preview.rows.filter(row => row.importable && row.score !== null && row.issues.length === 0)
    const serverIdentityValidation = validateMonthlyWebsiteIdentities([...new Set(validSourceRows.map(row => row.historicalPlayerName))], {
      rawPlayers: allPlayers,
      canonicalId: (playerId) => canonicalId(playerId, links),
      matchNames: (names) => matchPlayers(names, allPlayers, identityAliases, links.map(link => ({ historicalPlayerId: link.historical_player_id, canonicalPlayerId: link.canonical_player_id }))),
    })
    const scoreRowsResult = await readExistingScores(supabase)
    const existingScores = scoreRowsResult.error ? [] : scoreRowsResult.rows
    const sourceRows = preview.rows.filter(row => row.importable && row.score !== null && row.issues.length === 0)
    const sourceFingerprints = new Set(sourceRows.map(row => row.sourceFingerprint))
    const sourceByLogicalKey = new Map<string, typeof sourceRows>()
    for (const row of sourceRows) {
      const key = `${row.year}-${row.month}|${row.division}|${row.historicalPlayerName}|${row.courseName}|${row.difficulty}`
      sourceByLogicalKey.set(key, [...(sourceByLogicalKey.get(key) ?? []), row])
    }
    const logicalKey = (row: ExistingScoreRow) => `${row.period_year}-${row.period_month}|${row.division}|${row.historical_player_name}|${row.course_name}|${row.difficulty}`
    const sourceShaByImportId = new Map(((importsResult.data ?? []) as ExistingImportRow[]).map(row => [row.id, row.source_sha256]))
    const crossSourceFingerprintRows = existingScores.filter(row => sourceFingerprints.has(row.source_fingerprint) && sourceShaByImportId.get(row.historical_monthly_import_id) !== sourceSha256)
    const logicalConflictRows = existingScores.filter(row => {
      const sourceMatches = sourceByLogicalKey.get(logicalKey(row)) ?? []
      return sourceMatches.length > 0 && !sourceMatches.some(source => source.sourceFingerprint === row.source_fingerprint && source.score === row.score)
    })
    const trueConflictRows = new Set([...crossSourceFingerprintRows, ...logicalConflictRows].map(row => `${row.historical_monthly_import_id}:${row.source_fingerprint}`)).size
    const productionOverlap = {
      available: !scoreRowsResult.error && !importsResult.error,
      exactDuplicateRows: existingScores.filter(row => sourceFingerprints.has(row.source_fingerprint) && sourceShaByImportId.get(row.historical_monthly_import_id) === sourceSha256).length,
      productionOnlyRows: existingScores.filter(row => !sourceFingerprints.has(row.source_fingerprint)).length,
      crossSourceFingerprintRows: crossSourceFingerprintRows.length,
      trueConflictRows,
    }
    const periods = [...new Map(preview.rows.map(row => [row.period, row])).values()]
      .sort((left, right) => left.year - right.year || left.month - right.month)
      .map(period => {
        const periodRows = preview.rows.filter(row => row.period === period.period)
        return {
          period: period.period,
          year: period.year,
          month: period.month,
          status: period.periodStatus,
          importable: period.importable,
          reason: period.periodBlockReason,
          rows: periodRows.length,
          scoredRows: periodRows.filter(row => row.score !== null).length,
          missingScoreRows: periodRows.filter(row => row.score === null).length,
        }
      })
    return Response.json({ parserVersion: "historical-monthly-website-v2-period-gated", sourceFile: "monthly-website-score-observations.csv", sourceSha256, manifest, validation: preview.summary, rows: preview.rows, periods, identityCandidates, identityValidation: { ready: serverIdentityValidation.ready, unresolvedNames: serverIdentityValidation.failures.map(failure => failure.historicalName), scoredRows: validSourceRows.length }, players, aliases, links, existingImport: importsResult.error ? null : ((importsResult.data ?? []) as ExistingImportRow[]).find(row => row.source_sha256 === sourceSha256) ?? null, existingScoreCount: scoreRowsResult.error ? null : existingScores.length, productionOverlap }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return jsonError("The preserved Monthly source could not be loaded or validated.", 500)
  }
}
