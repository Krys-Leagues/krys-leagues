import { normalizeIdentity } from "../identity/normalizeIdentity.ts"
import { resolveIdentity } from "../identity/resolveIdentity.ts"
import type {
  IdentityMatchResult,
  IdentityPlayer,
  PlayerIdentityAlias,
} from "../identity/types.ts"
import {
  HISTORICAL_STROKE_PARSER_VERSION,
  type HistoricalStrokePreview,
} from "./adapters/historicalStrokeParser.ts"
import { sourceSha256 } from "../../app/admin/import/csv/lib/fileHash.ts"

export type HistoricalStrokeIdentityReview = {
  historicalDisplayName: string
  status: "verified" | "suggested" | "unresolved" | "conflict"
  canonicalPlayerId: string | null
  candidate: IdentityMatchResult | null
  conflictPlayerIds: string[]
}

export type HistoricalStrokeIdentityDecision = {
  canonicalPlayerId: string | null
  canonicalPlayerName?: string | null
  resolutionNote?: string
}

export type HistoricalStrokeIdentityDecisions = Record<
  string,
  HistoricalStrokeIdentityDecision
>

export type HistoricalStrokeCommitPayload = {
  p_season_number: number
  p_historical_label: string
  p_historical_year: number | null
  p_source_filename: string
  p_source_sha256: string
  p_preview_fingerprint: string
  p_parser_version: string
  p_validated_preview: Record<string, unknown>
}

export type HistoricalStrokeCommitResult = {
  historical_stroke_import_id: string
  idempotent: boolean
  standing_count: number
  course_appearance_count: number
  resolved_identity_count: number
  unresolved_identity_count: number
}

export type HistoricalStrokeCommitState = "new" | "idempotent"

export function historicalStrokeStandingKey(
  divisionNumber: number,
  sourceRow: number
) {
  return `${divisionNumber}:${sourceRow}`
}

function canonicalHistoricalStrokeFacts(preview: HistoricalStrokePreview) {
  return {
    parserVersion: preview.parserVersion,
    source: {
      rows: preview.source.rows,
      columnsPerRow: preview.source.columnsPerRow,
    },
    season: preview.season,
    divisions: preview.divisions.map((division) => ({
      divisionNumber: division.divisionNumber,
      sourceLabel: division.sourceLabel,
      populated: division.populated,
      sourceDisplayOrder: division.sourceDisplayOrder,
      standings: division.standings.map((standing) => ({
        divisionNumber: standing.divisionNumber,
        sourceRow: standing.sourceRow,
        sourcePosition: standing.sourcePosition,
        sourceDisplayPosition: standing.sourceDisplayPosition,
        historicalDisplayName: standing.historicalDisplayName,
        canonicalPlayerId: null,
        played: standing.played,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        points: standing.points,
        strokes: standing.strokes,
        courses: standing.courses.map((course) => ({ ...course })),
      })),
    })),
    byeRows: preview.byeRows,
    templateRows: preview.templateRows,
    malformedRows: preview.malformedRows,
    issues: preview.issues,
    audit: preview.audit,
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

async function sha256Hex(bytes: ArrayBuffer | Uint8Array) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export const historicalStrokeSourceSha256 = sourceSha256

export function historicalStrokePreviewFingerprint(
  preview: HistoricalStrokePreview
) {
  return sha256Hex(
    new TextEncoder().encode(
      stableStringify(canonicalHistoricalStrokeFacts(preview))
    )
  )
}

export function reviewHistoricalStrokeIdentity(
  historicalDisplayName: string,
  players: IdentityPlayer[],
  aliases: PlayerIdentityAlias[]
): HistoricalStrokeIdentityReview {
  const normalizedName = normalizeIdentity(historicalDisplayName)
  const verifiedPlayerIds = Array.from(
    new Set(
      aliases
        .filter(
          (alias) =>
            alias.active &&
            alias.verified &&
            alias.normalizedAlias === normalizedName &&
            players.some((player) => player.id === alias.playerId)
        )
        .map((alias) => {
          const player = players.find((item) => item.id === alias.playerId)
          return player?.canonicalPlayerId ?? alias.playerId
        })
    )
  )

  if (verifiedPlayerIds.length > 1) {
    return {
      historicalDisplayName,
      status: "conflict",
      canonicalPlayerId: null,
      candidate: null,
      conflictPlayerIds: verifiedPlayerIds,
    }
  }

  if (verifiedPlayerIds.length === 1) {
    const player = players.find((item) => item.id === verifiedPlayerIds[0])
      ?? players.find((item) => item.canonicalPlayerId === verifiedPlayerIds[0])
    return {
      historicalDisplayName,
      status: "verified",
      canonicalPlayerId: verifiedPlayerIds[0],
      candidate: player
        ? {
            importedName: historicalDisplayName,
            normalizedName,
            status: "alias",
            playerId: player.id,
            screenName: player.screenName,
            confidence: 100,
            matchedSource: "historical_alias",
            candidates: [],
            autoLinkEligible: true,
            autoLinkReason: "verified historical alias",
          }
        : null,
      conflictPlayerIds: [],
    }
  }

  const candidate = resolveIdentity({
    importedName: historicalDisplayName,
    players,
    aliases,
    options: { minimumSuggestionConfidence: 60, maximumCandidates: 5 },
  })
  return {
    historicalDisplayName,
    status: candidate.status === "unmatched" ? "unresolved" : "suggested",
    canonicalPlayerId: null,
    candidate,
    conflictPlayerIds: [],
  }
}

export function historicalStrokeCommitBlockers(
  preview: HistoricalStrokePreview,
  sourceHash: string,
  fingerprint: string,
  reviews: HistoricalStrokeIdentityReview[] = []
) {
  const blockers: string[] = []
  if (
    preview.season.seasonNumber === null ||
    preview.season.seasonNumber <= 0 ||
    !preview.season.historicalSeasonLabel.trim()
  ) blockers.push("Invalid or missing historical season metadata.")
  if (preview.audit.standingsParsed === 0) blockers.push("No Historical Stroke standings were found.")
  if (preview.audit.malformedRealPlayerRows > 0) blockers.push(`${preview.audit.malformedRealPlayerRows} malformed real-player row(s) were found.`)
  if (preview.audit.leftRightConflicts > 0) blockers.push(`${preview.audit.leftRightConflicts} left/right source conflict(s) were found.`)
  if (preview.audit.statisticalConflicts > 0) blockers.push(`${preview.audit.statisticalConflicts} statistical reconciliation conflict(s) were found.`)
  if (preview.issues.length > 0) blockers.push(`${preview.issues.length} unresolved parser issue(s) were found.`)
  if (!/^[a-f0-9]{64}$/.test(sourceHash) || preview.source.sourceSha256 !== sourceHash) blockers.push("The exact source-byte SHA-256 is missing or does not match the preview.")
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) blockers.push("The deterministic preview fingerprint is missing.")
  if (preview.parserVersion !== HISTORICAL_STROKE_PARSER_VERSION) blockers.push("Historical Stroke parser version mismatch.")
  if (reviews.some((review) => review.status === "conflict")) blockers.push("Conflicting verified Global Player aliases must be resolved before commit.")
  return Array.from(new Set(blockers))
}

export function buildHistoricalStrokeCommitPayload(
  preview: HistoricalStrokePreview,
  sourceFilename: string,
  sourceHash: string,
  fingerprint: string
): HistoricalStrokeCommitPayload {
  if (preview.season.seasonNumber === null) throw new Error("Historical Stroke season number is required.")
  return {
    p_season_number: preview.season.seasonNumber,
    p_historical_label: preview.season.historicalSeasonLabel,
    p_historical_year: preview.season.historicalYear,
    p_source_filename: sourceFilename,
    p_source_sha256: sourceHash,
    p_preview_fingerprint: fingerprint,
    p_parser_version: HISTORICAL_STROKE_PARSER_VERSION,
    // Identity is intentionally applied afterward through the atomic alias-memory RPC.
    p_validated_preview: {
      ...canonicalHistoricalStrokeFacts(preview),
      source: {
        filename: sourceFilename,
        sourceSha256: sourceHash,
        rows: preview.source.rows,
        columnsPerRow: preview.source.columnsPerRow,
      },
    },
  }
}

export function historicalStrokeCommitState(result: HistoricalStrokeCommitResult): HistoricalStrokeCommitState {
  return result.idempotent ? "idempotent" : "new"
}

export function categorizeHistoricalStrokeDatabaseError(error: { code?: string; message: string }) {
  const message = error.message
  if (error.code === "42501" || /authorization|required|permission/i.test(message)) return `Authorization error: ${message}`
  if (/different committed source|already committed|inconsistent metadata/i.test(message)) return `Source conflict: ${message}`
  if (/different canonical player identity|verified alias/i.test(message)) return `Identity conflict: ${message}`
  if (/preview|payload|requires|must|invalid|duplicate|does not agree|unsupported parser/i.test(message)) return `Invalid preview payload: ${message}`
  if (/fetch|network|connection/i.test(message)) return `Network error: ${message}`
  return `Database validation error: ${message}`
}
