import { compareStoredHandicapIndexes, formatGolfHandicapIndex } from "./indexDisplay.ts"

export type AdminIndexReviewInput = Readonly<{
  id: string
  calculationRunId: string
  canonicalPlayerId: string
  originalScreenName?: string | null
  canonicalScreenName?: string | null
  canonicalIdentityResolved?: boolean
  sourceRoundIds: readonly string[]
  ratingSnapshotIds: readonly string[]
  ratingVersionIds: readonly string[]
  latestTenSourceRoundIds: readonly string[]
  bestFiveSourceRoundIds: readonly string[]
  resultingIndex: number | null
  chronologyConfidence: string
  publicationStatus: string
  sourceSnapshotId?: string | null
}>

function parseCsv(text: string): readonly string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ",") {
      row.push(field)
      field = ""
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""))
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      field = ""
    } else {
      field += character
    }
  }

  row.push(field.replace(/\r$/, ""))
  if (row.some((value) => value.length > 0)) rows.push(row)
  return rows
}

function parseJsonArray(value: string, label: string): readonly string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be a string array`)
  }
  return parsed
}

/** Parses the committed Phase 104 CSV without treating it as executable SQL. */
export function parsePhase104IndexSnapshotCsv(csv: string): readonly AdminIndexReviewInput[] {
  const records = parseCsv(csv)
  const header = records[0]
  if (!header) throw new Error("index snapshot CSV is empty")
  const headerIndex = new Map(header.map((name, index) => [name.replace(/^\uFEFF/, ""), index]))
  const required = [
    "id", "calculation_run_id", "canonical_player_id", "source_round_ids",
    "rating_snapshot_ids", "rating_version_ids", "latest_ten_source_round_ids",
    "best_five_source_round_ids", "resulting_index", "chronology_confidence",
    "publication_status", "source_snapshot_id",
  ]
  for (const name of required) if (!headerIndex.has(name)) throw new Error(`index snapshot CSV is missing ${name}`)

  const value = (row: readonly string[], name: string): string => row[headerIndex.get(name)!] ?? ""
  return Object.freeze(records.slice(1).map((row) => ({
    id: value(row, "id"),
    calculationRunId: value(row, "calculation_run_id"),
    canonicalPlayerId: value(row, "canonical_player_id"),
    sourceRoundIds: parseJsonArray(value(row, "source_round_ids"), "source_round_ids"),
    ratingSnapshotIds: parseJsonArray(value(row, "rating_snapshot_ids"), "rating_snapshot_ids"),
    ratingVersionIds: parseJsonArray(value(row, "rating_version_ids"), "rating_version_ids"),
    latestTenSourceRoundIds: parseJsonArray(value(row, "latest_ten_source_round_ids"), "latest_ten_source_round_ids"),
    bestFiveSourceRoundIds: parseJsonArray(value(row, "best_five_source_round_ids"), "best_five_source_round_ids"),
    resultingIndex: Number(value(row, "resulting_index")),
    chronologyConfidence: value(row, "chronology_confidence"),
    publicationStatus: value(row, "publication_status"),
    sourceSnapshotId: value(row, "source_snapshot_id") || null,
  })))
}

export type AdminIndexReviewRow = Readonly<{
  snapshotId: string
  sourceSnapshotId: string | null
  calculationRunId: string
  canonicalPlayerId: string
  canonicalScreenName: string | null
  originalScreenName: string | null
  storedIndex: number | null
  displayedIndex: string
  qualifyingRoundCount: number
  sourceRoundIds: readonly string[]
  latestTenSourceRoundIds: readonly string[]
  bestFiveSourceRoundIds: readonly string[]
  latestTenRoundCount: number
  bestFiveRoundCount: number
  ratingReferenceCount: number
  ratingSnapshotIds: readonly string[]
  ratingVersionIds: readonly string[]
  chronologyConfidence: string
  publicationStatus: string
  reviewFlags: readonly string[]
  reviewStatus: "REVIEW_REQUIRED" | "READY_FOR_EXPLICIT_APPROVAL"
  previousIndex?: number | null
  movement?: number | null
  preliminaryStatus?: string
  reviewRecommendation?: string
  majorMovement?: boolean
}>

/**
 * Resolves the display name from the canonical player record. Historical
 * package/source names are evidence, not identity keys, so a rename or case
 * change must not make an otherwise UUID-valid candidate unavailable.
 */
export function resolveCanonicalPlayerDisplayName(
  historicalSourceName: string | null | undefined,
  databaseScreenName: string | null | undefined,
): Readonly<{
  canonicalScreenName: string | null
  historicalSourceName: string | null
  nameChanged: boolean
}> {
  const historical = historicalSourceName?.trim() || null
  const canonical = databaseScreenName?.trim() || null
  return Object.freeze({
    canonicalScreenName: canonical,
    historicalSourceName: historical,
    nameChanged: historical !== null && canonical !== null && historical !== canonical,
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value)
}

/**
 * Converts the validated Phase 104 index package into an admin-only review
 * table. This is a display contract only: it never changes an index or grants
 * publication eligibility. The Phase 104 package contains canonical UUIDs but
 * not screen names, so that omission is deliberately surfaced as a review flag.
 */
export function buildAdminIndexReviewRows(input: readonly AdminIndexReviewInput[]): readonly AdminIndexReviewRow[] {
  const rows = input.map((candidate) => {
    const flags: string[] = []
    if (!UUID.test(candidate.canonicalPlayerId)) flags.push("INVALID_CANONICAL_PLAYER_ID")
    if (!candidate.canonicalScreenName?.trim() && !candidate.originalScreenName?.trim()) flags.push("CANONICAL_SCREEN_NAME_UNRESOLVED")
    if (candidate.canonicalIdentityResolved === false) flags.push("CANONICAL_IDENTITY_NOT_RESOLVED")
    if (candidate.resultingIndex === null || !Number.isFinite(candidate.resultingIndex)) flags.push("MISSING_INDEX_VALUE")
    if (candidate.publicationStatus !== "UNPUBLISHED") flags.push("NOT_UNPUBLISHED")
    if (candidate.chronologyConfidence !== "OFFICIAL_KWT_SEQUENCE") flags.push("UNSUPPORTED_CHRONOLOGY")
    if (candidate.sourceRoundIds.length === 0) flags.push("MISSING_SOURCE_ROUNDS")
    if (candidate.latestTenSourceRoundIds.length === 0 || candidate.latestTenSourceRoundIds.length > 10) flags.push("INVALID_LATEST_TEN")
    if (candidate.bestFiveSourceRoundIds.length !== 5) flags.push("INVALID_BEST_FIVE")
    if (candidate.ratingSnapshotIds.length === 0 || candidate.ratingSnapshotIds.length !== candidate.ratingVersionIds.length) flags.push("INCOMPLETE_RATING_REFERENCES")
    if (candidate.sourceRoundIds.some((sourceId) => !sourceId.startsWith("KWT|"))) flags.push("NON_KWT_SOURCE_ROUND")

    return freeze({
      snapshotId: candidate.id,
      sourceSnapshotId: candidate.sourceSnapshotId ?? null,
      calculationRunId: candidate.calculationRunId,
      canonicalPlayerId: candidate.canonicalPlayerId,
      canonicalScreenName: candidate.canonicalScreenName?.trim() || candidate.originalScreenName?.trim() || null,
      originalScreenName: candidate.originalScreenName ?? null,
      storedIndex: candidate.resultingIndex,
      displayedIndex: formatGolfHandicapIndex(candidate.resultingIndex),
      qualifyingRoundCount: candidate.sourceRoundIds.length,
      sourceRoundIds: Object.freeze([...candidate.sourceRoundIds]),
      latestTenSourceRoundIds: Object.freeze([...candidate.latestTenSourceRoundIds]),
      bestFiveSourceRoundIds: Object.freeze([...candidate.bestFiveSourceRoundIds]),
      latestTenRoundCount: candidate.latestTenSourceRoundIds.length,
      bestFiveRoundCount: candidate.bestFiveSourceRoundIds.length,
      ratingReferenceCount: candidate.ratingSnapshotIds.length,
      ratingSnapshotIds: Object.freeze([...candidate.ratingSnapshotIds]),
      ratingVersionIds: Object.freeze([...candidate.ratingVersionIds]),
      chronologyConfidence: candidate.chronologyConfidence,
      publicationStatus: candidate.publicationStatus,
      reviewFlags: Object.freeze(flags),
      reviewStatus: flags.length === 0 ? "READY_FOR_EXPLICIT_APPROVAL" as const : "REVIEW_REQUIRED" as const,
    })
  })

  return Object.freeze(rows.sort((left, right) => left.canonicalPlayerId.localeCompare(right.canonicalPlayerId) || left.snapshotId.localeCompare(right.snapshotId)))
}

export type AdminIndexReviewFilter = "all" | "review_required" | "ready" | "negative" | "nonnegative"
export type AdminIndexReviewSort = "screen_name" | "stored_index" | "qualifying_rounds" | "review_status"
export type AdminIndexReviewDirection = "asc" | "desc"

export function filterAdminIndexReviewRows(
  rows: readonly AdminIndexReviewRow[],
  filter: AdminIndexReviewFilter,
): readonly AdminIndexReviewRow[] {
  if (filter === "review_required") return rows.filter((row) => row.reviewStatus === "REVIEW_REQUIRED")
  if (filter === "ready") return rows.filter((row) => row.reviewStatus === "READY_FOR_EXPLICIT_APPROVAL")
  if (filter === "negative") return rows.filter((row) => row.storedIndex !== null && row.storedIndex < 0)
  if (filter === "nonnegative") return rows.filter((row) => row.storedIndex === null || row.storedIndex >= 0)
  return rows
}

export function sortAdminIndexReviewRows(
  rows: readonly AdminIndexReviewRow[],
  sort: AdminIndexReviewSort,
  direction: AdminIndexReviewDirection,
): readonly AdminIndexReviewRow[] {
  const multiplier = direction === "desc" ? -1 : 1
  return [...rows].sort((left, right) => {
    let comparison = 0
    if (sort === "screen_name") comparison = (left.canonicalScreenName ?? "").localeCompare(right.canonicalScreenName ?? "")
    else if (sort === "stored_index") comparison = compareStoredHandicapIndexes(left.storedIndex, right.storedIndex)
    else if (sort === "qualifying_rounds") comparison = left.qualifyingRoundCount - right.qualifyingRoundCount
    else comparison = left.reviewStatus.localeCompare(right.reviewStatus)
    return comparison * multiplier || left.canonicalPlayerId.localeCompare(right.canonicalPlayerId) || left.snapshotId.localeCompare(right.snapshotId)
  })
}

export function summarizeAdminIndexReview(rows: readonly AdminIndexReviewRow[]) {
  return freeze({
    total: rows.length,
    readyForExplicitApproval: rows.filter((row) => row.reviewStatus === "READY_FOR_EXPLICIT_APPROVAL").length,
    reviewRequired: rows.filter((row) => row.reviewStatus === "REVIEW_REQUIRED").length,
    unpublished: rows.filter((row) => row.publicationStatus === "UNPUBLISHED").length,
    chronology: Object.freeze(Object.fromEntries(
      [...new Set(rows.map((row) => row.chronologyConfidence))].sort().map((confidence) => [confidence, rows.filter((row) => row.chronologyConfidence === confidence).length]),
    )),
  })
}
