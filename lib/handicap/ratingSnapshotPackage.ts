import { summarizeCurrentRating } from "./ratingModel.ts"

export type RatingEvidenceSource = "KWT" | "THE_WEEKLY"
export type RatingEvidenceRow = {
  source: RatingEvidenceSource
  sourceFingerprint: string
  sourceEvidenceRef: string
  courseCode: string
  courseId: string
  difficulty: "easy" | "hard"
  score: number
  sourcePlayerKey: string
  canonicalPlayerId: string | null
  originalPlayerName: string
}

export type RatingEvidenceException = {
  source: RatingEvidenceSource
  sourceFingerprint: string | null
  sourceEvidenceRef: string
  courseCode: string | null
  reason:
    | "MISSING_FINGERPRINT"
    | "DUPLICATE_FINGERPRINT"
    | "CONFLICTING_FINGERPRINT"
    | "INVALID_SCORE"
    | "MISSING_SOURCE_PLAYER"
    | "UNRESOLVED_CANONICAL_ID"
    | "UNKNOWN_COURSE_CODE"
}

export type RatingSnapshotBlocker =
  | "INSUFFICIENT_SAMPLE_SIZE"
  | "PROVISIONAL_SAMPLE_SIZE"
  | "INSUFFICIENT_DISTINCT_PLAYERS"
  | "EXCESSIVE_PLAYER_CONCENTRATION"
  | "INVALID_OR_NEAR_ZERO_SLOPE"
  | "UNRESOLVED_SOURCE_EXCEPTIONS"
  | "MISSING_APPROVED_EFFECTIVE_DATE"
  | "EXPLICIT_REVIEW_APPROVAL_REQUIRED"

export type RatingSnapshotScope = "KWT_ONLY" | "WEEKLY_ONLY" | "KWT_PLUS_WEEKLY"

export type RatingSnapshotManifestRow = Readonly<{
  snapshotId: string
  calculationRunId: string
  scope: RatingSnapshotScope
  courseCode: string
  courseId: string
  difficulty: "easy" | "hard"
  courseRating: number | null
  slope: number | null
  sampleSize: number
  distinctVerifiedSourcePlayers: number
  maximumPlayerShare: number
  ratingConfidence: "UNRATED" | "PROVISIONAL" | "POTENTIALLY_READY" | "NEEDS_REVIEW"
  modelVersion: string
  differentialModelVersion: string
  referenceSlope: number
  effectiveFrom: null
  effectivePeriod: string
  sourceEvidenceFingerprints: readonly string[]
  sourceContribution: Readonly<{ KWT: number; THE_WEEKLY: number }>
  quarantinedEvidenceCount: number
  statisticalEligibility: "ELIGIBLE" | "PROVISIONAL" | "INSUFFICIENT" | "NEEDS_REVIEW"
  importEligible: boolean
  publicationBlockers: readonly RatingSnapshotBlocker[]
  publicationEligible: boolean
  publicationStatus: "UNPUBLISHED"
}>

export type RatingSnapshotPackage = Readonly<{
  calculationRunId: string
  policyVersion: string
  ratingModelVersion: string
  differentialModelVersion: string
  referenceSlope: number
  effectiveFrom: null
  effectivePeriod: string
  accepted: readonly RatingEvidenceRow[]
  exceptions: readonly RatingEvidenceException[]
  snapshots: readonly RatingSnapshotManifestRow[]
}>

const RATING_MODEL_VERSION = "krys-course-rating-elite-lowest-12-v1"
const DIFFERENTIAL_MODEL_VERSION = "krys-handicap-candidate-a-v1"

function stableText(value: string): string {
  return value.trim()
}

function samePayload(left: RatingEvidenceRow, right: RatingEvidenceRow): boolean {
  return left.source === right.source
    && left.courseCode === right.courseCode
    && left.courseId === right.courseId
    && left.difficulty === right.difficulty
    && left.score === right.score
    && left.sourcePlayerKey === right.sourcePlayerKey
    && left.canonicalPlayerId === right.canonicalPlayerId
    && left.originalPlayerName === right.originalPlayerName
}

function deduplicateEvidence(rows: readonly RatingEvidenceRow[]): {
  accepted: readonly RatingEvidenceRow[]
  exceptions: readonly RatingEvidenceException[]
} {
  const byFingerprint = new Map<string, RatingEvidenceRow[]>()
  const exceptions: RatingEvidenceException[] = []

  for (const row of rows) {
    const fingerprint = stableText(row.sourceFingerprint)
    if (!fingerprint) {
      exceptions.push({
        source: row.source,
        sourceFingerprint: null,
        sourceEvidenceRef: row.sourceEvidenceRef,
        courseCode: row.courseCode || null,
        reason: "MISSING_FINGERPRINT",
      })
      continue
    }
    const group = byFingerprint.get(fingerprint) ?? []
    group.push({ ...row, sourceFingerprint: fingerprint })
    byFingerprint.set(fingerprint, group)
  }

  const accepted: RatingEvidenceRow[] = []
  for (const [fingerprint, group] of [...byFingerprint.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length === 1) {
      accepted.push(group[0])
      continue
    }
    if (!group.every((row) => samePayload(row, group[0]))) {
      for (const row of group) {
        exceptions.push({
          source: row.source,
          sourceFingerprint: fingerprint,
          sourceEvidenceRef: row.sourceEvidenceRef,
          courseCode: row.courseCode || null,
          reason: "CONFLICTING_FINGERPRINT",
        })
      }
      continue
    }
    accepted.push(group[0])
    for (const duplicate of group.slice(1)) {
      exceptions.push({
        source: duplicate.source,
        sourceFingerprint: fingerprint,
        sourceEvidenceRef: duplicate.sourceEvidenceRef,
        courseCode: duplicate.courseCode || null,
        reason: "DUPLICATE_FINGERPRINT",
      })
    }
  }
  return { accepted, exceptions }
}

function maximumPlayerShare(rows: readonly RatingEvidenceRow[]): number {
  if (!rows.length) return 0
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.source}:${row.canonicalPlayerId ?? row.sourcePlayerKey}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Math.max(...counts.values()) / rows.length
}

function confidence(
  sampleSize: number,
  distinctPlayers: number,
  maxShare: number,
  slope: number | null,
): RatingSnapshotManifestRow["ratingConfidence"] {
  if (sampleSize < 20) return "UNRATED"
  if (slope === null || slope <= 0.01) return "NEEDS_REVIEW"
  if (sampleSize < 50) return "PROVISIONAL"
  if (distinctPlayers < 20 || maxShare > 0.1) return "NEEDS_REVIEW"
  return "POTENTIALLY_READY"
}

function publicationBlockers(
  sampleSize: number,
  distinctPlayers: number,
  maxShare: number,
  slope: number | null,
  ratingConfidence: RatingSnapshotManifestRow["ratingConfidence"],
  quarantinedEvidenceCount: number,
): RatingSnapshotBlocker[] {
  const blockers: RatingSnapshotBlocker[] = []
  if (sampleSize < 20) blockers.push("INSUFFICIENT_SAMPLE_SIZE")
  else if (sampleSize < 50) blockers.push("PROVISIONAL_SAMPLE_SIZE")
  if (sampleSize >= 50 && distinctPlayers < 20) blockers.push("INSUFFICIENT_DISTINCT_PLAYERS")
  if (sampleSize >= 50 && maxShare > 0.1) blockers.push("EXCESSIVE_PLAYER_CONCENTRATION")
  if (slope === null || slope <= 0.01) blockers.push("INVALID_OR_NEAR_ZERO_SLOPE")
  if (quarantinedEvidenceCount > 0) blockers.push("UNRESOLVED_SOURCE_EXCEPTIONS")
  blockers.push("MISSING_APPROVED_EFFECTIVE_DATE", "EXPLICIT_REVIEW_APPROVAL_REQUIRED")
  if (ratingConfidence === "NEEDS_REVIEW") return blockers
  return blockers
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000
}

function buildSnapshot(
  rows: readonly RatingEvidenceRow[],
  exceptions: readonly RatingEvidenceException[],
  scope: RatingSnapshotScope,
  calculationRunId: string,
  effectivePeriod: string,
): RatingSnapshotManifestRow | null {
  if (!rows.length) return null
  const ordered = rows.slice().sort((a, b) => a.sourceFingerprint.localeCompare(b.sourceFingerprint))
  const summary = summarizeCurrentRating(ordered.map((row) => row.score))
  const usableSlope = summary.slopeRating !== null && summary.slopeRating > 0.01
  const sourceContribution = {
    KWT: ordered.filter((row) => row.source === "KWT").length,
    THE_WEEKLY: ordered.filter((row) => row.source === "THE_WEEKLY").length,
  }
  const distinctPlayers = new Set(ordered.map((row) => `${row.source}:${row.canonicalPlayerId ?? row.sourcePlayerKey}`)).size
  const courseCode = ordered[0].courseCode
  const courseId = ordered[0].courseId
  const difficulty = ordered[0].difficulty
  const relevantSources = new Set(rows.map((row) => row.source))
  const relevantExceptions = exceptions.filter((exception) =>
    exception.courseCode === courseCode && relevantSources.has(exception.source),
  )
  const roundedMaximumPlayerShare = round(maximumPlayerShare(ordered)) ?? 0
  const ratingConfidence = confidence(ordered.length, distinctPlayers, roundedMaximumPlayerShare, usableSlope ? summary.slopeRating : null)
  const blockers = publicationBlockers(ordered.length, distinctPlayers, roundedMaximumPlayerShare, usableSlope ? summary.slopeRating : null, ratingConfidence, relevantExceptions.length)
  const statisticalEligibility = ratingConfidence === "POTENTIALLY_READY"
    ? "ELIGIBLE"
    : ratingConfidence === "PROVISIONAL"
      ? "PROVISIONAL"
      : ratingConfidence === "UNRATED"
        ? "INSUFFICIENT"
        : "NEEDS_REVIEW"
  return {
    snapshotId: `phase60:${scope.toLowerCase()}:${courseCode}:${difficulty}`,
    calculationRunId,
    scope,
    courseCode,
    courseId,
    difficulty,
    courseRating: usableSlope ? round(summary.courseRating) : null,
    slope: usableSlope ? round(summary.slopeRating) : null,
    sampleSize: ordered.length,
    distinctVerifiedSourcePlayers: distinctPlayers,
    maximumPlayerShare: roundedMaximumPlayerShare,
    ratingConfidence,
    modelVersion: RATING_MODEL_VERSION,
    differentialModelVersion: DIFFERENTIAL_MODEL_VERSION,
    referenceSlope: 8.515,
    effectiveFrom: null,
    effectivePeriod,
    sourceEvidenceFingerprints: ordered.map((row) => row.sourceFingerprint),
    sourceContribution,
    quarantinedEvidenceCount: relevantExceptions.length,
    statisticalEligibility,
    importEligible: usableSlope && (ratingConfidence === "PROVISIONAL" || ratingConfidence === "POTENTIALLY_READY"),
    publicationBlockers: blockers,
    // The package deliberately stops before review approval and activation-date
    // selection. This is derived from the blocker list rather than hard-coded,
    // so an approved future package cannot accidentally publish by omission.
    publicationEligible: blockers.length === 0,
    publicationStatus: "UNPUBLISHED",
  }
}

export function buildRatingSnapshotPackage(
  rows: readonly RatingEvidenceRow[],
  options: {
    calculationRunId: string
    policyVersion: string
    effectivePeriod: string
  },
): RatingSnapshotPackage {
  if (!stableText(options.calculationRunId)) throw new Error("calculationRunId is required")
  if (!stableText(options.policyVersion)) throw new Error("policyVersion is required")
  if (!stableText(options.effectivePeriod)) throw new Error("effectivePeriod is required")

  const inputExceptions: RatingEvidenceException[] = []
  const validRows: RatingEvidenceRow[] = []
  for (const row of rows) {
    if (!Number.isFinite(row.score)) {
      inputExceptions.push({ source: row.source, sourceFingerprint: row.sourceFingerprint || null, sourceEvidenceRef: row.sourceEvidenceRef, courseCode: row.courseCode || null, reason: "INVALID_SCORE" })
    } else if (!stableText(row.sourcePlayerKey)) {
      inputExceptions.push({ source: row.source, sourceFingerprint: row.sourceFingerprint || null, sourceEvidenceRef: row.sourceEvidenceRef, courseCode: row.courseCode || null, reason: "MISSING_SOURCE_PLAYER" })
    } else if (row.source === "KWT" && !row.canonicalPlayerId) {
      inputExceptions.push({ source: row.source, sourceFingerprint: row.sourceFingerprint || null, sourceEvidenceRef: row.sourceEvidenceRef, courseCode: row.courseCode || null, reason: "UNRESOLVED_CANONICAL_ID" })
    } else if (!stableText(row.courseCode) || !stableText(row.courseId)) {
      inputExceptions.push({ source: row.source, sourceFingerprint: row.sourceFingerprint || null, sourceEvidenceRef: row.sourceEvidenceRef, courseCode: row.courseCode || null, reason: "UNKNOWN_COURSE_CODE" })
    } else {
      validRows.push(row)
    }
  }

  const deduplicated = deduplicateEvidence(validRows)
  const exceptions = [...inputExceptions, ...deduplicated.exceptions]
  const groups = new Map<string, RatingEvidenceRow[]>()
  for (const row of deduplicated.accepted) {
    const key = `${row.courseCode}:${row.difficulty}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const snapshots: RatingSnapshotManifestRow[] = []
  for (const group of [...groups.values()]) {
    const kwt = group.filter((row) => row.source === "KWT")
    const weekly = group.filter((row) => row.source === "THE_WEEKLY")
    const combined = buildSnapshot(group, exceptions, "KWT_PLUS_WEEKLY", options.calculationRunId, options.effectivePeriod)
    const kwtSnapshot = buildSnapshot(kwt, exceptions, "KWT_ONLY", options.calculationRunId, options.effectivePeriod)
    const weeklySnapshot = buildSnapshot(weekly, exceptions, "WEEKLY_ONLY", options.calculationRunId, options.effectivePeriod)
    if (kwtSnapshot) snapshots.push(kwtSnapshot)
    if (weeklySnapshot) snapshots.push(weeklySnapshot)
    if (combined) snapshots.push(combined)
  }

  return Object.freeze({
    calculationRunId: options.calculationRunId,
    policyVersion: options.policyVersion,
    ratingModelVersion: RATING_MODEL_VERSION,
    differentialModelVersion: DIFFERENTIAL_MODEL_VERSION,
    referenceSlope: 8.515,
    effectiveFrom: null,
    effectivePeriod: options.effectivePeriod,
    accepted: Object.freeze(deduplicated.accepted),
    exceptions: Object.freeze(exceptions),
    snapshots: Object.freeze(snapshots.sort((a, b) => `${a.courseCode}:${a.difficulty}:${a.scope}`.localeCompare(`${b.courseCode}:${b.difficulty}:${b.scope}`))),
  })
}
