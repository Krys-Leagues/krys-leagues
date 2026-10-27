import { createHash } from "node:crypto"
import type { RatingSnapshotBlocker, RatingSnapshotManifestRow, RatingSnapshotPackage } from "./ratingSnapshotPackage.ts"

export type DatabaseRatingConfidence = "ready" | "provisional" | "needs_data" | "needs_review"

export type RatingSnapshotImportRow = Readonly<{
  id: string
  calculation_run_id: string
  course_id: string
  difficulty: "easy" | "hard"
  course_rating: number
  slope: number
  sample_size: number
  distinct_canonical_player_count: number
  rating_confidence: DatabaseRatingConfidence
  model_version: string
  effective_from: null
  effective_period: string
  source_evidence_refs: readonly string[]
  publication_status: "UNPUBLISHED"
  review_scope: RatingSnapshotManifestRow["scope"]
  statistical_eligibility: RatingSnapshotManifestRow["statisticalEligibility"]
  import_eligible: boolean
  publication_eligible: boolean
  publication_blockers: readonly RatingSnapshotBlocker[]
  source_contribution: Readonly<{ KWT: number; THE_WEEKLY: number }>
  maximum_player_share: number
  quarantined_evidence_count: number
}>

export type RatingSnapshotImportPackage = Readonly<{
  schemaVersion: "phase61-rating-snapshot-import-v1"
  packageRef: "phase61-local-rating-snapshot-import-v1"
  calculationRun: Readonly<{
    id: string
    label: string
    policyVersion: string
    modelVersion: string
    sourcePackageRef: string
    chronologyPolicy: string
    status: "DRAFT"
  }>
  effectiveFrom: null
  importEligibleDraftCount: number
  statisticallyEligibleCount: number
  provisionalDraftCount: number
  publicationEligibleCount: number
  ratingSnapshots: readonly RatingSnapshotImportRow[]
  stopConditions: readonly string[]
}>

function uuidFromText(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const normalized = hex.join("")
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`
}

function databaseConfidence(value: RatingSnapshotManifestRow["ratingConfidence"]): DatabaseRatingConfidence {
  switch (value) {
    case "POTENTIALLY_READY": return "ready"
    case "PROVISIONAL": return "provisional"
    case "NEEDS_REVIEW": return "needs_review"
    case "UNRATED": return "needs_data"
  }
}

export function deterministicCalculationRunId(packageResult: RatingSnapshotPackage): string {
  return uuidFromText(`calculation-run:${packageResult.calculationRunId}:${packageResult.policyVersion}:${packageResult.effectivePeriod}`)
}

export function buildRatingSnapshotImportPackage(packageResult: RatingSnapshotPackage): RatingSnapshotImportPackage {
  const calculationRunId = deterministicCalculationRunId(packageResult)
  const ratingSnapshots = packageResult.snapshots
    .filter((snapshot) => snapshot.importEligible && snapshot.courseRating !== null && snapshot.slope !== null)
    .map((snapshot) => ({
      id: uuidFromText(`rating-snapshot:${calculationRunId}:${snapshot.scope}:${snapshot.courseId}:${snapshot.difficulty}:${snapshot.modelVersion}`),
      calculation_run_id: calculationRunId,
      course_id: snapshot.courseId,
      difficulty: snapshot.difficulty,
      course_rating: snapshot.courseRating!,
      slope: snapshot.slope!,
      sample_size: snapshot.sampleSize,
      distinct_canonical_player_count: snapshot.distinctVerifiedSourcePlayers,
      rating_confidence: databaseConfidence(snapshot.ratingConfidence),
      model_version: snapshot.modelVersion,
      effective_from: null,
      effective_period: snapshot.effectivePeriod,
      source_evidence_refs: snapshot.sourceEvidenceFingerprints,
      publication_status: "UNPUBLISHED" as const,
      review_scope: snapshot.scope,
      statistical_eligibility: snapshot.statisticalEligibility,
      import_eligible: snapshot.importEligible,
      publication_eligible: snapshot.publicationEligible,
      publication_blockers: snapshot.publicationBlockers,
      source_contribution: snapshot.sourceContribution,
      maximum_player_share: snapshot.maximumPlayerShare,
      quarantined_evidence_count: snapshot.quarantinedEvidenceCount,
    }))
  const statisticallyEligibleCount = ratingSnapshots.filter((row) => row.statistical_eligibility === "ELIGIBLE").length
  const provisionalDraftCount = ratingSnapshots.filter((row) => row.statistical_eligibility === "PROVISIONAL").length
  return Object.freeze({
    schemaVersion: "phase61-rating-snapshot-import-v1",
    packageRef: "phase61-local-rating-snapshot-import-v1",
    calculationRun: {
      id: calculationRunId,
      label: packageResult.calculationRunId,
      policyVersion: packageResult.policyVersion,
      modelVersion: packageResult.ratingModelVersion,
      sourcePackageRef: "phase60-local-reviewed-evidence-v1",
      chronologyPolicy: "course-rating evidence only; no player-index snapshots",
      status: "DRAFT" as const,
    },
    effectiveFrom: null,
    importEligibleDraftCount: ratingSnapshots.length,
    statisticallyEligibleCount,
    provisionalDraftCount,
    publicationEligibleCount: ratingSnapshots.filter((row) => row.publication_eligible).length,
    ratingSnapshots: Object.freeze(ratingSnapshots),
    stopConditions: Object.freeze([
      "Stop if the live six-table schema differs from the Phase 59 preflight.",
      "Stop if the calculation run UUID or any snapshot UUID already exists with different payload.",
      "Stop if any source fingerprint is missing or conflicts with existing provenance.",
      "Stop before inserting any player-index snapshot or changing legacy Handicap tables.",
      "Stop before publication: these rows remain UNPUBLISHED and require review plus an approved activation date.",
    ]),
  })
}

export { uuidFromText }
