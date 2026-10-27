export type PublicationEligibility = "QUARANTINED" | "ELIGIBLE"

export type PublicationGateRun = Readonly<{
  id: string
  status: "DRAFT" | "COMPLETED" | "FAILED"
  publicationEligibility?: PublicationEligibility
  quarantined?: boolean
  supersededByRunId?: string | null
  chronologyPolicy?: "EXACT_TIMESTAMP" | "OFFICIAL_KWT_SEQUENCE" | string
  metadata?: Readonly<Record<string, unknown>>
}>

export type PublicationGateProvenance = Readonly<{
  sourceFingerprint: string
  sourceType: "KWT" | "THE_WEEKLY" | string
  originalPlayerName?: string | null
  canonicalPlayerId?: string | null
  metadata?: Readonly<Record<string, unknown>>
}>

export type PublicationGateRating = Readonly<{
  id: string
  calculationRunId: string
  publicationStatus: "DRAFT" | "PROVISIONAL" | "UNPUBLISHED" | "PUBLISHED"
  effectiveFrom: string | null
  slope: number | null
  sourceEvidenceRefs: readonly string[]
}>

export type PublicationGateIndex = Readonly<{
  id: string
  calculationRunId: string
  publicationStatus: "DRAFT" | "PROVISIONAL" | "UNPUBLISHED" | "PUBLISHED"
  chronologyConfidence: "EXACT" | "OFFICIAL_KWT_SEQUENCE" | "PERIOD_WINDOW" | "ORDERED_UNDATED" | "UNKNOWN" | "AMBIGUOUS"
  resultingIndex: number | null
  latestTenSourceRoundIds: readonly string[]
  bestFiveSourceRoundIds: readonly string[]
  activeRoundSourceIds?: readonly string[]
  handicapStatus?: "NOT_YET_RATED" | "PROVISIONAL" | "OFFICIAL_ELIGIBLE"
  sourceRoundIds: readonly string[]
}>

export type PublicationGateIssue = Readonly<{
  recordId: string
  code:
    | "RUN_NOT_COMPLETED"
    | "RUN_NOT_ELIGIBLE"
    | "RUN_QUARANTINED"
    | "RUN_SUPERSEDED"
    | "RATING_NOT_PUBLISHED"
    | "RATING_NOT_EFFECTIVE"
    | "RATING_INVALID_SLOPE"
    | "RATING_MISSING_EVIDENCE"
    | "MISSING_PROVENANCE"
    | "INVALID_KWT_PROVENANCE"
    | "WEEKLY_PERSONAL_SOURCE"
    | "UNSUPPORTED_SOURCE"
    | "INDEX_NOT_PUBLISHED"
    | "INDEX_NOT_OFFICIAL_ELIGIBLE"
    | "INDEX_NOT_ELIGIBLE_CHRONOLOGY"
    | "INDEX_MISSING_RESULT"
    | "INDEX_MISSING_ROUNDS"
}>

function hasSourcePlayer(value: PublicationGateProvenance): boolean {
  const sourcePlayerId = value.metadata?.source_player_id
  return typeof sourcePlayerId === "string" && sourcePlayerId.trim().length > 0
}

function isValidKwtFingerprint(value: string): boolean {
  const parts = value.split("|")
  return parts.length === 5 && parts[0] === "KWT" && parts.slice(1).every((part) => part.trim().length > 0)
}

function provenanceIssue(provenance: PublicationGateProvenance | undefined): PublicationGateIssue["code"] | null {
  if (!provenance) return "MISSING_PROVENANCE"
  if (provenance.sourceType === "THE_WEEKLY") {
    return provenance.metadata?.personal_handicap_eligible === false ? null : "WEEKLY_PERSONAL_SOURCE"
  }
  if (provenance.sourceType !== "KWT") return "UNSUPPORTED_SOURCE"
  if (!provenance.canonicalPlayerId || !provenance.originalPlayerName?.trim() || !hasSourcePlayer(provenance)) return "INVALID_KWT_PROVENANCE"
  return isValidKwtFingerprint(provenance.sourceFingerprint) ? null : "INVALID_KWT_PROVENANCE"
}

export function isPublicationEligibleRun(run: PublicationGateRun | undefined): boolean {
  return Boolean(
    run
      && run.status === "COMPLETED"
      && run.publicationEligibility === "ELIGIBLE"
      && !run.quarantined
      && !run.supersededByRunId,
  )
}

/**
 * Mirrors the Phase 73 database view contract for official rating reads.
 * Missing publication eligibility is intentionally treated as quarantined.
 * Weekly provenance is acceptable for course-rating evidence, but never for
 * personal index selection (which uses a separate KWT-only gate).
 */
export function selectPublicationEligibleRatings(input: {
  ratings: readonly PublicationGateRating[]
  runs: readonly PublicationGateRun[]
  provenance: readonly PublicationGateProvenance[]
}): { ratings: readonly PublicationGateRating[]; issues: readonly PublicationGateIssue[] } {
  const runs = new Map(input.runs.map((run) => [run.id, run]))
  const provenance = new Map(input.provenance.map((record) => [record.sourceFingerprint, record]))
  const ratings: PublicationGateRating[] = []
  const issues: PublicationGateIssue[] = []

  for (const rating of input.ratings) {
    const run = runs.get(rating.calculationRunId)
    if (!run || run.status !== "COMPLETED") {
      issues.push({ recordId: rating.id, code: "RUN_NOT_COMPLETED" })
      continue
    }
    if (run.supersededByRunId) {
      issues.push({ recordId: rating.id, code: "RUN_SUPERSEDED" })
      continue
    }
    if (run.quarantined || run.publicationEligibility !== "ELIGIBLE") {
      issues.push({ recordId: rating.id, code: run.quarantined ? "RUN_QUARANTINED" : "RUN_NOT_ELIGIBLE" })
      continue
    }
    if (rating.publicationStatus !== "PUBLISHED") {
      issues.push({ recordId: rating.id, code: "RATING_NOT_PUBLISHED" })
      continue
    }
    if (!rating.effectiveFrom || Number.isNaN(Date.parse(rating.effectiveFrom))) {
      issues.push({ recordId: rating.id, code: "RATING_NOT_EFFECTIVE" })
      continue
    }
    if (rating.slope === null || !Number.isFinite(rating.slope) || rating.slope <= 0.01) {
      issues.push({ recordId: rating.id, code: "RATING_INVALID_SLOPE" })
      continue
    }
    if (rating.sourceEvidenceRefs.length === 0) {
      issues.push({ recordId: rating.id, code: "RATING_MISSING_EVIDENCE" })
      continue
    }
    const sourceIssue = rating.sourceEvidenceRefs
      .map((ref) => provenanceIssue(provenance.get(ref)))
      .find((issue): issue is PublicationGateIssue["code"] => issue !== null)
    if (sourceIssue) {
      issues.push({ recordId: rating.id, code: sourceIssue })
      continue
    }
    ratings.push(rating)
  }

  return { ratings, issues }
}

function officialSequenceOptIn(run: PublicationGateRun | undefined): boolean {
  return run?.chronologyPolicy === "OFFICIAL_KWT_SEQUENCE"
    && run.metadata?.allow_official_kwt_sequence_publication === true
}

/**
 * Mirrors the reviewed Phase 96 index-view contract. Exact timestamps remain
 * valid as before; official KWT sequence is accepted only when the run opts
 * into that policy and every source row is validated KWT provenance.
 */
export function selectPublicationEligibleIndexes(input: {
  indexes: readonly PublicationGateIndex[]
  runs: readonly PublicationGateRun[]
  provenance: readonly PublicationGateProvenance[]
}): { indexes: readonly PublicationGateIndex[]; issues: readonly PublicationGateIssue[] } {
  const runs = new Map(input.runs.map((run) => [run.id, run]))
  const provenance = new Map(input.provenance.map((record) => [record.sourceFingerprint, record]))
  const indexes: PublicationGateIndex[] = []
  const issues: PublicationGateIssue[] = []

  for (const index of input.indexes) {
    const run = runs.get(index.calculationRunId)
    if (!isPublicationEligibleRun(run)) {
      issues.push({ recordId: index.id, code: run?.quarantined ? "RUN_QUARANTINED" : "RUN_NOT_ELIGIBLE" })
      continue
    }
    if (index.publicationStatus !== "PUBLISHED") {
      issues.push({ recordId: index.id, code: "INDEX_NOT_PUBLISHED" })
      continue
    }
    if (index.handicapStatus && index.handicapStatus !== "OFFICIAL_ELIGIBLE") {
      issues.push({ recordId: index.id, code: "INDEX_NOT_OFFICIAL_ELIGIBLE" })
      continue
    }
    if (index.resultingIndex === null || !Number.isFinite(index.resultingIndex)) {
      issues.push({ recordId: index.id, code: "INDEX_MISSING_RESULT" })
      continue
    }
    const activeRoundSourceIds = index.activeRoundSourceIds ?? index.latestTenSourceRoundIds
    if (activeRoundSourceIds.length === 0) {
      issues.push({ recordId: index.id, code: "INDEX_MISSING_ROUNDS" })
      continue
    }
    const chronologyAllowed = index.chronologyConfidence === "EXACT"
      || (index.chronologyConfidence === "OFFICIAL_KWT_SEQUENCE" && officialSequenceOptIn(run))
    if (!chronologyAllowed) {
      issues.push({ recordId: index.id, code: "INDEX_NOT_ELIGIBLE_CHRONOLOGY" })
      continue
    }
    const sourceIssue = index.sourceRoundIds
      .map((ref) => provenanceIssue(provenance.get(ref)))
      .find((issue): issue is PublicationGateIssue["code"] => issue !== null && issue !== "WEEKLY_PERSONAL_SOURCE")
    if (sourceIssue) {
      issues.push({ recordId: index.id, code: sourceIssue })
      continue
    }
    if (index.sourceRoundIds.some((ref) => provenance.get(ref)?.sourceType !== "KWT")) {
      issues.push({ recordId: index.id, code: "WEEKLY_PERSONAL_SOURCE" })
      continue
    }
    indexes.push(index)
  }

  return { indexes, issues }
}
