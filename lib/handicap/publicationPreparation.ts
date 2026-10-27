import { uuidFromText } from "./ratingSnapshotImport.ts"

export type PublicationRatingRow = Readonly<{
  id: string
  calculationRunId: string
  courseId: string
  difficulty: "easy" | "hard"
  courseRating: number
  slope: number
  sampleSize: number
  distinctPlayers: number
  ratingConfidence: "ready"
  modelVersion: string
  effectiveFrom: null
  effectivePeriod: string
  sourceEvidenceRefs: readonly string[]
  publicationStatus: "UNPUBLISHED"
  reviewScope: "KWT_ONLY"
  recommendation: "APPROVE_PENDING_FORMAL_REVIEW" | "APPROVE_AFTER_DIAGNOSTIC_REVIEW"
}>

export type PublicationIndexRow = Readonly<{
  id: string
  calculationRunId: string
  canonicalPlayerId: string
  sourceRoundIds: readonly string[]
  ratingSnapshotIds: readonly string[]
  ratingVersionIds: readonly string[]
  differentialModelVersion: "krys-handicap-candidate-a-v1"
  latestTenSourceRoundIds: readonly string[]
  bestFiveSourceRoundIds: readonly string[]
  resultingIndex: number
  chronologyConfidence: "OFFICIAL_KWT_SEQUENCE"
  publicationStatus: "UNPUBLISHED"
}>

export type PublicationApprovalManifest = Readonly<{
  schemaVersion: "phase107-publication-approval-v1"
  sourceRunId: string
  approvalManifestSha256: string
  ratingManifestSha256: string
  diagnosticManifestSha256: string
  indexManifestSha256: string
  ratingApprovals: readonly Readonly<{
    snapshotId: string
    decision: "APPROVE"
    approvalRef: string
    diagnosticDisposition?: string
  }>[]
  diagnosticApprovals: readonly Readonly<{
    snapshotId: string
    decision: "APPROVE"
    disposition: string
    approvalRef: string
  }>[]
  indexApprovals: readonly Readonly<{
    snapshotId: string
    decision: "APPROVE"
    approvalRef: string
  }>[]
}>

export type PublicationPlan = Readonly<{
  publicationRunId: string
  sourceRunId: string
  run: Readonly<{
    policyVersion: "krys-handicap-approved-policy-v1"
    modelVersion: "krys-handicap-candidate-a-v1"
    status: "COMPLETED"
    publicationEligibility: "ELIGIBLE"
    chronologyPolicy: "OFFICIAL_KWT_SEQUENCE"
    metadata: Readonly<Record<string, unknown>>
  }>
  ratingSnapshots: readonly Readonly<{
    id: string
    sourceSnapshotId: string
    calculationRunId: string
    courseId: string
    difficulty: "easy" | "hard"
    courseRating: number
    slope: number
    sampleSize: number
    distinctPlayers: number
    ratingConfidence: "ready"
    modelVersion: string
    effectiveFrom: null
    effectivePeriod: string
    sourceEvidenceRefs: readonly string[]
    publicationStatus: "PUBLISHED"
    reviewScope: "KWT_ONLY"
  }>[]
  indexSnapshots: readonly Readonly<{
    id: string
    sourceSnapshotId: string
    calculationRunId: string
    canonicalPlayerId: string
    sourceRoundIds: readonly string[]
    ratingSnapshotIds: readonly string[]
    ratingVersionIds: readonly string[]
    differentialModelVersion: "krys-handicap-candidate-a-v1"
    latestTenSourceRoundIds: readonly string[]
    bestFiveSourceRoundIds: readonly string[]
    resultingIndex: number
    chronologyConfidence: "OFFICIAL_KWT_SEQUENCE"
    publicationStatus: "PUBLISHED"
  }>[]
}>

const SHA256 = /^[0-9a-f]{64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PERIOD = /^KWT S\d+W\d+ through S\d+W\d+; observed S\d+W\d+(, S\d+W\d+)*; OFFICIAL_KWT_SEQUENCE; calendar date unavailable$/

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function unique(values: readonly string[]): Set<string> {
  return new Set(values)
}

/**
 * Creates a new immutable publication lineage. It never changes the draft run
 * or any draft snapshot. A real approval manifest is mandatory; statistical
 * readiness alone is deliberately insufficient.
 */
export function buildPublicationPlan(input: Readonly<{
  sourceRunId: string
  ratingRows: readonly PublicationRatingRow[]
  indexRows: readonly PublicationIndexRow[]
  approval: PublicationApprovalManifest
  /**
   * Older candidate packages may carry Phase 98 rating ids while the source
   * run stores the deterministic Phase 104 ids. The caller must provide the
   * reviewed alias map; an unresolved rating reference is rejected below.
   */
  ratingSnapshotIdAliases?: Readonly<Record<string, string>>
}>): PublicationPlan {
  const { sourceRunId, ratingRows, indexRows, approval, ratingSnapshotIdAliases = {} } = input
  require(UUID.test(sourceRunId), "source calculation run must be a UUID")
  require(approval.schemaVersion === "phase107-publication-approval-v1", "unsupported approval manifest schema")
  require(approval.sourceRunId === sourceRunId, "approval manifest source run mismatch")
  for (const hash of [approval.approvalManifestSha256, approval.ratingManifestSha256, approval.diagnosticManifestSha256, approval.indexManifestSha256]) {
    require(SHA256.test(hash), "approval manifest hashes must be SHA-256 values")
  }

  require(ratingRows.length === 72, "exactly 72 approved rating candidates are required")
  require(indexRows.length === 157, "exactly 157 approved index candidates are required")
  require(unique(ratingRows.map((row) => row.id)).size === ratingRows.length, "duplicate rating snapshot candidate")
  require(unique(indexRows.map((row) => row.id)).size === indexRows.length, "duplicate index snapshot candidate")
  require(approval.ratingApprovals.length === ratingRows.length, "every rating requires explicit approval")
  require(approval.indexApprovals.length === indexRows.length, "every index requires explicit approval")

  const ratingIds = unique(ratingRows.map((row) => row.id))
  const indexIds = unique(indexRows.map((row) => row.id))
  const approvedRatingIds = unique(approval.ratingApprovals.map((row) => row.snapshotId))
  const approvedIndexIds = unique(approval.indexApprovals.map((row) => row.snapshotId))
  require(approvedRatingIds.size === 72 && [...ratingIds].every((id) => approvedRatingIds.has(id)), "rating approval coverage is incomplete")
  require(approvedIndexIds.size === 157 && [...indexIds].every((id) => approvedIndexIds.has(id)), "index approval coverage is incomplete")
  require(approval.ratingApprovals.every((row) => row.decision === "APPROVE" && row.approvalRef.trim()), "rating approval is not explicit")
  require(approval.indexApprovals.every((row) => row.decision === "APPROVE" && row.approvalRef.trim()), "index approval is not explicit")

  const ratingApprovalById = new Map(approval.ratingApprovals.map((row) => [row.snapshotId, row]))
  const diagnosticRows = ratingRows.filter((row) => row.recommendation === "APPROVE_AFTER_DIAGNOSTIC_REVIEW")
  const diagnosticApprovalById = new Map(approval.diagnosticApprovals.map((row) => [row.snapshotId, row]))
  require(approval.diagnosticApprovals.length === diagnosticRows.length, "diagnostic approval coverage is incomplete")
  require(diagnosticRows.every((row) => {
    const approvalRow = diagnosticApprovalById.get(row.id)
    return approvalRow?.decision === "APPROVE" && approvalRow.disposition.trim() && approvalRow.approvalRef.trim()
  }), "diagnostic approval is not explicit")
  const resolveRatingId = (id: string) => ratingSnapshotIdAliases[id] ?? id
  for (const row of ratingRows) {
    require(row.calculationRunId === sourceRunId, `rating ${row.id} does not belong to the source run`)
    require(row.publicationStatus === "UNPUBLISHED", `rating ${row.id} is not an unpublished candidate`)
    require(row.ratingConfidence === "ready", `rating ${row.id} is not statistically ready`)
    require(row.reviewScope === "KWT_ONLY", `rating ${row.id} is not KWT-only`)
    require(row.slope > 0.01 && Number.isFinite(row.slope), `rating ${row.id} has an invalid slope`)
    require(row.effectiveFrom === null && PERIOD.test(row.effectivePeriod), `rating ${row.id} has an invalid effective period`)
    require(row.sourceEvidenceRefs.length > 0 && row.sourceEvidenceRefs.every((ref) => ref.startsWith("KWT|")), `rating ${row.id} has non-KWT evidence`)
    if (row.recommendation === "APPROVE_AFTER_DIAGNOSTIC_REVIEW") {
      require(ratingApprovalById.get(row.id)?.diagnosticDisposition?.trim(), `diagnostic disposition missing for ${row.id}`)
    }
  }
  for (const row of indexRows) {
    require(row.calculationRunId === sourceRunId, `index ${row.id} does not belong to the source run`)
    require(row.publicationStatus === "UNPUBLISHED", `index ${row.id} is not an unpublished candidate`)
    require(UUID.test(row.canonicalPlayerId), `index ${row.id} has an invalid canonical player`)
    require(row.resultingIndex !== null && Number.isFinite(row.resultingIndex), `index ${row.id} has no resulting index`)
    require(row.chronologyConfidence === "OFFICIAL_KWT_SEQUENCE", `index ${row.id} has unsupported chronology`)
    require(row.sourceRoundIds.length > 0 && row.sourceRoundIds.every((ref) => ref.startsWith("KWT|")), `index ${row.id} has non-KWT evidence`)
    require(row.latestTenSourceRoundIds.length > 0 && row.latestTenSourceRoundIds.length <= 10, `index ${row.id} has invalid latest-ten selection`)
    require(row.bestFiveSourceRoundIds.length === 5, `index ${row.id} has invalid best-five selection`)
    require(row.ratingSnapshotIds.length === row.ratingVersionIds.length, `index ${row.id} has inconsistent rating references`)
    require(row.ratingSnapshotIds.every((id) => ratingIds.has(resolveRatingId(id))), `index ${row.id} references an unapproved rating snapshot`)
    require(row.ratingVersionIds.every((id) => ratingIds.has(resolveRatingId(id))), `index ${row.id} references an unapproved rating version`)
  }

  const publicationRunId = uuidFromText(`handicap-publication-run:${sourceRunId}:${approval.approvalManifestSha256}`)
  const publishedRatingIdBySourceId = new Map(
    ratingRows.map((row) => [
      row.id,
      uuidFromText(`handicap-published-rating:${publicationRunId}:${row.id}`),
    ]),
  )
  const metadata = Object.freeze({
    source_run_id: sourceRunId,
    source_scope: "KWT_ONLY",
    source_separation: "THE_WEEKLY excluded from personal indexes",
    policy_version: "krys-handicap-approved-policy-v1",
    differential_formula: "(score - course rating) * 8.515 / course slope",
    reference_slope: 8.515,
    allow_official_kwt_sequence_publication: true,
    rating_approval_manifest_sha256: approval.ratingManifestSha256,
    diagnostic_approval_manifest_sha256: approval.diagnosticManifestSha256,
    index_approval_manifest_sha256: approval.indexManifestSha256,
    separate_index_approval: true,
    effective_period_policy: "KWT_SEASON_WEEK_ONLY",
  })

  return Object.freeze({
    publicationRunId,
    sourceRunId,
    run: Object.freeze({
      policyVersion: "krys-handicap-approved-policy-v1" as const,
      modelVersion: "krys-handicap-candidate-a-v1" as const,
      status: "COMPLETED" as const,
      publicationEligibility: "ELIGIBLE" as const,
      chronologyPolicy: "OFFICIAL_KWT_SEQUENCE" as const,
      metadata,
    }),
    ratingSnapshots: Object.freeze(ratingRows.map((row) => Object.freeze({
      id: publishedRatingIdBySourceId.get(row.id)!,
      sourceSnapshotId: row.id,
      calculationRunId: publicationRunId,
      courseId: row.courseId,
      difficulty: row.difficulty,
      courseRating: row.courseRating,
      slope: row.slope,
      sampleSize: row.sampleSize,
      distinctPlayers: row.distinctPlayers,
      ratingConfidence: row.ratingConfidence,
      modelVersion: row.modelVersion,
      effectiveFrom: null,
      effectivePeriod: row.effectivePeriod,
      sourceEvidenceRefs: row.sourceEvidenceRefs,
      publicationStatus: "PUBLISHED" as const,
      reviewScope: "KWT_ONLY" as const,
    }))),
    indexSnapshots: Object.freeze(indexRows.map((row) => Object.freeze({
      id: uuidFromText(`handicap-published-index:${publicationRunId}:${row.id}`),
      sourceSnapshotId: row.id,
      calculationRunId: publicationRunId,
      canonicalPlayerId: row.canonicalPlayerId,
      sourceRoundIds: row.sourceRoundIds,
      // Published indexes must point at the immutable published rating
      // successors, never at the quarantined source-run rows. Version ids in
      // the Phase 104 package are the source rating snapshot ids; preserve
      // opaque version ids if a future package uses a separate version key.
      ratingSnapshotIds: row.ratingSnapshotIds.map((id) => publishedRatingIdBySourceId.get(resolveRatingId(id))!),
      ratingVersionIds: row.ratingVersionIds.map((id) => publishedRatingIdBySourceId.get(resolveRatingId(id))!),
      differentialModelVersion: row.differentialModelVersion,
      latestTenSourceRoundIds: row.latestTenSourceRoundIds,
      bestFiveSourceRoundIds: row.bestFiveSourceRoundIds,
      resultingIndex: row.resultingIndex,
      chronologyConfidence: row.chronologyConfidence,
      publicationStatus: "PUBLISHED" as const,
    }))),
  })
}
