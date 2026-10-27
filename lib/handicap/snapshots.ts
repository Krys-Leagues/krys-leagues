import type { HandicapIndex, HandicapDifferential } from "./engine.ts"
import type { ProjectionRating } from "./projection.ts"
import type { ChronologyConfidence } from "./dateProvenance.ts"

export type SnapshotPublicationStatus = "DRAFT" | "PROVISIONAL" | "UNPUBLISHED"

export type RatingSnapshot = Readonly<{
  snapshotId: string
  calculationRunId: string
  courseId: string
  difficulty: "easy" | "hard"
  courseRating: number | null
  slope: number | null
  sampleSize: number
  distinctCanonicalPlayerCount: number
  ratingConfidence: "ready" | "provisional" | "needs_data" | "needs_review"
  modelVersion: string
  effectiveFrom: string | null
  effectivePeriod: string | null
  sourceEvidenceRefs: readonly string[]
  publicationStatus: SnapshotPublicationStatus
}>

export type IndexSnapshot = Readonly<{
  snapshotId: string
  calculationRunId: string
  canonicalPlayerId: string
  sourceRoundIds: readonly string[]
  ratingSnapshotIds: readonly string[]
  ratingVersionIds: readonly string[]
  differentialModelVersion: string
  latestTenSourceRoundIds: readonly string[]
  bestFiveSourceRoundIds: readonly string[]
  /** New policy field; retained separately from legacy column names. */
  activeRoundSourceIds?: readonly string[]
  activeRoundCount?: number
  handicapStatus?: "NOT_YET_RATED" | "PROVISIONAL" | "OFFICIAL_ELIGIBLE"
  index: number | null
  chronologyConfidence: ChronologyConfidence
  publicationStatus: SnapshotPublicationStatus
}>

export type SnapshotLedger = Readonly<{
  ratingSnapshots: readonly RatingSnapshot[]
  indexSnapshots: readonly IndexSnapshot[]
}>

function freezeList<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function freezeObject<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value)
}

function validateId(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`)
}

export function createRatingSnapshot(input: Omit<RatingSnapshot, "publicationStatus"> & { publicationStatus?: SnapshotPublicationStatus }): RatingSnapshot {
  validateId(input.snapshotId, "snapshotId")
  validateId(input.calculationRunId, "calculationRunId")
  validateId(input.courseId, "courseId")
  validateId(input.modelVersion, "modelVersion")
  if (input.effectiveFrom !== null && Number.isNaN(Date.parse(input.effectiveFrom))) throw new Error("effectiveFrom must be a valid date or null")
  return freezeObject({
    ...input,
    sourceEvidenceRefs: freezeList(input.sourceEvidenceRefs),
    publicationStatus: input.publicationStatus ?? "UNPUBLISHED",
  })
}

export function createDraftRatingSnapshots(
  ratings: readonly ProjectionRating[],
  options: {
    calculationRunId: string
    modelVersion: string
    snapshotPrefix: string
    sourceEvidenceRefs: readonly string[]
    effectiveFrom?: string | null
    effectivePeriod?: string | null
  },
): readonly RatingSnapshot[] {
  validateId(options.calculationRunId, "calculationRunId")
  validateId(options.modelVersion, "modelVersion")
  validateId(options.snapshotPrefix, "snapshotPrefix")
  return ratings
    .filter((rating) => rating.roundCount > 0 && rating.ratingStatus !== "needs_data")
    .map((rating) => createRatingSnapshot({
      snapshotId: `${options.snapshotPrefix}:${rating.courseId}:${rating.difficulty}`,
      calculationRunId: options.calculationRunId,
      courseId: rating.courseId,
      difficulty: rating.difficulty,
      courseRating: rating.summary.courseRating,
      slope: rating.summary.slopeRating,
      sampleSize: rating.roundCount,
      distinctCanonicalPlayerCount: rating.distinctPlayerCount,
      ratingConfidence: rating.ratingStatus,
      modelVersion: options.modelVersion,
      effectiveFrom: options.effectiveFrom ?? null,
      effectivePeriod: options.effectivePeriod ?? null,
      sourceEvidenceRefs: options.sourceEvidenceRefs,
      publicationStatus: "UNPUBLISHED",
    }))
}

export function createIndexSnapshot(input: Omit<IndexSnapshot, "publicationStatus"> & { publicationStatus?: SnapshotPublicationStatus }): IndexSnapshot {
  validateId(input.snapshotId, "snapshotId")
  validateId(input.calculationRunId, "calculationRunId")
  validateId(input.canonicalPlayerId, "canonicalPlayerId")
  validateId(input.differentialModelVersion, "differentialModelVersion")
  const publicationStatus = input.chronologyConfidence === "EXACT"
    ? input.publicationStatus ?? "UNPUBLISHED"
    : "UNPUBLISHED"
  return freezeObject({
    ...input,
    sourceRoundIds: freezeList(input.sourceRoundIds),
    ratingSnapshotIds: freezeList(input.ratingSnapshotIds),
    ratingVersionIds: freezeList(input.ratingVersionIds),
    latestTenSourceRoundIds: freezeList(input.latestTenSourceRoundIds),
    bestFiveSourceRoundIds: freezeList(input.bestFiveSourceRoundIds),
    ...(input.activeRoundSourceIds ? { activeRoundSourceIds: freezeList(input.activeRoundSourceIds) } : {}),
    ...(input.activeRoundCount === undefined ? {} : { activeRoundCount: input.activeRoundCount }),
    ...(input.handicapStatus ? { handicapStatus: input.handicapStatus } : {}),
    publicationStatus,
  })
}

export function createIndexSnapshotFromEngine(
  index: HandicapIndex,
  differentials: readonly HandicapDifferential[],
  options: {
    snapshotId: string
    calculationRunId: string
    ratingSnapshotIds: readonly string[]
    differentialModelVersion: string
    chronologyConfidence: ChronologyConfidence
  },
): IndexSnapshot {
  const active = index.activeSourceKeys ?? index.latestSourceKeys
  return createIndexSnapshot({
    snapshotId: options.snapshotId,
    calculationRunId: options.calculationRunId,
    canonicalPlayerId: index.playerId,
    sourceRoundIds: active,
    ratingSnapshotIds: options.ratingSnapshotIds,
    ratingVersionIds: index.ratingVersionIds,
    differentialModelVersion: options.differentialModelVersion,
    latestTenSourceRoundIds: index.latestSourceKeys,
    // Legacy storage field retained for schema compatibility. New consumers
    // must use activeRoundSourceIds; there is no best-five selection anymore.
    bestFiveSourceRoundIds: [],
    activeRoundSourceIds: active,
    activeRoundCount: index.activeRoundCount ?? index.latestRoundCount,
    handicapStatus: index.handicapStatus,
    index: index.index,
    chronologyConfidence: options.chronologyConfidence,
    publicationStatus: "UNPUBLISHED",
  })
}

export function emptySnapshotLedger(): SnapshotLedger {
  return { ratingSnapshots: [], indexSnapshots: [] }
}

export function appendRatingSnapshot(ledger: SnapshotLedger, snapshot: RatingSnapshot): SnapshotLedger {
  if (ledger.ratingSnapshots.some((item) => item.snapshotId === snapshot.snapshotId)) throw new Error(`rating snapshot already exists: ${snapshot.snapshotId}`)
  return { ...ledger, ratingSnapshots: [...ledger.ratingSnapshots, snapshot] }
}

export function appendIndexSnapshot(ledger: SnapshotLedger, snapshot: IndexSnapshot): SnapshotLedger {
  if (ledger.indexSnapshots.some((item) => item.snapshotId === snapshot.snapshotId)) throw new Error(`index snapshot already exists: ${snapshot.snapshotId}`)
  return { ...ledger, indexSnapshots: [...ledger.indexSnapshots, snapshot] }
}

