import "server-only"

import { createAdminDataClient } from "@/lib/adminDataServer"

import {
  resolveCanonicalPlayerDisplayName,
  summarizeAdminIndexReview,
  type AdminIndexReviewRow,
} from "./adminIndexReview.ts"
import {
  HANDICAP_ADMIN_COURSE_COVERAGE,
  OFFICIAL_HANDICAP_COURSE_BASES,
} from "./adminReviewData"
import {
  PHASE120_COURSE_REVIEW,
  PHASE120_MOVEMENT_ROUNDS,
  PHASE120_PRELIMINARY_PLAYERS,
  PHASE120_REVIEW_METADATA,
} from "./phase120PreliminaryReview"
import type {
  Phase120CourseReview,
  Phase120MovementRound,
  Phase120PreliminaryPlayer,
} from "./phase120PreliminaryReview"

type AdminDataClient = ReturnType<typeof createAdminDataClient>

type ProductionRun = {
  id: string
  policy_version: string
  model_version: string
  source_package_ref: string
  chronology_policy: string
  status: string
  metadata: Record<string, unknown>
  created_at: string
  completed_at: string | null
  publication_eligibility: string
}

type ProductionCanonicalPlayer = { id: string; screen_name: string | null }

export type AdminReviewRun = Readonly<{
  id: string
  status: string
  publicationEligibility: string
  chronologyPolicy: string
  policyVersion: string
  modelVersion: string
  sourcePackageRef: string
  metadata: Readonly<Record<string, unknown>>
  createdAt: string
  completedAt: string | null
}>

export type ProductionAdminIndexReview = Readonly<{
  status: "AVAILABLE" | "UNAVAILABLE"
  source: "PRODUCTION_DATABASE" | "PRELIMINARY_LOCAL_PACKAGE" | "NONE"
  run: AdminReviewRun | null
  rows: readonly AdminIndexReviewRow[]
  summary: ReturnType<typeof summarizeAdminIndexReview> | null
  message: string
}>

export type AdminRoundEvidence = Readonly<{
  sourceFingerprint: string
  sourceRef: string
  sourceType: string
  sourceSeason: number | null
  sourceWeek: number | null
  originalPlayerName: string | null
  courseId: string | null
  difficulty: string | null
  originalCourseCode: string | null
  score: number | null
  sourceRoundId: string | null
  verificationStatus: string | null
}>

export type AdminDifferentialEvidence = Readonly<AdminRoundEvidence & {
  ratingSnapshotId: string | null
  ratingVersionId: string | null
  courseRating: number | null
  slope: number | null
  differential: number | null
}>

export type AdminPlayerReviewDetail = Readonly<{
  row: AdminIndexReviewRow
  latestTen: readonly AdminRoundEvidence[]
  bestFive: readonly AdminDifferentialEvidence[]
  sourceBreakdown: Readonly<Record<string, number>>
  message: string
}>

type ProductionRatingSnapshot = {
  id: string
  course_id: string
  difficulty: string
  course_rating: number | string | null
  slope: number | string | null
  sample_size: number
  distinct_canonical_player_count: number
  rating_confidence: string
  model_version: string
  effective_from: string | null
  effective_period: string | null
  source_evidence_refs: string[]
  publication_status: string
  review_scope: string | null
}

type ProductionProvenance = {
  source_fingerprint: string
  source_type: string
  source_ref: string
  source_date: string | null
  source_season: number | null
  source_week: number | null
  original_player_name: string | null
  canonical_player_id: string | null
  original_course_label: string | null
  original_course_code: string | null
  metadata: Record<string, unknown>
}

export type AdminCourseReviewRow = Readonly<{
  key: string
  code: string
  baseMap: string
  difficulty: "easy" | "hard"
  snapshotId: string | null
  courseRating: number | null
  slope: number | null
  sampleSize: number
  distinctPlayers: number
  confidence: string
  modelVersion: string | null
  effectivePeriod: string | null
  reviewScope: string | null
  publicationStatus: string | null
  status: "RATING_INSTALLED_UNPUBLISHED" | "LOCAL_PRELIMINARY_UNPUBLISHED" | "UNRATED_OR_NOT_IN_CURRENT_RUN"
  recommendation?: string
  flags?: string
  sourceSummary?: string
}>

export type AdminCourseReviewDetail = Readonly<{
  course: AdminCourseReviewRow
  sourceBreakdown: Readonly<Record<string, number>>
  evidenceCount: number
  weeklyExcludedFromPersonalIndexes: boolean
  evidence: readonly AdminRoundEvidence[]
  message: string
}>

function asNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null
}

function asNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null
}

function toRun(run: ProductionRun): AdminReviewRun {
  return Object.freeze({
    id: run.id,
    status: run.status,
    publicationEligibility: run.publication_eligibility,
    chronologyPolicy: run.chronology_policy,
    policyVersion: run.policy_version,
    modelVersion: run.model_version,
    sourcePackageRef: run.source_package_ref,
    metadata: Object.freeze({ ...run.metadata }),
    createdAt: run.created_at,
    completedAt: run.completed_at,
  })
}

async function readLatestReviewRun(client: AdminDataClient): Promise<{ run: AdminReviewRun | null; error: boolean }> {
  try {
    const result = await client
      .from("handicap_calculation_runs")
      .select("id,policy_version,model_version,source_package_ref,chronology_policy,status,metadata,created_at,completed_at,publication_eligibility")
      .eq("status", "DRAFT")
      .eq("publication_eligibility", "QUARANTINED")
      .eq("chronology_policy", "OFFICIAL_KWT_SEQUENCE")
      .order("created_at", { ascending: false })
      .limit(1)
    if (result.error) return { run: null, error: true }
    const run = (result.data ?? [])[0] as ProductionRun | undefined
    return { run: run ? toRun(run) : null, error: false }
  } catch {
    return { run: null, error: true }
  }
}

function phase120Run(): AdminReviewRun {
  return Object.freeze({
    id: "phase120-local-review-025e10ec",
    status: "PRELIMINARY",
    publicationEligibility: "UNPUBLISHED",
    chronologyPolicy: "OFFICIAL_KWT_SEQUENCE",
    policyVersion: "krys-handicap-approved-policy",
    modelVersion: "krys-handicap-candidate-a-v1",
    sourcePackageRef: "phase118-119-local-review-package",
    metadata: Object.freeze({ ...PHASE120_REVIEW_METADATA }),
    createdAt: "",
    completedAt: null,
  })
}

function buildPhase120Rows(names: Map<string, string | null>): readonly AdminIndexReviewRow[] {
  const run = phase120Run()
  const candidates = PHASE120_PRELIMINARY_PLAYERS as readonly Phase120PreliminaryPlayer[]
  return Object.freeze(candidates.map((candidate) => {
    const databaseName = names.get(candidate.canonicalPlayerId)
    const displayName = resolveCanonicalPlayerDisplayName(candidate.canonicalScreenName, databaseName)
    if (!displayName.canonicalScreenName) throw new Error(`canonical screen name unavailable for ${candidate.canonicalPlayerId}`)
    const flags = Object.freeze([
      "PRELIMINARY_LOCAL_PACKAGE",
      "RATING_REFERENCE_IDS_NOT_IN_COMPARISON_EXPORT",
      ...(displayName.nameChanged ? ["HISTORICAL_SOURCE_NAME_DIFFERS_FROM_CANONICAL"] : []),
      ...(candidate.reviewFlag && candidate.reviewFlag !== "NO_LARGE_MOVEMENT" ? [candidate.reviewFlag] : []),
    ])
    return Object.freeze({
      snapshotId: `phase120-local-index:${candidate.canonicalPlayerId}`,
      sourceSnapshotId: null,
      calculationRunId: run.id,
      canonicalPlayerId: candidate.canonicalPlayerId,
      canonicalScreenName: displayName.canonicalScreenName,
      originalScreenName: displayName.historicalSourceName,
      storedIndex: candidate.revisedIndex,
      displayedIndex: candidate.revisedGolfDisplay,
      qualifyingRoundCount: candidate.qualifyingRounds,
      sourceRoundIds: Object.freeze([]),
      latestTenSourceRoundIds: Object.freeze([]),
      bestFiveSourceRoundIds: Object.freeze([]),
      latestTenRoundCount: candidate.latestTenCount,
      bestFiveRoundCount: candidate.bestFiveCount,
      ratingReferenceCount: candidate.bestFiveCount,
      ratingSnapshotIds: Object.freeze([]),
      ratingVersionIds: Object.freeze([]),
      chronologyConfidence: candidate.chronologyConfidence,
      publicationStatus: "UNPUBLISHED",
      reviewFlags: flags,
      reviewStatus: "REVIEW_REQUIRED" as const,
      previousIndex: candidate.previousIndex,
      movement: candidate.movement,
      preliminaryStatus: "PRELIMINARY / UNPUBLISHED",
      reviewRecommendation: candidate.recommendation,
      majorMovement: candidate.absoluteChange !== null && candidate.absoluteChange >= 1,
    })
  }).sort((left, right) => left.canonicalScreenName?.localeCompare(right.canonicalScreenName ?? "") || left.canonicalPlayerId.localeCompare(right.canonicalPlayerId)))
}

/** Reads the current unpublished candidate set from Production only. */
export async function readAdminIndexReview(client: AdminDataClient): Promise<ProductionAdminIndexReview> {
  const latest = await readLatestReviewRun(client)
  try {
    const playerIds = PHASE120_PRELIMINARY_PLAYERS.map((candidate) => candidate.canonicalPlayerId)
    const [playersResult] = await Promise.all([
      client.from("players").select("id,screen_name").in("id", playerIds),
    ])
    if (playersResult.error) throw new Error("canonical player names unavailable")
    const players = (playersResult.data ?? []) as unknown as ProductionCanonicalPlayer[]
    if (players.length !== playerIds.length || players.some((player) => !player.screen_name?.trim())) throw new Error("one or more canonical screen names are unresolved")
    const names = new Map(players.map((player) => [player.id, player.screen_name]))
    const rows = buildPhase120Rows(names)
    return {
      status: "AVAILABLE",
      source: "PRELIMINARY_LOCAL_PACKAGE",
      run: phase120Run(),
      rows,
      summary: summarizeAdminIndexReview(rows),
      message: "166 revised candidates loaded from the committed Phase 118/119 review package and verified by canonical UUID against Production public.players.screen_name. Historical source names are retained as evidence; this is PRELIMINARY / UNPUBLISHED review data and the 157 older Production snapshots are not displayed as revised results.",
    }
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      source: latest.error ? "NONE" : "PRELIMINARY_LOCAL_PACKAGE",
      run: latest.run,
      rows: [],
      summary: null,
      message: error instanceof Error ? error.message : "Production Handicap review data is unavailable.",
    }
  }
}

function evidenceFromProvenance(row: ProductionProvenance): AdminRoundEvidence {
  const metadata = asMetadata(row.metadata)
  return Object.freeze({
    sourceFingerprint: row.source_fingerprint,
    sourceRef: row.source_ref,
    sourceType: row.source_type,
    sourceSeason: row.source_season,
    sourceWeek: row.source_week,
    originalPlayerName: row.original_player_name,
    courseId: asString(metadata.course_id),
    difficulty: asString(metadata.difficulty),
    originalCourseCode: row.original_course_code ?? asString(metadata.original_course_code),
    score: asNumberValue(metadata.score),
    sourceRoundId: asString(metadata.round_id),
    verificationStatus: asString(metadata.verification_status),
  })
}

function ratingForEvidence(row: AdminRoundEvidence, ratings: Map<string, ProductionRatingSnapshot>) {
  if (!row.courseId) return null
  for (const rating of ratings.values()) {
    if (rating.course_id === row.courseId && rating.difficulty === row.difficulty) return rating
  }
  return null
}

function differentialFor(row: AdminRoundEvidence, rating: ProductionRatingSnapshot | null): number | null {
  const score = row.score
  const courseRating = asNumber(rating?.course_rating)
  const slope = asNumber(rating?.slope)
  if (score === null || courseRating === null || slope === null || slope <= 0.01) return null
  return Number((((score - courseRating) * 8.515) / slope).toFixed(3))
}

export async function readAdminPlayerDetail(client: AdminDataClient, row: AdminIndexReviewRow): Promise<AdminPlayerReviewDetail> {
  if (row.snapshotId.startsWith("phase120-local-index:")) {
    const rows = (PHASE120_MOVEMENT_ROUNDS[row.canonicalPlayerId as keyof typeof PHASE120_MOVEMENT_ROUNDS] ?? []) as readonly Phase120MovementRound[]
    const evidence: readonly AdminRoundEvidence[] = rows.map((item) => Object.freeze({
      sourceFingerprint: item.sourceFingerprint,
      sourceRef: item.sourceFingerprint,
      sourceType: item.source,
      sourceSeason: item.season,
      sourceWeek: item.week,
      originalPlayerName: row.originalScreenName,
      courseId: item.courseId,
      difficulty: item.difficulty,
      originalCourseCode: item.courseCode,
      score: item.score,
      sourceRoundId: item.sourceFingerprint,
      verificationStatus: "VERIFIED_LOCAL_PHASE119",
    }))
    const latestTen = evidence.filter((item, index) => rows[index].inNewLatestTen)
    const bestFive = rows.reduce<AdminDifferentialEvidence[]>((result, item, index) => {
      if (item.inNewBestFive) result.push(Object.freeze({
        ...evidence[index],
        ratingSnapshotId: null,
        ratingVersionId: null,
        courseRating: item.revisedCourseRating,
        slope: item.revisedSlope,
        differential: item.revisedDifferential,
      }) as AdminDifferentialEvidence)
      return result
    }, [])
    return {
      row,
      latestTen,
      bestFive,
      sourceBreakdown: { KWT_HISTORICAL: evidence.length },
      message: evidence.length > 0
        ? "33 major movements have committed Phase 119 supporting-round evidence. Rating/version IDs were not included in the comparison export; displayed ratings and differentials remain preliminary and unpublished."
        : "This candidate is in the 166-row preliminary package but has no major-movement round detail in the Phase 119 supporting-round export.",
    }
  }
  const [provenanceResult, ratingResult] = await Promise.all([
    client.from("handicap_source_provenance").select("source_fingerprint,source_type,source_ref,source_date,source_season,source_week,original_player_name,canonical_player_id,original_course_label,original_course_code,metadata").eq("canonical_player_id", row.canonicalPlayerId).eq("source_type", "KWT").in("source_fingerprint", row.sourceRoundIds),
    client.from("handicap_rating_snapshots").select("id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,source_evidence_refs,publication_status,review_scope").in("id", row.ratingSnapshotIds),
  ])
  if (provenanceResult.error || ratingResult.error) {
    return { row, latestTen: [], bestFive: [], sourceBreakdown: {}, message: "Round-level evidence is unavailable for this candidate." }
  }
  const evidence = ((provenanceResult.data ?? []) as unknown as ProductionProvenance[]).map(evidenceFromProvenance)
  const evidenceById = new Map(evidence.map((item) => [item.sourceFingerprint, item]))
  const ratings = new Map(((ratingResult.data ?? []) as unknown as ProductionRatingSnapshot[]).map((rating) => [rating.id, rating]))
  const sourceBreakdown = Object.fromEntries([...new Set(evidence.map((item) => item.sourceType))].sort().map((sourceType) => [sourceType, evidence.filter((item) => item.sourceType === sourceType).length]))
  const latestTen = row.latestTenSourceRoundIds.map((id) => evidenceById.get(id)).filter((item): item is AdminRoundEvidence => Boolean(item))
  const bestFive = row.bestFiveSourceRoundIds.map((id) => {
    const item = evidenceById.get(id)
    if (!item) return null
    const rating = ratingForEvidence(item, ratings)
    const snapshotId = [...ratings.entries()].find(([, value]) => value === rating)?.[0] ?? null
    return Object.freeze({ ...item, ratingSnapshotId: snapshotId, ratingVersionId: snapshotId, courseRating: asNumber(rating?.course_rating), slope: asNumber(rating?.slope), differential: differentialFor(item, rating) })
  }).filter((item): item is AdminDifferentialEvidence => Boolean(item))
  return { row, latestTen, bestFive, sourceBreakdown, message: evidence.length === 0 ? "No exact KWT provenance rows matched this candidate's source fingerprints." : "KWT provenance and versioned rating references loaded from Production." }
}

function normalizeCourseName(value: string) {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim()
}

function codeForCourseId(courseId: string, difficulty: string) {
  const suffix = `_${difficulty}`
  const baseName = courseId.endsWith(suffix) ? courseId.slice(0, -suffix.length) : courseId
  const base = OFFICIAL_HANDICAP_COURSE_BASES.find((candidate) => normalizeCourseName(candidate.baseMap) === normalizeCourseName(baseName))
  return base ? `${base.code}${difficulty === "hard" ? "H" : "E"}` : null
}

export async function readAdminCourseReview(client: AdminDataClient, runId: string): Promise<readonly AdminCourseReviewRow[]> {
  if (runId === phase120Run().id) {
    const reviews = PHASE120_COURSE_REVIEW as readonly Phase120CourseReview[]
    return Object.freeze(HANDICAP_ADMIN_COURSE_COVERAGE.map((course) => {
      const review = reviews.find((candidate) => normalizeCourseName(candidate.courseId) === normalizeCourseName(`${course.baseMap}_${course.difficulty}`) && candidate.difficulty === course.difficulty)
      const courseRating = review?.courseRating ?? (review?.weeklyRounds ? review.weeklyRating : null)
      const slope = review?.slope ?? (review?.weeklyRounds ? review.weeklySlope : null)
      const courseOnlyWeekly = review?.courseRating === null && (review?.weeklyRounds ?? 0) > 0
      return Object.freeze({
        key: course.code,
        code: course.code,
        baseMap: course.baseMap,
        difficulty: course.difficulty,
        snapshotId: courseRating !== null && courseRating !== undefined ? `phase120-local-course:${course.code}` : null,
        courseRating,
        slope,
        sampleSize: review?.sampleSize ?? 0,
        distinctPlayers: review?.distinctPlayers ?? 0,
        confidence: courseOnlyWeekly ? "WEEKLY_COURSE_ONLY" : review?.confidence ?? "UNRATED",
        modelVersion: "krys-handicap-candidate-a-v1",
        effectivePeriod: "Season/Week coverage in Phase 119 package; no calendar date invented",
        reviewScope: "KWT_ONLY_REVIEW",
        publicationStatus: courseRating !== null && courseRating !== undefined ? "UNPUBLISHED" : null,
        status: courseRating !== null && courseRating !== undefined ? "LOCAL_PRELIMINARY_UNPUBLISHED" as const : "UNRATED_OR_NOT_IN_CURRENT_RUN" as const,
        recommendation: review?.recommendation,
        flags: review?.flags,
        sourceSummary: review ? `${review.provenance}; Weekly ${review.weeklyRounds} rounds kept course-rating-only` : "No local rating candidate",
      })
    }))
  }
  const result = await client.from("handicap_rating_snapshots").select("id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,source_evidence_refs,publication_status,review_scope").eq("calculation_run_id", runId).order("course_id", { ascending: true })
  const snapshots = result.error ? [] : (result.data ?? []) as unknown as ProductionRatingSnapshot[]
  const byCode = new Map(snapshots.map((snapshot) => [codeForCourseId(snapshot.course_id, snapshot.difficulty), snapshot] as const))
  return Object.freeze(HANDICAP_ADMIN_COURSE_COVERAGE.map((course) => {
    const snapshot = byCode.get(course.code)
    return Object.freeze({
      key: course.code,
      code: course.code,
      baseMap: course.baseMap,
      difficulty: course.difficulty,
      snapshotId: snapshot?.id ?? null,
      courseRating: asNumber(snapshot?.course_rating),
      slope: asNumber(snapshot?.slope),
      sampleSize: snapshot?.sample_size ?? course.sampleSize,
      distinctPlayers: snapshot?.distinct_canonical_player_count ?? course.distinctPlayers,
      confidence: snapshot?.rating_confidence ?? course.confidence,
      modelVersion: snapshot?.model_version ?? null,
      effectivePeriod: snapshot?.effective_period ?? null,
      reviewScope: snapshot?.review_scope ?? null,
      publicationStatus: snapshot?.publication_status ?? null,
      status: snapshot ? "RATING_INSTALLED_UNPUBLISHED" as const : "UNRATED_OR_NOT_IN_CURRENT_RUN" as const,
    })
  }))
}

export async function readAdminCourseDetail(client: AdminDataClient, course: AdminCourseReviewRow): Promise<AdminCourseReviewDetail> {
  if (course.snapshotId?.startsWith("phase120-local-course:")) {
    const reviews = PHASE120_COURSE_REVIEW as readonly Phase120CourseReview[]
    const review = reviews.find((candidate) => codeForCourseId(candidate.courseId, candidate.difficulty) === course.code)
    if (!review) return { course, sourceBreakdown: {}, evidenceCount: 0, weeklyExcludedFromPersonalIndexes: true, evidence: [], message: "Local course review data is unavailable." }
    const sourceBreakdown: Record<string, number> = review.weeklyRounds > 0
      ? { KWT: Math.max(0, review.sampleSize - review.weeklyRounds), THE_WEEKLY: review.weeklyRounds }
      : { KWT: review.sampleSize }
    return {
      course,
      sourceBreakdown,
      evidenceCount: review.sampleSize,
      weeklyExcludedFromPersonalIndexes: true,
      evidence: [],
      message: `Phase 119 aggregate review only: ${review.recommendation}. ${review.note} Row-level references remain in the committed local diagnostics package.`,
    }
  }
  if (!course.snapshotId) return { course, sourceBreakdown: {}, evidenceCount: 0, weeklyExcludedFromPersonalIndexes: true, evidence: [], message: "No rating snapshot exists for this course in the current review run." }
  const snapshotResult = await client.from("handicap_rating_snapshots").select("id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,source_evidence_refs,publication_status,review_scope").eq("id", course.snapshotId).limit(1)
  if (snapshotResult.error || !snapshotResult.data?.[0]) return { course, sourceBreakdown: {}, evidenceCount: 0, weeklyExcludedFromPersonalIndexes: true, evidence: [], message: "Rating snapshot evidence is unavailable." }
  const snapshot = snapshotResult.data[0] as unknown as ProductionRatingSnapshot
  const sourceRefs = snapshot.source_evidence_refs ?? []
  if (sourceRefs.length === 0) return { course, sourceBreakdown: {}, evidenceCount: 0, weeklyExcludedFromPersonalIndexes: true, evidence: [], message: "The rating snapshot has no source evidence references." }
  const provenanceResult = await client.from("handicap_source_provenance").select("source_fingerprint,source_type,source_ref,source_date,source_season,source_week,original_player_name,canonical_player_id,original_course_label,original_course_code,metadata").in("source_fingerprint", sourceRefs)
  if (provenanceResult.error) return { course, sourceBreakdown: {}, evidenceCount: 0, weeklyExcludedFromPersonalIndexes: true, evidence: [], message: "Source provenance is unavailable." }
  const evidence = ((provenanceResult.data ?? []) as unknown as ProductionProvenance[]).map(evidenceFromProvenance)
  const sourceBreakdown = Object.fromEntries([...new Set(evidence.map((item) => item.sourceType))].sort().map((sourceType) => [sourceType, evidence.filter((item) => item.sourceType === sourceType).length]))
  return { course, sourceBreakdown, evidenceCount: evidence.length, weeklyExcludedFromPersonalIndexes: true, evidence, message: "Course evidence is separated by source type." }
}
