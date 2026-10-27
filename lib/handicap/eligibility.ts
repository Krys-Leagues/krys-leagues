export type HandicapCalculationRunStatus = "DRAFT" | "COMPLETED" | "FAILED"
export type HandicapPublicationEligibility = "QUARANTINED" | "ELIGIBLE"

export type HandicapCalculationRunEligibility = Readonly<{
  id: string
  status: HandicapCalculationRunStatus
  /** Missing eligibility is intentionally treated as quarantined. */
  publicationEligibility?: HandicapPublicationEligibility
  quarantined?: boolean
  supersededByRunId?: string | null
}>

export type HandicapProvenanceRecord = Readonly<{
  id: string
  sourceFingerprint: string
  sourceType: "KWT" | "THE_WEEKLY" | "APPROVED_PERSONAL" | "OTHER"
  sourceRef: string
  originalPlayerName?: string | null
  canonicalPlayerId?: string | null
  personalHandicapEligible?: boolean | null
  calculationRunId?: string | null
  quarantined?: boolean
}>

export type HandicapPublishedRatingRecord = Readonly<{
  id: string
  calculationRunId: string
  courseId: string
  difficulty: "easy" | "hard"
  courseRating: number | null
  slope: number | null
  effectiveFrom: string | null
  publicationStatus: "DRAFT" | "PROVISIONAL" | "UNPUBLISHED" | "PUBLISHED"
  sourceEvidenceRefs: readonly string[]
}>

export type EligibilityIssueCode =
  | "RUN_NOT_ACTIVE"
  | "RUN_NOT_ELIGIBLE"
  | "RUN_QUARANTINED"
  | "RUN_SUPERSEDED"
  | "MISSING_CANONICAL_PLAYER"
  | "MISSING_SOURCE_PLAYER"
  | "MALFORMED_KWT_FINGERPRINT"
  | "EXTERNAL_SOURCE_NOT_PERSONAL"
  | "PROVENANCE_QUARANTINED"
  | "MISSING_RUN_REFERENCE"
  | "RATING_NOT_PUBLISHED"
  | "RATING_NOT_EFFECTIVE"
  | "RATING_INVALID_SLOPE"
  | "RATING_MISSING_EVIDENCE"

export type EligibilityIssue = Readonly<{
  recordId: string
  code: EligibilityIssueCode
}> 

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isCanonicalPlayerId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value)
}

export function isValidKwtFingerprint(value: string): boolean {
  const parts = value.split("|")
  return parts.length === 5 && parts[0] === "KWT" && parts.slice(1).every((part) => part.trim().length > 0)
}

export function isActiveCalculationRun(run: HandicapCalculationRunEligibility | undefined): boolean {
  return Boolean(
    run
      && run.status === "COMPLETED"
      && run.publicationEligibility === "ELIGIBLE"
      && !run.quarantined
      && !run.supersededByRunId,
  )
}

export function selectEligiblePersonalProvenance(input: {
  records: readonly HandicapProvenanceRecord[]
  runs: readonly HandicapCalculationRunEligibility[]
}): { records: readonly HandicapProvenanceRecord[]; issues: readonly EligibilityIssue[] } {
  const runs = new Map(input.runs.map((run) => [run.id, run]))
  const eligible: HandicapProvenanceRecord[] = []
  const issues: EligibilityIssue[] = []

  for (const record of input.records) {
    if (record.sourceType === "THE_WEEKLY") {
      issues.push({ recordId: record.id, code: "EXTERNAL_SOURCE_NOT_PERSONAL" })
      continue
    }
    if (record.sourceType !== "KWT" && record.sourceType !== "APPROVED_PERSONAL") continue
    if (record.personalHandicapEligible === false) {
      issues.push({ recordId: record.id, code: "EXTERNAL_SOURCE_NOT_PERSONAL" })
      continue
    }
    if (!isCanonicalPlayerId(record.canonicalPlayerId)) {
      issues.push({ recordId: record.id, code: "MISSING_CANONICAL_PLAYER" })
      continue
    }
    if (!record.originalPlayerName?.trim()) {
      issues.push({ recordId: record.id, code: "MISSING_SOURCE_PLAYER" })
      continue
    }
    if (record.sourceType === "KWT" && !isValidKwtFingerprint(record.sourceFingerprint)) {
      issues.push({ recordId: record.id, code: "MALFORMED_KWT_FINGERPRINT" })
      continue
    }
    if (record.quarantined) {
      issues.push({ recordId: record.id, code: "PROVENANCE_QUARANTINED" })
      continue
    }
    if (!record.calculationRunId) {
      issues.push({ recordId: record.id, code: "MISSING_RUN_REFERENCE" })
      continue
    }
    const run = runs.get(record.calculationRunId)
    if (!run || run.status !== "COMPLETED") {
      issues.push({ recordId: record.id, code: "RUN_NOT_ACTIVE" })
      continue
    }
    if (run.quarantined) {
      issues.push({ recordId: record.id, code: "RUN_QUARANTINED" })
      continue
    }
    if (run.supersededByRunId) {
      issues.push({ recordId: record.id, code: "RUN_SUPERSEDED" })
      continue
    }
    if (run.publicationEligibility !== "ELIGIBLE") {
      issues.push({ recordId: record.id, code: "RUN_NOT_ELIGIBLE" })
      continue
    }
    eligible.push(record)
  }

  return { records: eligible, issues }
}

export function selectPublishedRatingSnapshots(input: {
  snapshots: readonly HandicapPublishedRatingRecord[]
  runs: readonly HandicapCalculationRunEligibility[]
}): { snapshots: readonly HandicapPublishedRatingRecord[]; issues: readonly EligibilityIssue[] } {
  const runs = new Map(input.runs.map((run) => [run.id, run]))
  const snapshots: HandicapPublishedRatingRecord[] = []
  const issues: EligibilityIssue[] = []

  for (const snapshot of input.snapshots) {
    const run = runs.get(snapshot.calculationRunId)
    if (!isActiveCalculationRun(run)) {
      issues.push({
        recordId: snapshot.id,
        code: !run || run.status !== "COMPLETED"
          ? "RUN_NOT_ACTIVE"
          : run.quarantined
            ? "RUN_QUARANTINED"
            : run.supersededByRunId
              ? "RUN_SUPERSEDED"
              : run.publicationEligibility !== "ELIGIBLE"
                ? "RUN_NOT_ELIGIBLE"
                : "RUN_NOT_ACTIVE",
      })
      continue
    }
    if (snapshot.publicationStatus !== "PUBLISHED") {
      issues.push({ recordId: snapshot.id, code: "RATING_NOT_PUBLISHED" })
      continue
    }
    if (!snapshot.effectiveFrom || Number.isNaN(Date.parse(snapshot.effectiveFrom))) {
      issues.push({ recordId: snapshot.id, code: "RATING_NOT_EFFECTIVE" })
      continue
    }
    if (snapshot.slope === null || !Number.isFinite(snapshot.slope) || snapshot.slope <= 0.01) {
      issues.push({ recordId: snapshot.id, code: "RATING_INVALID_SLOPE" })
      continue
    }
    if (snapshot.sourceEvidenceRefs.length === 0) {
      issues.push({ recordId: snapshot.id, code: "RATING_MISSING_EVIDENCE" })
      continue
    }
    snapshots.push(snapshot)
  }

  return { snapshots, issues }
}
