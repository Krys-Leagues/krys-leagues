import { currentDifferential } from "./ratingModel.ts"
import { candidateDifferential } from "./ratingModel.ts"
import type { ChronologyConfidence } from "./dateProvenance.ts"

export type HandicapDifferentialModel = "legacy" | "candidate-a"

export type ChronologyPublicationPolicy =
  | "EXACT_ONLY"
  | "EXACT_OR_OFFICIAL_KWT_SEQUENCE"

export type HandicapCalculationOptions = Readonly<{
  model?: HandicapDifferentialModel
  referenceSlope?: number
  nearZeroSlope?: number
  modelVersion?: string
  requireExplicitSourceType?: boolean
  /** Active rolling window. The legacy latestRoundLimit name is accepted as an alias. */
  activeRoundLimit?: number
  latestRoundLimit?: number
  /** @deprecated Best-round selection is no longer part of the approved policy. */
  bestRoundLimit?: number
  minimumIndexRounds?: number
  officialIndexRounds?: number
  /** Opt-in only. Defaults to the existing exact-timestamp gate. */
  chronologyPublicationPolicy?: ChronologyPublicationPolicy
}>

/**
 * The approved launch policy. Historical/alternative models remain available
 * for comparison, but this is the only policy entry point for publication.
 */
export const APPROVED_HANDICAP_POLICY = Object.freeze({
  model: "candidate-a" as const,
  modelVersion: "krys-handicap-candidate-a-v1",
  referenceSlope: 8.515,
  nearZeroSlope: 0.01,
  activeRoundLimit: 20,
  minimumIndexRounds: 1,
  officialIndexRounds: 20,
  requireExplicitSourceType: true,
  chronologyPublicationPolicy: "EXACT_OR_OFFICIAL_KWT_SEQUENCE" as const,
})

export type HandicapSourceType = "KWT" | "APPROVED_PERSONAL" | "THE_WEEKLY" | "OTHER"

export type HandicapRoundInput = {
  sourceKey: string
  playerId: string
  /** Null is allowed only when an explicit non-exact chronology classification is supplied. */
  playedAt: string | null
  /** Stable source ordering key; never a fabricated play timestamp. */
  chronologyOrder?: string
  score: number
  courseKey: string
  ratingVersionId: string
  courseRating: number | null
  slopeRating: number | null
  eligible?: boolean
  sourceType?: HandicapSourceType
  personalHandicapEligible?: boolean
  chronologyConfidence?: ChronologyConfidence
}

export type HandicapDifferential = HandicapRoundInput & {
  differential: number
}

export type HandicapIssue = {
  sourceKey?: string
  code:
    | "DUPLICATE_SOURCE_KEY"
    | "MISSING_RATING"
    | "INVALID_SCORE"
    | "INELIGIBLE_ROUND"
    | "EXTERNAL_SOURCE_NOT_ELIGIBLE"
    | "INVALID_PLAYER_ID"
    | "INVALID_PLAYED_AT"
    | "INVALID_SLOPE"
    | "MISSING_PERSONAL_SOURCE_TYPE"
}

export type DifferentialBuild = {
  differentials: readonly HandicapDifferential[]
  issues: readonly HandicapIssue[]
}

export type HandicapIndex = {
  playerId: string
  index: number | null
  latestRoundCount: number
  selectedRoundCount: number
  selectedSourceKeys: readonly string[]
  latestSourceKeys: readonly string[]
  /** The active rolling window used by the current policy. */
  activeRoundCount?: number
  activeSourceKeys?: readonly string[]
  handicapStatus?: "NOT_YET_RATED" | "PROVISIONAL" | "OFFICIAL_ELIGIBLE"
  ratingVersionIds: readonly string[]
  chronologyConfidence: ChronologyConfidence
  publicationStatus: "PUBLISHED" | "UNPUBLISHED_CHRONOLOGY" | "UNPUBLISHED_APPROVAL" | "UNAVAILABLE"
}

export type HandicapIndexBuild = {
  indexes: readonly HandicapIndex[]
  issues: readonly HandicapIssue[]
}

const MIN_SCORE = -60
const MAX_SCORE = 200

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function chronologyKey(round: HandicapDifferential): string {
  if (round.chronologyOrder) return round.chronologyOrder
  if (round.playedAt) return `0:${new Date(round.playedAt).toISOString()}:${round.sourceKey}`
  return `9:${round.sourceKey}`
}

function chronologyRank(value: ChronologyConfidence | undefined): number {
  switch (value) {
    case "EXACT": return 0
    case "OFFICIAL_KWT_SEQUENCE": return 1
    case "PERIOD_WINDOW": return 2
    case "ORDERED_UNDATED": return 3
    case "AMBIGUOUS": return 4
    default: return 5
  }
}

function combinedChronologyConfidence(rounds: readonly HandicapDifferential[]): ChronologyConfidence {
  const confidence = rounds.reduce<ChronologyConfidence | undefined>((worst, round) => {
    const current = round.chronologyConfidence
    if (!current) return "UNKNOWN"
    if (!worst || chronologyRank(current) > chronologyRank(worst)) return current
    return worst
  }, undefined)
  return confidence ?? "UNKNOWN"
}

export function buildDifferentials(
  rounds: readonly HandicapRoundInput[],
  options: HandicapCalculationOptions = {},
): DifferentialBuild {
  const model = options.model ?? "legacy"
  const referenceSlope = options.referenceSlope ?? 8.515
  const nearZeroSlope = options.nearZeroSlope ?? 0.01
  const bySourceKey = new Map<string, HandicapRoundInput[]>()
  for (const round of rounds) {
    const group = bySourceKey.get(round.sourceKey) ?? []
    group.push(round)
    bySourceKey.set(round.sourceKey, group)
  }

  const duplicateKeys = new Set(
    [...bySourceKey.entries()].filter(([, group]) => group.length > 1).map(([key]) => key),
  )
  const issues: HandicapIssue[] = [...duplicateKeys].map((sourceKey) => ({
    sourceKey,
    code: "DUPLICATE_SOURCE_KEY",
  }))
  const differentials: HandicapDifferential[] = []

  for (const round of rounds) {
    if (duplicateKeys.has(round.sourceKey)) continue
    if (!isUuid(round.playerId)) {
      issues.push({ sourceKey: round.sourceKey, code: "INVALID_PLAYER_ID" })
      continue
    }
    if (round.playedAt !== null && !isValidDate(round.playedAt)) {
      issues.push({ sourceKey: round.sourceKey, code: "INVALID_PLAYED_AT" })
      continue
    }
    if (round.playedAt === null && (!round.chronologyConfidence || round.chronologyConfidence === "EXACT")) {
      issues.push({ sourceKey: round.sourceKey, code: "INVALID_PLAYED_AT" })
      continue
    }
    if (!Number.isFinite(round.score) || round.score <= MIN_SCORE || round.score >= MAX_SCORE) {
      issues.push({ sourceKey: round.sourceKey, code: "INVALID_SCORE" })
      continue
    }
    if (round.eligible === false || round.personalHandicapEligible === false) {
      issues.push({ sourceKey: round.sourceKey, code: "INELIGIBLE_ROUND" })
      continue
    }
    if (round.sourceType === "THE_WEEKLY") {
      issues.push({ sourceKey: round.sourceKey, code: "EXTERNAL_SOURCE_NOT_ELIGIBLE" })
      continue
    }
    if (options.requireExplicitSourceType
      && round.sourceType !== "KWT"
      && round.sourceType !== "APPROVED_PERSONAL") {
      issues.push({ sourceKey: round.sourceKey, code: "MISSING_PERSONAL_SOURCE_TYPE" })
      continue
    }
    if (round.courseRating === null || !Number.isFinite(round.courseRating)) {
      issues.push({ sourceKey: round.sourceKey, code: "MISSING_RATING" })
      continue
    }
    if (model === "candidate-a"
      && (round.slopeRating === null || !Number.isFinite(round.slopeRating)
        || round.slopeRating <= nearZeroSlope || referenceSlope <= 0)) {
      issues.push({ sourceKey: round.sourceKey, code: "INVALID_SLOPE" })
      continue
    }
    const differential = model === "candidate-a"
      ? candidateDifferential(round.score, round.courseRating, round.slopeRating, {
        id: "phase56-candidate-a",
        version: options.modelVersion ?? "slope-normalized-v1",
        adjust: ({ baseDifferential, slopeRating }) => baseDifferential * (referenceSlope / (slopeRating ?? 0)),
      })
      : currentDifferential(round.score, round.courseRating)
    differentials.push({
      ...round,
      differential,
    })
  }
  return { differentials, issues }
}

export function buildHandicapIndexes(
  differentials: readonly HandicapDifferential[],
  options: {
    activeRoundLimit?: number
    latestRoundLimit?: number
    /** @deprecated Best-round selection is ignored under the approved policy. */
    bestRoundLimit?: number
    minimumRounds?: number
    officialIndexRounds?: number
    chronologyPublicationPolicy?: ChronologyPublicationPolicy
  } = {},
): HandicapIndexBuild {
  const activeRoundLimit = options.activeRoundLimit ?? options.latestRoundLimit ?? 20
  const minimumRounds = options.minimumRounds ?? 1
  const officialIndexRounds = options.officialIndexRounds ?? 20
  const chronologyPublicationPolicy = options.chronologyPublicationPolicy ?? "EXACT_ONLY"
  const byPlayer = new Map<string, HandicapDifferential[]>()
  const personalDifferentials = differentials.filter((differential) =>
    differential.eligible !== false
      && differential.personalHandicapEligible !== false
      && differential.sourceType !== "THE_WEEKLY",
  )
  for (const differential of personalDifferentials) {
    const group = byPlayer.get(differential.playerId) ?? []
    group.push(differential)
    byPlayer.set(differential.playerId, group)
  }

  const indexes = [...byPlayer.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([playerId, rounds]) => {
    const active = rounds
      .slice()
      .sort((left, right) => chronologyKey(right).localeCompare(chronologyKey(left)) || left.sourceKey.localeCompare(right.sourceKey))
      .slice(0, activeRoundLimit)
    const index = active.length >= minimumRounds
      ? Math.round((active.reduce((sum, round) => sum + round.differential, 0) / active.length) * 100) / 100
      : null
    const chronologyConfidence = combinedChronologyConfidence(active)
    const officialSequencePublicationAllowed = chronologyPublicationPolicy === "EXACT_OR_OFFICIAL_KWT_SEQUENCE"
      && chronologyConfidence === "OFFICIAL_KWT_SEQUENCE"
    const handicapStatus: HandicapIndex["handicapStatus"] = active.length === 0
      ? "NOT_YET_RATED"
      : active.length >= officialIndexRounds ? "OFFICIAL_ELIGIBLE" : "PROVISIONAL"
    const publicationStatus: HandicapIndex["publicationStatus"] = index === null
      ? "UNAVAILABLE"
      : handicapStatus === "OFFICIAL_ELIGIBLE" && (chronologyConfidence === "EXACT" || officialSequencePublicationAllowed)
        ? "PUBLISHED"
        : chronologyConfidence === "EXACT" || officialSequencePublicationAllowed ? "UNPUBLISHED_APPROVAL" : "UNPUBLISHED_CHRONOLOGY"
    return {
      playerId,
      index,
      latestRoundCount: active.length,
      selectedRoundCount: active.length,
      selectedSourceKeys: active.map((round) => round.sourceKey),
      latestSourceKeys: active.map((round) => round.sourceKey),
      activeRoundCount: active.length,
      activeSourceKeys: active.map((round) => round.sourceKey),
      handicapStatus,
      ratingVersionIds: [...new Set(active.map((round) => round.ratingVersionId))].sort(),
      chronologyConfidence,
      publicationStatus,
    }
  })
  return { indexes, issues: [] }
}

export function calculateHandicapSnapshot(
  rounds: readonly HandicapRoundInput[],
  options: HandicapCalculationOptions = {},
): {
  differentials: readonly HandicapDifferential[]
  indexes: readonly HandicapIndex[]
  issues: readonly HandicapIssue[]
} {
  const differentialBuild = buildDifferentials(rounds, options)
  const indexBuild = buildHandicapIndexes(differentialBuild.differentials, {
    activeRoundLimit: options.activeRoundLimit ?? options.latestRoundLimit,
    minimumRounds: options.minimumIndexRounds,
    officialIndexRounds: options.officialIndexRounds,
    chronologyPublicationPolicy: options.chronologyPublicationPolicy,
  })
  return {
    differentials: differentialBuild.differentials,
    indexes: indexBuild.indexes,
    issues: [...differentialBuild.issues, ...indexBuild.issues],
  }
}

/**
 * Calculate the approved local launch projection. This deliberately requires
 * an explicit KWT or approved-personal source classification so external or
 * unclassified evidence cannot enter a personal Handicap Index.
 */
export function calculateApprovedHandicapSnapshot(
  rounds: readonly HandicapRoundInput[],
): ReturnType<typeof calculateHandicapSnapshot> {
  const policy = APPROVED_HANDICAP_POLICY
  return calculateHandicapSnapshot(rounds, {
    model: policy.model,
    modelVersion: policy.modelVersion,
    referenceSlope: policy.referenceSlope,
    nearZeroSlope: policy.nearZeroSlope,
    requireExplicitSourceType: policy.requireExplicitSourceType,
    activeRoundLimit: policy.activeRoundLimit,
    minimumIndexRounds: policy.minimumIndexRounds,
    officialIndexRounds: policy.officialIndexRounds,
    chronologyPublicationPolicy: policy.chronologyPublicationPolicy,
  })
}
