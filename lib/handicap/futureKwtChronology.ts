import type { HistoricalTimeEvidence } from "./dateProvenance.ts"

/**
 * Intake contract for future KWT rounds that may eventually contribute to a
 * personal Handicap. Historical imports must not be adapted into this shape
 * unless the source itself proves the play timestamp.
 */
export type FutureKwtChronologyInput = {
  sourceId: string
  sourceFingerprint: string
  canonicalPlayerId: string
  originalPlayerName: string
  playedAt: string
  evidenceRef: string
  seasonNumber?: number | null
  weekNumber?: number | null
  sourceSequence?: number | null
  sourceType: "KWT" | "THE_WEEKLY" | "OTHER"
}

export type FutureKwtChronologyRecord = {
  sourceType: "KWT"
  sourceId: string
  sourceFingerprint: string
  canonicalPlayerId: string
  originalPlayerName: string
  evidenceRef: string
  chronologyClassification: "EXACT"
  personalHandicapEligible: true
  evidence: HistoricalTimeEvidence
}

export type FutureKwtChronologyIssueCode =
  | "DUPLICATE_SOURCE_ID"
  | "DUPLICATE_SOURCE_FINGERPRINT"
  | "INVALID_SOURCE_TYPE"
  | "MISSING_SOURCE_ID"
  | "MISSING_SOURCE_FINGERPRINT"
  | "INVALID_CANONICAL_PLAYER_ID"
  | "MISSING_PLAYER_NAME"
  | "INVALID_PLAYED_AT"
  | "MISSING_EVIDENCE_REFERENCE"

export type FutureKwtChronologyIssue = {
  sourceId: string
  code: FutureKwtChronologyIssueCode
}

export type FutureKwtChronologyBatch = {
  accepted: readonly FutureKwtChronologyRecord[]
  issues: readonly FutureKwtChronologyIssue[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPLICIT_TIMEZONE_PATTERN = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/i

function validPlayedAt(value: string): boolean {
  return EXPLICIT_TIMEZONE_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}

/**
 * Validates one future KWT chronology record and normalizes only its proven
 * timestamp. It never falls back to import time, file time, or period labels.
 */
export function prepareFutureKwtChronology(
  input: FutureKwtChronologyInput,
): FutureKwtChronologyRecord {
  if (input.sourceType !== "KWT") {
    throw new Error("future personal chronology accepts KWT evidence only")
  }
  if (!input.sourceId.trim()) throw new Error("sourceId is required")
  if (!input.sourceFingerprint.trim()) throw new Error("sourceFingerprint is required")
  if (!UUID_PATTERN.test(input.canonicalPlayerId)) throw new Error("canonicalPlayerId must be a UUID")
  if (!input.originalPlayerName.trim()) throw new Error("originalPlayerName is required")
  if (!validPlayedAt(input.playedAt)) throw new Error("playedAt must be a verified timestamp with timezone")
  if (!input.evidenceRef.trim()) throw new Error("evidenceRef is required")

  const playedAt = new Date(input.playedAt).toISOString()
  return {
    sourceType: "KWT",
    sourceId: input.sourceId,
    sourceFingerprint: input.sourceFingerprint,
    canonicalPlayerId: input.canonicalPlayerId,
    originalPlayerName: input.originalPlayerName,
    evidenceRef: input.evidenceRef,
    chronologyClassification: "EXACT",
    personalHandicapEligible: true,
    evidence: {
      sourceId: input.sourceId,
      seasonNumber: input.seasonNumber ?? null,
      weekNumber: input.weekNumber ?? null,
      playedAt,
      evidenceKind: "EXACT_TIMESTAMP",
      sourceSequence: input.sourceSequence ?? null,
    },
  }
}

/**
 * Batch validation is fail-closed for source identity. A duplicate source
 * fingerprint or source ID is never silently collapsed into one round.
 */
export function validateFutureKwtChronologyBatch(
  inputs: readonly FutureKwtChronologyInput[],
): FutureKwtChronologyBatch {
  const accepted: FutureKwtChronologyRecord[] = []
  const issues: FutureKwtChronologyIssue[] = []
  const sourceIds = new Set<string>()
  const fingerprints = new Set<string>()

  for (const input of inputs) {
    const sourceId = input.sourceId.trim()
    if (sourceIds.has(sourceId)) {
      issues.push({ sourceId, code: "DUPLICATE_SOURCE_ID" })
      continue
    }
    if (fingerprints.has(input.sourceFingerprint.trim())) {
      issues.push({ sourceId, code: "DUPLICATE_SOURCE_FINGERPRINT" })
      continue
    }

    try {
      const record = prepareFutureKwtChronology(input)
      sourceIds.add(record.sourceId)
      fingerprints.add(record.sourceFingerprint)
      accepted.push(record)
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid future chronology"
      const code: FutureKwtChronologyIssueCode = message.includes("KWT evidence")
        ? "INVALID_SOURCE_TYPE"
        : message.includes("sourceId")
          ? "MISSING_SOURCE_ID"
          : message.includes("sourceFingerprint")
            ? "MISSING_SOURCE_FINGERPRINT"
            : message.includes("canonicalPlayerId")
              ? "INVALID_CANONICAL_PLAYER_ID"
              : message.includes("originalPlayerName")
                ? "MISSING_PLAYER_NAME"
                : message.includes("playedAt")
                  ? "INVALID_PLAYED_AT"
                  : "MISSING_EVIDENCE_REFERENCE"
      issues.push({ sourceId, code })
    }
  }

  return { accepted, issues }
}
