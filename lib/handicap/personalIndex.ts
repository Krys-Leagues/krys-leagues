import {
  APPROVED_HANDICAP_POLICY,
  buildDifferentials,
  buildHandicapIndexes,
  type ChronologyPublicationPolicy,
  type HandicapDifferential,
  type HandicapIndex,
  type HandicapIssue,
  type HandicapRoundInput,
} from "./engine.ts"
import {
  reviewLatestTen,
  resolveHistoricalOrdering,
  type ChronologyConfidence,
  type HistoricalTimeEvidence,
  type LatestTenReview,
} from "./dateProvenance.ts"
import { createIndexSnapshotFromEngine, type IndexSnapshot } from "./snapshots.ts"
import { uuidFromText } from "./ratingSnapshotImport.ts"

/**
 * A personal-index input with chronology kept separate from playedAt.
 * Import timestamps must never be supplied as playedAt.
 */
export type PersonalIndexRoundInput = Omit<HandicapRoundInput, "playedAt" | "chronologyConfidence" | "chronologyOrder"> & {
  chronology: HistoricalTimeEvidence
  ratingSnapshotId: string
}

export type PersonalIndexIssue = HandicapIssue | {
  sourceKey: string
  code: "MISSING_RATING_SNAPSHOT_REFERENCE"
}

export type PersonalIndexResult = {
  differentials: readonly HandicapDifferential[]
  indexes: readonly HandicapIndex[]
  snapshotCandidates: readonly IndexSnapshot[]
  chronologyReviews: ReadonlyMap<string, LatestTenReview>
  issues: readonly PersonalIndexIssue[]
}

function chronologyConfidence(review: LatestTenReview): ChronologyConfidence {
  return review.confidence
}

function roundForEngine(
  round: PersonalIndexRoundInput,
  review: LatestTenReview,
): HandicapRoundInput {
  const ordering = resolveHistoricalOrdering(round.chronology)
  const exactPlayedAt = ordering.evidenceKind === "EXACT_TIMESTAMP"
    ? round.chronology.playedAt ?? null
    : null
  return {
    ...round,
    playedAt: exactPlayedAt,
    chronologyOrder: ordering.orderingKey,
    chronologyConfidence: chronologyConfidence(review),
  }
}

function reviewByPlayer(
  rounds: readonly PersonalIndexRoundInput[],
): ReadonlyMap<string, LatestTenReview> {
  const byPlayer = new Map<string, PersonalIndexRoundInput[]>()
  for (const round of rounds) {
    if (round.sourceType === "THE_WEEKLY" || round.personalHandicapEligible === false) continue
    const group = byPlayer.get(round.playerId) ?? []
    group.push(round)
    byPlayer.set(round.playerId, group)
  }
  return new Map([...byPlayer.entries()].map(([playerId, group]) => [
    playerId,
    reviewLatestTen(group.map((round) => round.chronology), APPROVED_HANDICAP_POLICY.activeRoundLimit),
  ]))
}

function selectedRatingSnapshotIds(
  index: HandicapIndex,
  sourceToRating: ReadonlyMap<string, string>,
): readonly string[] {
  return [...new Set(index.selectedSourceKeys
    .map((sourceKey) => sourceToRating.get(sourceKey))
    .filter((value): value is string => Boolean(value)))].sort()
}

/**
 * Builds deterministic local index candidates. The approved policy uses the
 * 20 most recent qualifying rounds and averages every differential in that
 * active window. Every result is explicitly unpublished; publication gates
 * remain separate from provisional/official eligibility.
 */
export function buildPersonalIndexCandidates(
  rounds: readonly PersonalIndexRoundInput[],
  options: {
    calculationRunId: string
    differentialModelVersion?: string
    snapshotIdPrefix?: string
    /** Defaults to EXACT_ONLY; no local candidate is publishable implicitly. */
    chronologyPublicationPolicy?: ChronologyPublicationPolicy
  },
): PersonalIndexResult {
  const reviews = reviewByPlayer(rounds)
  const issues: PersonalIndexIssue[] = []
  const sourceToRating = new Map<string, string>()
  const engineRounds: HandicapRoundInput[] = []

  for (const round of rounds) {
    if (!round.ratingSnapshotId.trim()) {
      issues.push({ sourceKey: round.sourceKey, code: "MISSING_RATING_SNAPSHOT_REFERENCE" })
      continue
    }
    sourceToRating.set(round.sourceKey, round.ratingSnapshotId)
    const review = reviews.get(round.playerId) ?? {
      confidence: "UNKNOWN" as const,
      selected: [],
      boundarySourceIds: [],
      reason: "no personal chronology evidence",
    }
    engineRounds.push(roundForEngine(round, review))
  }

  const differentialBuild = buildDifferentials(engineRounds, {
    model: APPROVED_HANDICAP_POLICY.model,
    modelVersion: APPROVED_HANDICAP_POLICY.modelVersion,
    referenceSlope: APPROVED_HANDICAP_POLICY.referenceSlope,
    nearZeroSlope: APPROVED_HANDICAP_POLICY.nearZeroSlope,
    requireExplicitSourceType: APPROVED_HANDICAP_POLICY.requireExplicitSourceType,
  })
  const indexBuild = buildHandicapIndexes(differentialBuild.differentials, {
    activeRoundLimit: APPROVED_HANDICAP_POLICY.activeRoundLimit,
    minimumRounds: APPROVED_HANDICAP_POLICY.minimumIndexRounds,
    officialIndexRounds: APPROVED_HANDICAP_POLICY.officialIndexRounds,
    chronologyPublicationPolicy: options.chronologyPublicationPolicy ?? "EXACT_ONLY",
  })
  const prefix = options.snapshotIdPrefix ?? "local-handicap-index"
  const modelVersion = options.differentialModelVersion ?? APPROVED_HANDICAP_POLICY.modelVersion
  const snapshotCandidates = indexBuild.indexes
    .filter((index) => index.index !== null)
    .map((index) => createIndexSnapshotFromEngine(index, differentialBuild.differentials, {
      snapshotId: uuidFromText(`${prefix}:${options.calculationRunId}:${index.playerId}:${modelVersion}:${(index.activeSourceKeys ?? index.latestSourceKeys).join("|")}`),
      calculationRunId: options.calculationRunId,
      ratingSnapshotIds: selectedRatingSnapshotIds(index, sourceToRating),
      differentialModelVersion: modelVersion,
      chronologyConfidence: index.chronologyConfidence,
    }))

  return {
    differentials: differentialBuild.differentials,
    indexes: indexBuild.indexes,
    snapshotCandidates,
    chronologyReviews: reviews,
    issues: [...issues, ...differentialBuild.issues],
  }
}
