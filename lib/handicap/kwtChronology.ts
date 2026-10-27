import {
  reviewLatestTen,
  type HistoricalTimeEvidence,
  type LatestTenReview,
} from "./dateProvenance.ts"

/**
 * User-facing chronology classes for recovered KWT evidence.
 *
 * A source round identifier is a stable identity/provenance value only. It is
 * never treated as a timestamp or as an authoritative within-week sequence.
 */
export type KwtChronologyClassification =
  | "EXACT"
  | "OFFICIAL_KWT_SEQUENCE"
  | "PERIOD_ONLY"
  | "AMBIGUOUS"
  | "UNKNOWN"

export type KwtChronologyRecord = {
  sourceId: string
  canonicalPlayerId?: string | null
  originalPlayerName?: string | null
  seasonNumber?: number | null
  weekNumber?: number | null
  playedAt?: string | null
  /** True only when the source explicitly establishes this timestamp as play time. */
  playedAtVerified?: boolean
  /** True only when a verified KWT result contains the official pair. */
  officialSequenceVerified?: boolean
  difficulty?: "EASY" | "HARD"
  evidenceRef?: string | null
  /** Retained as source metadata; it is not sufficient to establish chronology. */
  sourceSequence?: number | null
}

export type KwtChronologyRecordResult = {
  classification: KwtChronologyClassification
  evidence: HistoricalTimeEvidence
}

export type KwtPlayerChronologyResult = {
  classification: KwtChronologyClassification
  evidence: readonly HistoricalTimeEvidence[]
  latestTenReview: LatestTenReview
}

function isValidTimestamp(value: string | null | undefined): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function reviewClassification(review: LatestTenReview): KwtChronologyClassification {
  switch (review.confidence) {
    case "EXACT": return "EXACT"
    case "OFFICIAL_KWT_SEQUENCE": return "OFFICIAL_KWT_SEQUENCE"
    case "PERIOD_WINDOW": return "PERIOD_ONLY"
    case "AMBIGUOUS": return "AMBIGUOUS"
    default: return "UNKNOWN"
  }
}

/** Converts one recovered KWT record without inventing a played-at date. */
export function classifyKwtChronology(record: KwtChronologyRecord): KwtChronologyRecordResult {
  const exact = record.playedAtVerified === true && isValidTimestamp(record.playedAt)
  const officialSequence = !exact
    && record.officialSequenceVerified === true
    && Number.isInteger(record.seasonNumber)
    && Number.isInteger(record.weekNumber)
    && (record.difficulty === "EASY" || record.difficulty === "HARD")
  const evidence: HistoricalTimeEvidence = exact
    ? {
        sourceId: record.sourceId,
        playedAt: record.playedAt,
        evidenceKind: "EXACT_TIMESTAMP",
        sourceSequence: record.sourceSequence ?? null,
      }
    : officialSequence
      ? {
          sourceId: record.sourceId,
          seasonNumber: record.seasonNumber,
          weekNumber: record.weekNumber,
          playedAt: null,
          evidenceKind: "OFFICIAL_KWT_SEQUENCE",
          difficulty: record.difficulty,
          evidenceRef: record.evidenceRef ?? null,
          sourceSequence: record.sourceSequence ?? (record.difficulty === "EASY" ? 0 : 1),
        }
    : Number.isInteger(record.seasonNumber) && Number.isInteger(record.weekNumber)
      ? {
          sourceId: record.sourceId,
          seasonNumber: record.seasonNumber,
          weekNumber: record.weekNumber,
          playedAt: null,
          evidenceKind: "WEEK_WINDOW",
          sourceSequence: record.sourceSequence ?? null,
        }
      : {
          sourceId: record.sourceId,
          playedAt: null,
          evidenceKind: "UNKNOWN",
          sourceSequence: record.sourceSequence ?? null,
        }

  return {
    classification: evidence.evidenceKind === "EXACT_TIMESTAMP"
      ? "EXACT"
      : evidence.evidenceKind === "OFFICIAL_KWT_SEQUENCE" ? "OFFICIAL_KWT_SEQUENCE"
        : evidence.evidenceKind === "WEEK_WINDOW" ? "PERIOD_ONLY" : "UNKNOWN",
    evidence,
  }
}

/** Reviews a player's latest-ten boundary while preserving period ambiguity. */
export function classifyKwtPlayerChronology(
  records: readonly KwtChronologyRecord[],
  limit = 10,
): KwtPlayerChronologyResult {
  const classified = records.map(classifyKwtChronology)
  const evidence = classified.map((item) => item.evidence)
  const latestTenReview = reviewLatestTen(evidence, limit)
  return {
    classification: reviewClassification(latestTenReview),
    evidence,
    latestTenReview,
  }
}
