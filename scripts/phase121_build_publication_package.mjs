import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase121")
const phase68Path = path.join(root, "docs", "handicap", "phase68", "handicap_source_provenance_import.csv")
const phase117Path = path.join(root, "docs", "handicap", "phase117", "handicap_source_provenance_import.csv")
const phase104RatingsPath = path.join(root, "docs", "handicap", "phase104", "rating_snapshot_import_rows.csv")
const phase104IndexesPath = path.join(root, "docs", "handicap", "phase104", "index_snapshot_import_rows.csv")
const phase118PlayersPath = path.join(root, "docs", "handicap", "phase118", "phase118_player_index_comparison.csv")
const phase118CoursesPath = path.join(root, "docs", "handicap", "phase118", "phase118_course_rating_comparison.csv")
const phase119CoursesPath = path.join(root, "docs", "handicap", "phase119", "phase119_course_fairness_review.csv")
const canonicalNamesPath = path.join(root, "docs", "handicap", "phase118", "canonical_player_names.json")

const PRODUCTION_PROJECT = "jfbndcwdsvsjgnzwvexp"
const SOURCE_PHASE105_RUN = "3973f8e7-f2c9-5d05-bdb7-e49810713612"
const SOURCE_PHASE117_RUN = "9a9a4bc4-e43d-55d4-84fb-a83c0b757681"
const PHASE118_CHECKPOINT = "8f0da3465ddedaef8c9c89c72e236990ccce0b03"
const PHASE119_CHECKPOINT = "025e10ec1ee2353514a54732a9b520945dc8cbf5"
const MODEL_VERSION = "krys-handicap-candidate-a-v1"
const POLICY_VERSION = "krys-handicap-approved-policy-v1"
const REFERENCE_SLOPE = 8.515
const OWNER_APPROVED_RATING_DATE = "2026-10-21"
const OWNER_APPROVED_DIAGNOSTIC_COURSES = new Set([
  "Bogey's Bonanza_hard",
  "Forgotten Fairyland_easy",
  "Original Gothic_easy",
  "Raptor Cliff's_hard",
  "Shangri-La_easy",
])

function readCsv(file) {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${file}: ${parsed.errors.map((error) => error.message).join("; ")}`)
  return parsed.data
}

function writeCsv(file, rows) {
  fs.writeFileSync(file, `${Papa.unparse(rows, { newline: "\n" })}\n`, "utf8")
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
}

function uuidFromText(value) {
  const hex = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const normalized = hex.join("")
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`
}

function clean(value) { return String(value ?? "").trim() }
function num(value) { const result = Number(value); return Number.isFinite(result) ? result : null }
function metadata(row) { try { return JSON.parse(row.metadata || "{}") } catch { return {} } }
function round3(value) { return value === null || value === undefined ? null : Math.round(value * 1000) / 1000 }
function displayIndex(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "NOT_AVAILABLE"
  return Number(value) < 0 ? `+${Math.abs(Number(value)).toFixed(2)}` : Number(value).toFixed(2)
}

function normalizeKwt(row, source) {
  const meta = metadata(row)
  return {
    source,
    fingerprint: clean(row.source_fingerprint),
    season: Number(row.source_season),
    week: Number(row.source_week),
    playerKey: clean(row.canonical_player_id),
    playerName: clean(row.original_player_name),
    courseCode: clean(row.original_course_code || meta.course_code),
    courseId: clean(meta.course_id || row.original_course_label),
    difficulty: clean(row.difficulty || meta.difficulty || ((row.original_course_label || "").endsWith("_hard") ? "hard" : "easy")).toLowerCase(),
    score: num(row.score ?? meta.score),
  }
}

function roundOrder(a, b) {
  const difficultyOrder = (row) => row.difficulty === "easy" ? 0 : 1
  return a.season - b.season || a.week - b.week || difficultyOrder(a) - difficultyOrder(b) || a.fingerprint.localeCompare(b.fingerprint)
}

function completePairSet(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = `${row.season}|${row.week}|${row.playerKey}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const complete = new Set()
  for (const [key, group] of groups) {
    const difficulties = new Set(group.map((row) => row.difficulty))
    if (group.length === 2 && difficulties.has("easy") && difficulties.has("hard")) complete.add(key)
  }
  return complete
}

fs.mkdirSync(outputDir, { recursive: true })

const historical = readCsv(phase68Path).filter((row) => row.source_type === "KWT").map((row) => normalizeKwt(row, "KWT_HISTORICAL"))
const season14 = readCsv(phase117Path).filter((row) => row.source_type === "KWT").map((row) => normalizeKwt(row, "KWT_S14_W05_12"))
const phase104Indexes = readCsv(phase104IndexesPath)
const phase118Players = readCsv(phase118PlayersPath)
const phase119Courses = readCsv(phase119CoursesPath)
const canonicalNames = JSON.parse(fs.readFileSync(canonicalNamesPath, "utf8"))

if (historical.length !== 13550) throw new Error(`Expected 13,550 historical KWT rows, got ${historical.length}`)
if (season14.length !== 728) throw new Error(`Expected 728 Season 14 rows, got ${season14.length}`)
if (phase104Indexes.length !== 157) throw new Error(`Expected 157 old indexes, got ${phase104Indexes.length}`)
if (phase118Players.length !== 166) throw new Error(`Expected 166 Phase 118 player rows, got ${phase118Players.length}`)
if (phase119Courses.length !== 82) throw new Error(`Expected 82 Phase 119 course rows, got ${phase119Courses.length}`)

const historicalFingerprints = new Set(historical.map((row) => row.fingerprint))
if (season14.some((row) => historicalFingerprints.has(row.fingerprint))) throw new Error("Season 14 fingerprint collision with historical KWT")
const combinedRows = [...historical, ...season14]
const completePairs = completePairSet(combinedRows)
if (completePairs.size !== 7138) throw new Error(`Expected 7,138 complete pairs, got ${completePairs.size}`)

const revisedCourseRows = phase119Courses.filter((row) => row.confidence === "READY_CANDIDATE" && row.player_index_eligible === "true" && num(row.course_rating) !== null && (num(row.slope) ?? 0) > 0.01)
if (revisedCourseRows.length !== 78) throw new Error(`Expected 78 ready rating candidates, got ${revisedCourseRows.length}`)

const reviewRunId = uuidFromText(`phase121-publication-draft:${PHASE118_CHECKPOINT}:${PHASE119_CHECKPOINT}`)
const ratingIdByCourse = new Map(revisedCourseRows.map((row) => [row.course_id, uuidFromText(`phase121-rating:${reviewRunId}:${row.course_id}:KWT_ONLY`)]))
const ratingsByCourse = new Map(revisedCourseRows.map((row) => [row.course_id, {
  rating: num(row.course_rating),
  slope: num(row.slope),
  snapshotId: ratingIdByCourse.get(row.course_id),
}]))

const eligible = combinedRows.filter((row) => ratingsByCourse.has(row.courseId) && completePairs.has(`${row.season}|${row.week}|${row.playerKey}`)).map((row) => {
  const rating = ratingsByCourse.get(row.courseId)
  return { ...row, rating: rating.rating, slope: rating.slope, differential: (row.score - rating.rating) * REFERENCE_SLOPE / rating.slope, ratingSnapshotId: rating.snapshotId }
}).filter((row) => Number.isFinite(row.differential))

const grouped = new Map()
for (const row of eligible) grouped.set(row.playerKey, [...(grouped.get(row.playerKey) ?? []), row])
const revisedByPlayer = new Map()
for (const [playerKey, rows] of grouped) {
  const ordered = rows.slice().sort(roundOrder)
  const latestTen = ordered.slice(-10)
  const bestFive = latestTen.slice().sort((a, b) => a.differential - b.differential || a.fingerprint.localeCompare(b.fingerprint)).slice(0, 5)
  if (bestFive.length < 5) continue
  revisedByPlayer.set(playerKey, { ordered, latestTen, bestFive, index: round3(bestFive.reduce((sum, row) => sum + row.differential, 0) / bestFive.length) })
}

const comparisonByPlayer = new Map(phase118Players.map((row) => [clean(row.canonical_player_id), row]))
const playerIds = [...new Set(phase118Players.map((row) => clean(row.canonical_player_id)))].sort()
if (playerIds.length !== 166 || revisedByPlayer.size !== 166) throw new Error(`Expected 166 numeric revised candidates, got ${revisedByPlayer.size}`)
for (const playerId of playerIds) {
  const expected = num(comparisonByPlayer.get(playerId)?.revised_local_index)
  const actual = revisedByPlayer.get(playerId)?.index
  if (expected !== actual) throw new Error(`Phase 118 index mismatch for ${playerId}: expected ${expected}, got ${actual}`)
}

const reviewDisposition = (row) => {
  if (row.confidence === "PROVISIONAL") return "HOLD_PROVISIONAL"
  if (row.confidence === "UNRATED") return "HOLD_UNRATED"
  if (row.recommendation === "INVESTIGATE" && !OWNER_APPROVED_DIAGNOSTIC_COURSES.has(row.course_id)) return "HOLD_INVESTIGATE"
  return "ACCEPT_FOR_FORMAL_REVIEW"
}
const ownerRatingApproval = (row) => OWNER_APPROVED_DIAGNOSTIC_COURSES.has(row.course_id) ? "APPROVED_BY_KRYS" : "PENDING"

const ratingReferenceCounts = new Map()
const ratingBestFiveCounts = new Map()
const indexRows = playerIds.map((playerId) => {
  const preview = revisedByPlayer.get(playerId)
  const allRatingIds = [...new Set(preview.ordered.map((row) => row.ratingSnapshotId))]
  const bestRatingIds = [...new Set(preview.bestFive.map((row) => row.ratingSnapshotId))]
  for (const id of allRatingIds) ratingReferenceCounts.set(id, (ratingReferenceCounts.get(id) ?? 0) + 1)
  for (const id of bestRatingIds) ratingBestFiveCounts.set(id, (ratingBestFiveCounts.get(id) ?? 0) + 1)
  const comparison = comparisonByPlayer.get(playerId)
  const heldRatingIds = allRatingIds.filter((id) => {
    const course = revisedCourseRows.find((row) => ratingIdByCourse.get(row.course_id) === id)
    return course && reviewDisposition(course) !== "ACCEPT_FOR_FORMAL_REVIEW"
  })
  return {
    snapshot_id: uuidFromText(`phase121-index:${reviewRunId}:${playerId}`),
    source_snapshot_ids: phase104Indexes.filter((row) => clean(row.canonical_player_id) === playerId).map((row) => clean(row.id)),
    calculation_run_id: reviewRunId,
    canonical_player_id: playerId,
    canonical_screen_name: canonicalNames[playerId] || comparison?.canonical_screen_name || "CANONICAL_NAME_UNAVAILABLE",
    source_round_ids: preview.ordered.map((row) => row.fingerprint),
    rating_snapshot_ids: bestRatingIds,
    all_eligible_rating_snapshot_ids: allRatingIds,
    rating_version_ids: bestRatingIds,
    differential_model_version: MODEL_VERSION,
    latest_ten_source_round_ids: preview.latestTen.map((row) => row.fingerprint),
    best_five_source_round_ids: preview.bestFive.map((row) => row.fingerprint),
    resulting_index: preview.index,
    golf_display_index: displayIndex(preview.index),
    chronology_confidence: "OFFICIAL_KWT_SEQUENCE",
    source_scope: "KWT_ONLY",
    weekly_rows_used: 0,
    qualifying_round_count: preview.ordered.length,
    latest_ten_count: preview.latestTen.length,
    best_five_count: preview.bestFive.length,
    owner_numeric_fairness_decision: "ACCEPTED",
    owner_reviewers: "Krys|Tricky",
    owner_acceptance_scope: "NUMERIC_FAIRNESS_ONLY",
    owner_acceptance_basis: "Owner-supplied Phase 121 acceptance; no signature, timestamp, or reviewer UUID asserted",
    publication_decision: "PENDING_EXPLICIT_APPROVAL",
    rating_review_blockers: heldRatingIds.join("|"),
    publication_status: "UNPUBLISHED",
  }
})

const ratingRows = revisedCourseRows.map((row) => {
  const snapshotId = ratingIdByCourse.get(row.course_id)
  const playerCount = ratingReferenceCounts.get(snapshotId) ?? 0
  const bestFiveCount = ratingBestFiveCounts.get(snapshotId) ?? 0
  return {
    snapshot_id: snapshotId,
    calculation_run_id: reviewRunId,
    course_id: row.course_id,
    difficulty: row.difficulty,
    course_rating: num(row.course_rating),
    slope: num(row.slope),
    sample_size: Number(row.sample_size),
    distinct_players: Number(row.distinct_players),
    maximum_player_concentration: num(row.max_player_concentration),
    rating_confidence: row.confidence,
    model_version: "krys-course-rating-elite-lowest-12-v1",
    differential_model_version: MODEL_VERSION,
    reference_slope: REFERENCE_SLOPE,
    effective_from: "",
    effective_period: "KWT Season/Week descriptors from Phase 119; calendar date unavailable",
    provenance: row.provenance,
    weekly_rows_used: Number(row.weekly_rounds || 0),
    source_scope: "KWT_ONLY",
    formal_review_disposition: reviewDisposition(row),
    referenced_index_candidates: playerCount,
    referenced_best_five_candidates: bestFiveCount,
    publication_status: "UNPUBLISHED",
    publication_approval: ownerRatingApproval(row) === "APPROVED_BY_KRYS" ? "PENDING_EXPLICIT_PUBLICATION_APPROVAL" : "PENDING_HUMAN_RATING_REVIEW",
    owner_rating_approval: ownerRatingApproval(row),
    owner_rating_approval_basis: ownerRatingApproval(row) === "APPROVED_BY_KRYS" ? "Owner-supplied Krys approval dated 2026-10-21; no signature, reviewer UUID, or timestamp asserted" : "No owner rating approval recorded",
    owner_rating_approval_date: ownerRatingApproval(row) === "APPROVED_BY_KRYS" ? OWNER_APPROVED_RATING_DATE : null,
    flags: row.flags,
    note: row.note,
  }
})

const reviewCourseRows = phase119Courses.map((row) => {
  const snapshotId = ratingIdByCourse.get(row.course_id) ?? ""
  return {
    snapshot_id: snapshotId,
    course_id: row.course_id,
    difficulty: row.difficulty,
    confidence: row.confidence,
    sample_size: Number(row.sample_size || 0),
    distinct_players: Number(row.distinct_players || 0),
    course_rating: num(row.course_rating),
    slope: num(row.slope),
    formal_review_disposition: reviewDisposition(row),
    formal_approval: ownerRatingApproval(row) === "APPROVED_BY_KRYS" ? "OWNER_APPROVED" : "PENDING",
    owner_approval_reviewer: ownerRatingApproval(row) === "APPROVED_BY_KRYS" ? "Krys" : "",
    owner_approval_date: ownerRatingApproval(row) === "APPROVED_BY_KRYS" ? OWNER_APPROVED_RATING_DATE : null,
    owner_approval_basis: ownerRatingApproval(row) === "APPROVED_BY_KRYS" ? "Explicit owner rating approval for initial publication preparation; publication remains separately gated" : "No owner rating approval recorded",
    reason: row.flags || (row.confidence === "PROVISIONAL" ? "UNDER_50_ROUNDS" : row.confidence === "UNRATED" ? "NO_READY_RATING" : "READY_CANDIDATE_REQUIRES_FORMAL_APPROVAL"),
    affected_index_candidates: snapshotId ? (ratingReferenceCounts.get(snapshotId) ?? 0) : 0,
    provenance: row.provenance,
    weekly_rows: Number(row.weekly_rounds || 0),
    publication_status: "UNPUBLISHED",
  }
})

const approvalManifest = {
  schema_version: "phase121-revised-index-numeric-acceptance-v1",
  production_project: PRODUCTION_PROJECT,
  source_lineage: {
    phase118_checkpoint: PHASE118_CHECKPOINT,
    phase119_checkpoint: PHASE119_CHECKPOINT,
    phase105_run: SOURCE_PHASE105_RUN,
    phase117_run: SOURCE_PHASE117_RUN,
    phase118_player_comparison_sha256: sha256(phase118PlayersPath),
    phase119_course_review_sha256: sha256(phase119CoursesPath),
  },
  owner_acceptance: {
    decision: "NUMERIC_FAIRNESS_ACCEPTED",
    reviewers: ["Krys", "Tricky"],
    scope: "numeric fairness only; not blanket rating approval, identity approval, security approval, or publication approval",
    evidence: "Owner-supplied Phase 121 instruction",
    recorded_at: null,
    reviewer_signatures: [],
    reviewer_uuids: [],
  },
  owner_rating_approvals: [...OWNER_APPROVED_DIAGNOSTIC_COURSES].sort().map((courseId) => {
    const row = reviewCourseRows.find((candidate) => candidate.course_id === courseId)
    return {
      course_id: courseId,
      course_rating: num(row.course_rating),
      slope: num(row.slope),
      decision: "APPROVED_FOR_INITIAL_PUBLICATION_PREPARATION",
      reviewer: "Krys",
      decision_date: OWNER_APPROVED_RATING_DATE,
      recorded_at: null,
      reviewer_uuid: null,
    }
  }),
  counts: { index_candidates: indexRows.length, rating_candidates: ratingRows.length, weekly_rows_used_in_indexes: 0 },
  index_approvals: indexRows.map((row) => ({
    snapshot_id: row.snapshot_id,
    canonical_player_id: row.canonical_player_id,
    decision: "ACCEPT_NUMERIC_FAIRNESS_ONLY",
    publication_decision: "PENDING_EXPLICIT_APPROVAL",
    rating_review_blocked: row.rating_review_blockers.length > 0,
  })),
}

const ratingReview = {
  schema_version: "phase121-rating-review-dispositions-v1",
  status: "FORMAL_REVIEW_REQUIRED",
  dispositions: reviewCourseRows,
}

writeCsv(path.join(outputDir, "rating_snapshot_candidates.csv"), ratingRows)
writeCsv(path.join(outputDir, "player_index_candidates.csv"), indexRows)
writeCsv(path.join(outputDir, "rating_review_dispositions.csv"), ratingReview.dispositions)
writeCsv(path.join(outputDir, "player_index_approval_manifest.csv"), approvalManifest.index_approvals)
fs.writeFileSync(path.join(outputDir, "player_index_approval_manifest.json"), `${JSON.stringify(approvalManifest, null, 2)}\n`, "utf8")
fs.writeFileSync(path.join(outputDir, "rating_review_dispositions.json"), `${JSON.stringify(ratingReview, null, 2)}\n`, "utf8")

const packageFiles = [
  "rating_snapshot_candidates.csv",
  "player_index_candidates.csv",
  "rating_review_dispositions.csv",
  "rating_review_dispositions.json",
  "player_index_approval_manifest.csv",
  "player_index_approval_manifest.json",
]
const installationArtifacts = {
  "production_preflight.sql": path.join(outputDir, "production_preflight.sql"),
  "production_postflight.sql": path.join(outputDir, "production_postflight.sql"),
  "player_read_rpc_installation.md": path.join(outputDir, "player_read_rpc_installation.md"),
  "publication_installation_plan.md": path.join(outputDir, "publication_installation_plan.md"),
  "quarterly_rating_review_policy.md": path.join(outputDir, "quarterly_rating_review_policy.md"),
  "supabase/proposals/20261020_handicap_player_read_rpc.proposed.sql": path.join(root, "supabase", "proposals", "20261020_handicap_player_read_rpc.proposed.sql"),
}
const manifest = {
  schema_version: "phase121-revised-handicap-publication-package-v1",
  status: "DRAFT_QUARANTINED_UNPUBLISHED",
  production_project: PRODUCTION_PROJECT,
  calculation_run: {
    id: reviewRunId,
    policy_version: POLICY_VERSION,
    model_version: MODEL_VERSION,
    differential_formula: "(score - course rating) * 8.515 / course slope",
    reference_slope: REFERENCE_SLOPE,
    chronology_policy: "OFFICIAL_KWT_SEQUENCE",
    source_scope: "KWT_ONLY",
    source_runs: [SOURCE_PHASE105_RUN, SOURCE_PHASE117_RUN],
    status: "DRAFT",
    publication_eligibility: "QUARANTINED",
    effective_period_policy: "KWT_SEASON_WEEK_ONLY; no invented calendar dates",
  },
  owner_acceptance_scope: "NUMERIC_FAIRNESS_ONLY",
  owner_rating_approvals: approvalManifest.owner_rating_approvals,
  counts: {
    rating_candidates: ratingRows.length,
    reviewed_course_entries: reviewCourseRows.length,
    index_candidates: indexRows.length,
    distinct_players: new Set(indexRows.map((row) => row.canonical_player_id)).size,
    provisional_ratings: reviewCourseRows.filter((row) => row.confidence === "PROVISIONAL").length,
    unrated_ratings: reviewCourseRows.filter((row) => row.confidence === "UNRATED").length,
    investigate_ratings: reviewCourseRows.filter((row) => row.formal_review_disposition === "HOLD_INVESTIGATE").length,
    owner_approved_ratings: OWNER_APPROVED_DIAGNOSTIC_COURSES.size,
    weekly_rows_used_in_indexes: 0,
    indexes_with_rating_review_blockers: indexRows.filter((row) => row.rating_review_blockers).length,
  },
  publication_boundaries: [
    "No Production rows are changed by this package.",
    "All candidate ratings and indexes remain UNPUBLISHED.",
    "Numeric fairness acceptance from Krys and Tricky is not formal rating or publication approval.",
    "THE_WEEKLY is excluded from every personal index row.",
    "The five diagnostic ratings have explicit Krys approval for initial publication preparation; publication remains separately gated.",
    "Hollywood provisional ratings and both Gloop Lair unrated entries remain ineligible.",
  ],
  input_checksums: Object.fromEntries([
    ["phase68_provenance", phase68Path],
    ["phase117_provenance", phase117Path],
    ["phase104_ratings", phase104RatingsPath],
    ["phase104_indexes", phase104IndexesPath],
    ["phase118_players", phase118PlayersPath],
    ["phase118_courses", phase118CoursesPath],
    ["phase119_courses", phase119CoursesPath],
    ["canonical_names", canonicalNamesPath],
  ].map(([key, file]) => [key, sha256(file)])),
  package_files: Object.fromEntries(packageFiles.map((file) => [file, sha256(path.join(outputDir, file))])),
  installation_artifacts: Object.fromEntries(Object.entries(installationArtifacts).map(([key, file]) => [key, sha256(file)])),
}
manifest.approval_manifest_sha256 = sha256(path.join(outputDir, "player_index_approval_manifest.json"))
manifest.rating_review_sha256 = sha256(path.join(outputDir, "rating_review_dispositions.json"))
fs.writeFileSync(path.join(outputDir, "package_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
fs.writeFileSync(path.join(outputDir, "package_checksums.json"), `${JSON.stringify({ ...manifest.package_files, ...manifest.installation_artifacts, "package_manifest.json": sha256(path.join(outputDir, "package_manifest.json")) }, null, 2)}\n`, "utf8")

console.log(JSON.stringify({
  status: manifest.status,
  calculationRunId: reviewRunId,
  ratings: ratingRows.length,
  indexes: indexRows.length,
  players: new Set(indexRows.map((row) => row.canonical_player_id)).size,
  investigateRatings: manifest.counts.investigate_ratings,
  provisionalRatings: manifest.counts.provisional_ratings,
  unratedRatings: manifest.counts.unrated_ratings,
  indexesWithRatingReviewBlockers: manifest.counts.indexes_with_rating_review_blockers,
  weeklyRowsUsedInIndexes: manifest.counts.weekly_rows_used_in_indexes,
}, null, 2))
