import type { KwtChronologyRecord } from "./kwtChronology.ts"

export type KwtOfficialPairInput = {
  canonicalPlayerId: string
  originalPlayerName: string
  seasonNumber: number
  weekNumber: number
  evidenceRef: string
  /** The result is authoritative; this is not a claim of exact timestamps. */
  officialResultVerified: boolean
  /** The three-minute requirement is retained as rule provenance only. */
  timingRuleEvidence: "RULE_ONLY"
  easy: {
    sourceId: string
    sourceFingerprint: string
  }
  hard: {
    sourceId: string
    sourceFingerprint: string
  }
}

export type KwtOfficialPairResult = {
  valid: boolean
  records: readonly KwtChronologyRecord[]
  issues: readonly string[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Converts one authoritative KWT Easy/Hard result pair into sequence evidence.
 * The returned records have no playedAt and must remain distinct from exact
 * timestamp evidence until an approved publication policy says otherwise.
 */
export function validateKwtOfficialPair(input: KwtOfficialPairInput): KwtOfficialPairResult {
  const issues: string[] = []
  if (!UUID_PATTERN.test(input.canonicalPlayerId)) issues.push("INVALID_CANONICAL_PLAYER_ID")
  if (!input.originalPlayerName.trim()) issues.push("MISSING_ORIGINAL_PLAYER_NAME")
  if (!Number.isInteger(input.seasonNumber) || input.seasonNumber < 1) issues.push("INVALID_SEASON")
  if (!Number.isInteger(input.weekNumber) || input.weekNumber < 1) issues.push("INVALID_WEEK")
  if (!input.evidenceRef.trim()) issues.push("MISSING_EVIDENCE_REFERENCE")
  if (!input.officialResultVerified) issues.push("UNVERIFIED_OFFICIAL_RESULT")
  if (input.timingRuleEvidence !== "RULE_ONLY") issues.push("INVALID_TIMING_RULE_PROVENANCE")
  if (!input.easy.sourceId.trim() || !input.hard.sourceId.trim()) issues.push("MISSING_SOURCE_ID")
  if (!input.easy.sourceFingerprint.trim() || !input.hard.sourceFingerprint.trim()) issues.push("MISSING_SOURCE_FINGERPRINT")
  if (input.easy.sourceId === input.hard.sourceId) issues.push("DUPLICATE_SOURCE_ID")
  if (input.easy.sourceFingerprint === input.hard.sourceFingerprint) issues.push("DUPLICATE_SOURCE_FINGERPRINT")

  if (issues.length > 0) return { valid: false, records: [], issues }

  const shared = {
    canonicalPlayerId: input.canonicalPlayerId,
    originalPlayerName: input.originalPlayerName,
    seasonNumber: input.seasonNumber,
    weekNumber: input.weekNumber,
    officialSequenceVerified: true as const,
    playedAt: null,
    playedAtVerified: false,
    evidenceRef: input.evidenceRef,
  }
  return {
    valid: true,
    issues: [],
    records: [
      { ...shared, sourceId: input.easy.sourceId, difficulty: "EASY", sourceSequence: 0 },
      { ...shared, sourceId: input.hard.sourceId, difficulty: "HARD", sourceSequence: 1 },
    ],
  }
}
