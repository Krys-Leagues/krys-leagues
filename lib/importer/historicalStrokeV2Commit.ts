import {
  HISTORICAL_STROKE_V2_PARSER_VERSION,
  type HistoricalStrokeV2Preview,
} from "./adapters/historicalStrokeV2.ts"

export type HistoricalStrokeV2IdentityDecision = {
  historicalPlayerName: string
  canonicalPlayerId: string | null
  canonicalPlayerName?: string | null
  resolutionNote?: string
}

export type HistoricalStrokeV2ReviewState = {
  parserVersion: string
  previewFingerprint: string
  identityDecisions: HistoricalStrokeV2IdentityDecision[]
}

export type HistoricalStrokeV2CommitPayload = {
  p_source_filename: string
  p_normalized_source_sha256: string
  p_preview_fingerprint: string
  p_parser_version: typeof HISTORICAL_STROKE_V2_PARSER_VERSION
  p_validated_preview: Record<string, unknown>
}

export function historicalStrokeV2CommitBlockers(
  preview: HistoricalStrokeV2Preview,
  normalizedSourceSha256: string,
  previewFingerprint: string
) {
  const blockers: string[] = []
  if (preview.parserVersion !== HISTORICAL_STROKE_V2_PARSER_VERSION) blockers.push("Historical Stroke V2 parser version mismatch.")
  if (preview.audit.observations === 0) blockers.push("No normalized Stroke observations were found.")
  if (preview.audit.currentPeriods > 0) blockers.push("Current or incomplete periods are evidence-only and cannot be committed.")
  if (preview.audit.malformedObservations > 0) blockers.push(`${preview.audit.malformedObservations} malformed source row(s) remain blocked.`)
  if (preview.audit.sourceTokenUnplayedObservations > 0) blockers.push(`${preview.audit.sourceTokenUnplayedObservations} unplayed source-token row(s) require an additive score-state schema update before import.`)
  if (preview.issues.length > 0) blockers.push(...preview.issues)
  if (!/^[a-f0-9]{64}$/i.test(normalizedSourceSha256)) blockers.push("The normalized source SHA-256 is missing.")
  if (!/^[a-f0-9]{64}$/i.test(previewFingerprint)) blockers.push("The deterministic V2 preview fingerprint is missing.")
  if (preview.periods.some((period) => !period.importable)) blockers.push("One or more periods are not importable.")
  return Array.from(new Set(blockers))
}

export function historicalStrokeV2PreviewFacts(preview: HistoricalStrokeV2Preview) {
  return {
    parserVersion: preview.parserVersion,
    source: preview.source,
    periods: preview.periods,
    observations: preview.observations,
    pairings: preview.pairings,
    malformedRows: preview.malformedRows,
    audit: preview.audit,
  }
}

export function buildHistoricalStrokeV2CommitPayload(
  preview: HistoricalStrokeV2Preview,
  sourceFilename: string,
  normalizedSourceSha256: string,
  previewFingerprint: string,
  identityDecisions: HistoricalStrokeV2IdentityDecision[] = []
): HistoricalStrokeV2CommitPayload {
  return {
    p_source_filename: sourceFilename,
    p_normalized_source_sha256: normalizedSourceSha256,
    p_preview_fingerprint: previewFingerprint,
    p_parser_version: HISTORICAL_STROKE_V2_PARSER_VERSION,
    p_validated_preview: {
      ...historicalStrokeV2PreviewFacts(preview),
      identityDecisions,
    },
  }
}
