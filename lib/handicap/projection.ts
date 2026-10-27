import { buildHandicapIndexes, type HandicapDifferential, type HandicapIndex } from "./engine.ts"
import type { CanonicalPlayer } from "./identityResolver.ts"
import {
  distributionStandardScore,
  slopeNormalizedDifferential,
} from "./modelResearch.ts"
import { summarizeCurrentRating, type CurrentRatingSummary } from "./ratingModel.ts"
import type { HandicapDifficulty } from "./courseKeyResolver.ts"

export type ProjectionModel = "current" | "candidate-a" | "candidate-b"
export type ProjectionSourceType = "KWT" | "APPROVED_PERSONAL" | "THE_WEEKLY" | "OTHER"

export type ProjectionRoundInput = {
  sourceId: string
  sourceFingerprint: string | null
  historicalPlayerName: string
  canonicalPlayerId?: string | null
  playedAt: string
  score: number
  courseCode: string | null
  difficulty: string | null
  totalScore?: number | null
  sourceType?: ProjectionSourceType
  personalHandicapEligible?: boolean
}

export type ApprovedCourseCode = {
  code: string
  courseId: string
  baseMap: string
  difficulty: HandicapDifficulty
}

export type ProjectionPolicy = {
  ratingVersionId: string
  effectiveFrom: string
  modelVersions: Record<ProjectionModel, string>
  minimumProvisionalSample: number
  minimumReadySample: number
  minimumDistinctPlayers: number
  maximumPlayerShare: number
  eliteShare: number
  referenceSlope: number
  nearZeroSlope: number
  /** Active rolling window under the approved Phase 126 policy. */
  activeRoundLimit?: number
  /** @deprecated Use activeRoundLimit; retained for historical package compatibility. */
  latestRoundLimit: number
  /** @deprecated Best-round selection is no longer used. */
  bestRoundLimit: number
  minimumIndexRounds: number
  allowProvisionalRatings: boolean
  scoreBounds: { minExclusive: number; maxExclusive: number }
  outlier: {
    mode: "retain" | "quarantine"
    maximumAbsoluteScore?: number
  }
}

export const PHASE38_SIMULATION_POLICY: ProjectionPolicy = {
  ratingVersionId: "local-phase38-simulation-rating-v1",
  effectiveFrom: "2026-10-18",
  modelVersions: {
    current: "current-differential-v1",
    "candidate-a": "slope-normalized-v1",
    "candidate-b": "distribution-standard-score-v1",
  },
  minimumProvisionalSample: 20,
  minimumReadySample: 50,
  minimumDistinctPlayers: 20,
  maximumPlayerShare: 0.1,
  eliteShare: 0.12,
  referenceSlope: 8.515,
  nearZeroSlope: 0.01,
  activeRoundLimit: 20,
  latestRoundLimit: 20,
  bestRoundLimit: 0,
  minimumIndexRounds: 1,
  allowProvisionalRatings: true,
  scoreBounds: { minExclusive: -60, maxExclusive: 200 },
  outlier: { mode: "retain" },
}

export type ProjectionReasonCode =
  | "ACCEPTED_LOGICAL_ROUND"
  | "DUPLICATE_SOURCE_FINGERPRINT"
  | "SOURCE_FINGERPRINT_CONFLICT"
  | "MISSING_SOURCE_FINGERPRINT"
  | "INVALID_CANONICAL_PLAYER"
  | "MISSING_CANONICAL_PLAYER"
  | "UNKNOWN_COURSE_CODE"
  | "COURSE_DIFFICULTY_MISMATCH"
  | "INVALID_DIFFICULTY"
  | "INVALID_PLAYED_AT"
  | "INVALID_SCORE"
  | "OUTLIER_SCORE"
  | "MISSING_RATING"
  | "RATING_NEEDS_REVIEW"
  | "INVALID_SLOPE"
  | "INVALID_STANDARD_DEVIATION"
  | "PERSONAL_HANDICAP_SOURCE_EXCLUDED"

export type ProjectionDisposition<T> = {
  record: T
  reasonCode: ProjectionReasonCode
  reasonDetail?: string
}

export type ResolvedProjectionRound = Omit<ProjectionRoundInput, "sourceFingerprint" | "canonicalPlayerId" | "difficulty"> & {
  sourceFingerprint: string
  canonicalPlayerId: string
  canonicalScreenName: string
  courseId: string
  baseMap: string
  difficulty: HandicapDifficulty
}

export type ProjectionRating = {
  courseId: string
  baseMap: string
  difficulty: HandicapDifficulty
  roundCount: number
  distinctPlayerCount: number
  maximumPlayerShare: number
  ratingStatus: "ready" | "provisional" | "needs_data" | "needs_review"
  reviewReasons: readonly string[]
  summary: CurrentRatingSummary
}

export type ProjectionVersion = {
  ratingVersionId: string
  modelVersion: string
  effectiveFrom: string
}

export type LocalProjectionResult = {
  accepted: readonly ProjectionDisposition<ResolvedProjectionRound>[]
  excluded: readonly ProjectionDisposition<ProjectionRoundInput>[]
  quarantined: readonly ProjectionDisposition<ProjectionRoundInput>[]
  ratingExcluded: readonly ProjectionDisposition<ResolvedProjectionRound>[]
  ratings: readonly ProjectionRating[]
  differentials: Readonly<Record<ProjectionModel, readonly HandicapDifferential[]>>
  indexes: Readonly<Record<ProjectionModel, readonly HandicapIndex[]>>
  versions: readonly ProjectionVersion[]
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase()
}

function normalizeDifficulty(value: string | null): HandicapDifficulty | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized === "easy" || normalized === "hard" ? normalized : undefined
}

function sameRoundPayload(left: ProjectionRoundInput, right: ProjectionRoundInput): boolean {
  return left.canonicalPlayerId === right.canonicalPlayerId
    && left.historicalPlayerName === right.historicalPlayerName
    && left.playedAt === right.playedAt
    && left.score === right.score
    && left.courseCode === right.courseCode
    && left.difficulty === right.difficulty
    && left.totalScore === right.totalScore
}

function dispositionKey(record: ProjectionRoundInput): string {
  return `${record.sourceId}\u0000${record.sourceFingerprint ?? ""}`
}

function ratingKey(courseId: string, difficulty: HandicapDifficulty): string {
  return `${courseId}\u0000${difficulty}`
}

function roundMaximumPlayerShare(rounds: readonly ResolvedProjectionRound[]): number {
  if (!rounds.length) return 0
  const counts = new Map<string, number>()
  for (const round of rounds) counts.set(round.canonicalPlayerId, (counts.get(round.canonicalPlayerId) ?? 0) + 1)
  return Math.max(...counts.values()) / rounds.length
}

function chooseLogicalRounds(
  rounds: readonly ProjectionRoundInput[],
): {
  logical: readonly ProjectionRoundInput[]
  excluded: readonly ProjectionDisposition<ProjectionRoundInput>[]
  quarantined: readonly ProjectionDisposition<ProjectionRoundInput>[]
} {
  const byFingerprint = new Map<string, ProjectionRoundInput[]>()
  const excluded: ProjectionDisposition<ProjectionRoundInput>[] = []
  const quarantined: ProjectionDisposition<ProjectionRoundInput>[] = []

  for (const round of rounds) {
    if (!round.sourceFingerprint?.trim()) {
      quarantined.push({ record: round, reasonCode: "MISSING_SOURCE_FINGERPRINT" })
      continue
    }
    const fingerprint = round.sourceFingerprint.trim()
    const group = byFingerprint.get(fingerprint) ?? []
    group.push(round)
    byFingerprint.set(fingerprint, group)
  }

  const logical: ProjectionRoundInput[] = []
  for (const [fingerprint, group] of [...byFingerprint.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (group.length === 1) {
      logical.push(group[0])
      continue
    }
    if (!group.every((round) => sameRoundPayload(round, group[0]))) {
      for (const record of group) {
        quarantined.push({
          record,
          reasonCode: "SOURCE_FINGERPRINT_CONFLICT",
          reasonDetail: `conflicting physical rows share ${fingerprint}`,
        })
      }
      continue
    }
    const ordered = group.slice().sort((left, right) => dispositionKey(left).localeCompare(dispositionKey(right)))
    logical.push(ordered[0])
    for (const duplicate of ordered.slice(1)) {
      excluded.push({
        record: duplicate,
        reasonCode: "DUPLICATE_SOURCE_FINGERPRINT",
        reasonDetail: `same source fingerprint as ${ordered[0].sourceId}`,
      })
    }
  }
  return { logical, excluded, quarantined }
}

function makeResolvedRound(
  round: ProjectionRoundInput,
  players: ReadonlyMap<string, CanonicalPlayer>,
  courses: ReadonlyMap<string, ApprovedCourseCode>,
  policy: ProjectionPolicy,
): { resolved?: ResolvedProjectionRound; issue?: ProjectionDisposition<ProjectionRoundInput> } {
  const sourceFingerprint = round.sourceFingerprint?.trim()
  if (!sourceFingerprint) return { issue: { record: round, reasonCode: "MISSING_SOURCE_FINGERPRINT" } }
  if (!round.canonicalPlayerId) {
    return { issue: { record: round, reasonCode: "MISSING_CANONICAL_PLAYER" } }
  }
  const player = players.get(round.canonicalPlayerId)
  if (!player) {
    return { issue: { record: round, reasonCode: "INVALID_CANONICAL_PLAYER" } }
  }
  const difficulty = normalizeDifficulty(round.difficulty)
  if (!difficulty) return { issue: { record: round, reasonCode: "INVALID_DIFFICULTY" } }
  if (!isValidDate(round.playedAt)) return { issue: { record: round, reasonCode: "INVALID_PLAYED_AT" } }
  if (!Number.isFinite(round.score)
    || round.score <= policy.scoreBounds.minExclusive
    || round.score >= policy.scoreBounds.maxExclusive) {
    return { issue: { record: round, reasonCode: "INVALID_SCORE" } }
  }
  if (policy.outlier.mode === "quarantine"
    && policy.outlier.maximumAbsoluteScore !== undefined
    && Math.abs(round.score) > policy.outlier.maximumAbsoluteScore) {
    return { issue: { record: round, reasonCode: "OUTLIER_SCORE" } }
  }
  if (!round.courseCode?.trim()) return { issue: { record: round, reasonCode: "UNKNOWN_COURSE_CODE" } }
  const course = courses.get(normalizeCode(round.courseCode))
  if (!course) return { issue: { record: round, reasonCode: "UNKNOWN_COURSE_CODE" } }
  if (course.difficulty !== difficulty) {
    return { issue: { record: round, reasonCode: "COURSE_DIFFICULTY_MISMATCH" } }
  }
  return {
    resolved: {
      ...round,
      sourceFingerprint,
      canonicalPlayerId: player.id,
      canonicalScreenName: player.screenName,
      courseId: course.courseId,
      baseMap: course.baseMap,
      difficulty,
    },
  }
}

function summarizeRatings(
  rounds: readonly ResolvedProjectionRound[],
  policy: ProjectionPolicy,
): readonly ProjectionRating[] {
  const groups = new Map<string, ResolvedProjectionRound[]>()
  for (const round of rounds) {
    const key = ratingKey(round.courseId, round.difficulty)
    const group = groups.get(key) ?? []
    group.push(round)
    groups.set(key, group)
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => {
    const first = group[0]
    const summary = summarizeCurrentRating(group.map((round) => round.score), {
      eliteShare: policy.eliteShare,
      minimumReadySample: policy.minimumReadySample,
      minimumProvisionalSample: policy.minimumProvisionalSample,
    })
    const distinctPlayerCount = new Set(group.map((round) => round.canonicalPlayerId)).size
    const maximumPlayerShare = roundMaximumPlayerShare(group)
    const reviewReasons: string[] = []
    if (summary.ratingStatus === "ready" && distinctPlayerCount < policy.minimumDistinctPlayers) {
      reviewReasons.push("INSUFFICIENT_DISTINCT_PLAYERS")
    }
    if (maximumPlayerShare > policy.maximumPlayerShare) reviewReasons.push("PLAYER_CONCENTRATION")
    if (summary.slopeRating === null || summary.slopeRating <= policy.nearZeroSlope) {
      reviewReasons.push("NEAR_ZERO_OR_INVALID_SLOPE")
    }
    const ratingStatus = reviewReasons.length
      ? "needs_review"
      : summary.ratingStatus
    return {
      courseId: first.courseId,
      baseMap: first.baseMap,
      difficulty: first.difficulty,
      roundCount: group.length,
      distinctPlayerCount,
      maximumPlayerShare,
      ratingStatus,
      reviewReasons,
      summary,
    }
  })
}

function eligibleRating(
  rating: ProjectionRating | undefined,
  policy: ProjectionPolicy,
): boolean {
  if (!rating || rating.ratingStatus === "needs_data" || rating.ratingStatus === "needs_review") return false
  return rating.ratingStatus === "ready" || policy.allowProvisionalRatings
}

function buildModelDifferentials(
  model: ProjectionModel,
  rounds: readonly ResolvedProjectionRound[],
  ratings: ReadonlyMap<string, ProjectionRating>,
  policy: ProjectionPolicy,
): {
  differentials: readonly HandicapDifferential[]
  issues: readonly ProjectionDisposition<ResolvedProjectionRound>[]
} {
  const differentials: HandicapDifferential[] = []
  const issues: ProjectionDisposition<ResolvedProjectionRound>[] = []
  for (const round of rounds) {
    const rating = ratings.get(ratingKey(round.courseId, round.difficulty))
    if (!rating || !eligibleRating(rating, policy) || rating.summary.courseRating === null) {
      issues.push({ record: round, reasonCode: rating?.ratingStatus === "needs_review" ? "RATING_NEEDS_REVIEW" : "MISSING_RATING" })
      continue
    }
    const courseRating = rating.summary.courseRating
    const slopeRating = rating.summary.slopeRating
    const fieldAverage = rating.summary.fieldAverage
    const standardDeviation = rating.summary.confidence.standardDeviation
    let differential: number | null
    if (model === "current") {
      differential = round.score - courseRating
    } else if (model === "candidate-a") {
      if (slopeRating === null || slopeRating <= policy.nearZeroSlope || policy.referenceSlope <= 0) {
        issues.push({ record: round, reasonCode: "INVALID_SLOPE" })
        continue
      }
      differential = slopeNormalizedDifferential(round.score, {
        courseRating,
        slopeRating,
        fieldAverage: fieldAverage ?? 0,
        fieldStandardDeviation: standardDeviation ?? 0,
      }, policy.referenceSlope)
    } else {
      if (fieldAverage === null || standardDeviation === null || standardDeviation <= policy.nearZeroSlope) {
        issues.push({ record: round, reasonCode: "INVALID_STANDARD_DEVIATION" })
        continue
      }
      differential = distributionStandardScore(round.score, {
        courseRating,
        slopeRating: slopeRating ?? 0,
        fieldAverage,
        fieldStandardDeviation: standardDeviation,
      })
    }
    if (differential === null || !Number.isFinite(differential)) {
      issues.push({ record: round, reasonCode: model === "candidate-a" ? "INVALID_SLOPE" : "MISSING_RATING" })
      continue
    }
    differentials.push({
      sourceKey: round.sourceFingerprint,
      playerId: round.canonicalPlayerId,
      playedAt: round.playedAt,
      score: round.score,
      courseKey: round.courseId,
      ratingVersionId: policy.ratingVersionId,
      courseRating,
      slopeRating,
      differential: Math.round(differential * 100) / 100,
      eligible: round.sourceType !== "THE_WEEKLY" && round.personalHandicapEligible !== false,
    })
  }
  return { differentials, issues }
}

export function buildLocalHandicapProjection(
  rounds: readonly ProjectionRoundInput[],
  players: readonly CanonicalPlayer[],
  approvedCourses: readonly ApprovedCourseCode[],
  policy: ProjectionPolicy,
): LocalProjectionResult {
  const playerMap = new Map(players.map((player) => [player.id, player]))
  const courseMap = new Map(approvedCourses.map((course) => [normalizeCode(course.code), course]))
  const logical = chooseLogicalRounds(rounds)
  const excluded = [...logical.excluded]
  const quarantined = [...logical.quarantined]
  const resolved: ResolvedProjectionRound[] = []

  for (const round of logical.logical) {
    const result = makeResolvedRound(round, playerMap, courseMap, policy)
    if (result.issue) quarantined.push(result.issue)
    else if (result.resolved) resolved.push(result.resolved)
  }

  const accepted = resolved.map((record) => ({ record, reasonCode: "ACCEPTED_LOGICAL_ROUND" as const }))
  const ratings = summarizeRatings(resolved, policy)
  const ratingMap = new Map(ratings.map((rating) => [ratingKey(rating.courseId, rating.difficulty), rating]))
  const models: readonly ProjectionModel[] = ["current", "candidate-a", "candidate-b"]
  const modelResults = models.map((model) => [model, buildModelDifferentials(model, resolved, ratingMap, policy)] as const)
  const ratingExcluded = [...new Map(
    modelResults.flatMap(([, result]) => result.issues.map((issue) => [
      `${issue.record.sourceFingerprint}\u0000${issue.reasonCode}`,
      issue,
    ] as const)),
  ).values()]
  const differentials = Object.fromEntries(modelResults.map(([model, result]) => [model, result.differentials])) as Record<ProjectionModel, readonly HandicapDifferential[]>
  const indexes = Object.fromEntries(models.map((model) => {
    // Weekly evidence is valid course-rating evidence, but is never eligible
    // for a Krys Leagues player's personal handicap history.
    const personalRounds = differentials[model].filter((round) => round.eligible !== false)
    const indexBuild = buildHandicapIndexes(personalRounds, {
      activeRoundLimit: policy.activeRoundLimit ?? policy.latestRoundLimit,
      bestRoundLimit: policy.bestRoundLimit,
      minimumRounds: policy.minimumIndexRounds,
    })
    return [model, indexBuild.indexes]
  })) as Record<ProjectionModel, readonly HandicapIndex[]>

  return {
    accepted,
    excluded,
    quarantined,
    ratingExcluded,
    ratings,
    differentials,
    indexes,
    versions: models.map((model) => ({
      ratingVersionId: policy.ratingVersionId,
      modelVersion: policy.modelVersions[model],
      effectiveFrom: policy.effectiveFrom,
    })),
  }
}
