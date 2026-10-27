import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase118")
const phase68Path = path.join(root, "docs", "handicap", "phase68", "handicap_source_provenance_import.csv")
const phase117Path = path.join(root, "docs", "handicap", "phase117", "handicap_source_provenance_import.csv")
const phase104RatingPath = path.join(root, "docs", "handicap", "phase104", "rating_snapshot_import_rows.csv")
const phase104IndexPath = path.join(root, "docs", "handicap", "phase104", "index_snapshot_import_rows.csv")
const weeklyPath = path.join(root, "weekly_course_evidence.csv")
const canonicalNamesPath = path.join(root, "docs", "handicap", "phase118", "canonical_player_names.json")

const SOURCE_ZIP_SHA256 = "E599CF6DF746F6C60C9718FBB73486396055567B738ED1A6EEB5808D2E2E46CE"
const PHASE117_MANIFEST_SHA256 = "E808D8459AC131E384CCA0F2D44ED230B8513EA61671149322EDDEA1972230E3"
const MODEL_VERSION = "krys-handicap-candidate-a-v1"
const REFERENCE_SLOPE = 8.515

function readCsv(file) {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${file}: ${parsed.errors.map((error) => error.message).join("; ")}`)
  return parsed.data
}
function writeCsv(file, rows) {
  fs.writeFileSync(file, `${Papa.unparse(rows, { newline: "\n" })}\n`, "utf8")
}
function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase() }
function num(value) { const result = Number(value); return Number.isFinite(result) ? result : null }
function clean(value) { return String(value ?? "").trim() }
function metadata(row) { try { return JSON.parse(row.metadata || "{}"); } catch { return {}; } }
function round3(value) { return value === null || value === undefined ? null : Math.round(value * 1000) / 1000 }
function median(values) {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function displayIndex(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "NOT_AVAILABLE"
  const rounded = Number(value).toFixed(2)
  return Number(value) < 0 ? `+${Math.abs(Number(value)).toFixed(2)}` : rounded
}
function ratingSummary(observations) {
  const scores = observations.map((row) => row.score).filter(Number.isFinite)
  if (!scores.length) return { rounds: 0, players: 0, mean: null, median: null, elite: null, rating: null, slope: null, maxPlayerShare: null, status: "UNRATED", reason: "NO_QUALIFYING_ROUNDS" }
  const ordered = scores.slice().sort((a, b) => a - b)
  const eliteCount = Math.max(1, Math.ceil(ordered.length * 0.12))
  const elite = ordered.slice(0, eliteCount).reduce((sum, score) => sum + score, 0) / eliteCount
  const mean = ordered.reduce((sum, score) => sum + score, 0) / ordered.length
  const counts = new Map()
  for (const row of observations) counts.set(row.playerKey, (counts.get(row.playerKey) ?? 0) + 1)
  const players = counts.size
  const maxPlayerShare = Math.max(...counts.values()) / ordered.length
  const rating = ordered.length >= 20 ? elite : null
  const slope = rating === null ? null : mean - rating
  if (ordered.length < 20) return { rounds: ordered.length, players, mean, median: median(ordered), elite, rating: null, slope: null, maxPlayerShare, status: "UNRATED", reason: "UNDER_20_ROUNDS" }
  if (ordered.length < 50) return { rounds: ordered.length, players, mean, median: median(ordered), elite, rating, slope, maxPlayerShare, status: "PROVISIONAL", reason: "20_TO_49_ROUNDS" }
  const ready = players >= 20 && maxPlayerShare <= 0.1 && slope > 0.01
  return { rounds: ordered.length, players, mean, median: median(ordered), elite, rating, slope, maxPlayerShare, status: ready ? "READY_CANDIDATE" : "BLOCKED_CONFIDENCE", reason: ready ? "THRESHOLDS_PASS" : players < 20 ? "UNDER_20_DISTINCT_PLAYERS" : maxPlayerShare > 0.1 ? "PLAYER_CONCENTRATION_OVER_10_PERCENT" : "INVALID_OR_NEAR_ZERO_SLOPE" }
}

fs.mkdirSync(outputDir, { recursive: true })
const historicalRows = readCsv(phase68Path)
const newRows = readCsv(phase117Path)
const phase104Ratings = readCsv(phase104RatingPath)
const phase104Indexes = readCsv(phase104IndexPath)
const weeklyRows = readCsv(weeklyPath)
const canonicalNames = JSON.parse(fs.readFileSync(canonicalNamesPath, "utf8"))

const historicalKwt = historicalRows.filter((row) => row.source_type === "KWT").map((row) => {
  const meta = metadata(row)
  return {
    source: "KWT_HISTORICAL",
    fingerprint: row.source_fingerprint,
    season: Number(row.source_season),
    week: Number(row.source_week),
    playerKey: clean(row.canonical_player_id),
    playerName: row.original_player_name,
    courseCode: clean(row.original_course_code || meta.original_course_code),
    courseId: clean(meta.course_id),
    difficulty: clean(meta.difficulty || ((row.original_course_label || "").endsWith("_hard") ? "hard" : "easy")).toLowerCase(),
    score: num(meta.score),
  }
}).filter((row) => row.playerKey && row.courseId && row.score !== null)

const newKwt = newRows.filter((row) => row.source_type === "KWT").map((row) => {
  const meta = metadata(row)
  return {
    source: "KWT_S14_W05_12",
    fingerprint: row.source_fingerprint,
    season: Number(row.source_season),
    week: Number(row.source_week),
    playerKey: clean(row.canonical_player_id),
    playerName: row.original_player_name,
    courseCode: clean(row.original_course_code || meta.course_code),
    courseId: clean(meta.course_id || row.original_course_label),
    difficulty: clean(row.difficulty || meta.difficulty).toLowerCase(),
    score: num(row.score ?? meta.score),
  }
}).filter((row) => row.playerKey && row.courseId && row.score !== null)

if (historicalKwt.length !== 13550) throw new Error(`Expected 13,550 historical KWT rows, got ${historicalKwt.length}`)
if (newKwt.length !== 728) throw new Error(`Expected 728 Phase 117 KWT rows, got ${newKwt.length}`)
const historicalWeeks = new Set(historicalKwt.filter((row) => row.season === 14 && row.week >= 5 && row.week <= 12).map((row) => row.fingerprint))
if (historicalWeeks.size !== 0) throw new Error("Phase 117 scope overlaps historical KWT fingerprints")
const historicalFingerprints = new Set(historicalKwt.map((row) => row.fingerprint))
if (newKwt.some((row) => historicalFingerprints.has(row.fingerprint))) throw new Error("Phase 117 fingerprint collision with historical KWT")

const namesByPlayer = new Map()
for (const row of [...historicalKwt, ...newKwt]) {
  const names = namesByPlayer.get(row.playerKey) ?? new Map()
  names.set(row.playerName, (names.get(row.playerName) ?? 0) + 1)
  namesByPlayer.set(row.playerKey, names)
}
const canonicalName = (playerKey) => {
  if (canonicalNames[playerKey]) return canonicalNames[playerKey]
  const names = namesByPlayer.get(playerKey)
  if (!names) return "CANONICAL_NAME_UNAVAILABLE"
  return [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

const courseByCode = new Map()
for (const row of [...historicalKwt, ...newKwt]) {
  if (!row.courseCode || !row.courseId) continue
  const existing = courseByCode.get(row.courseCode)
  if (existing && (existing.courseId !== row.courseId || existing.difficulty !== row.difficulty)) throw new Error(`Course code conflict: ${row.courseCode}`)
  courseByCode.set(row.courseCode, { courseId: row.courseId, difficulty: row.difficulty })
}
for (const [code, courseId, difficulty] of [["BHE", "Blokhaven_easy", "easy"], ["BHH", "Blokhaven_hard", "hard"], ["GLE", "Gloop Lair_easy", "easy"], ["GLH", "Gloop Lair_hard", "hard"]]) {
  const existing = courseByCode.get(code)
  if (existing && (existing.courseId !== courseId || existing.difficulty !== difficulty)) throw new Error(`Explicit course code conflict: ${code}`)
  courseByCode.set(code, { courseId, difficulty })
}

const pairGroups = new Map()
for (const row of [...historicalKwt, ...newKwt]) {
  const key = `${row.season}|${row.week}|${row.playerKey}`
  const rows = pairGroups.get(key) ?? []
  rows.push(row)
  pairGroups.set(key, rows)
}
const completePairs = new Set()
const incompletePairs = []
for (const [key, rows] of pairGroups) {
  const difficultySet = new Set(rows.map((row) => row.difficulty))
  if (rows.length === 2 && difficultySet.has("easy") && difficultySet.has("hard")) completePairs.add(key)
  else incompletePairs.push({ pair_key: key, observations: rows.length, difficulties: [...difficultySet].sort().join("|") })
}
const completeHistoricalKwt = historicalKwt.filter((row) => completePairs.has(`${row.season}|${row.week}|${row.playerKey}`))
const completeNewKwt = newKwt.filter((row) => completePairs.has(`${row.season}|${row.week}|${row.playerKey}`))
const completeKwt = [...completeHistoricalKwt, ...completeNewKwt]

const weeklyValid = weeklyRows.filter((row) => row.source === "THE_WEEKLY" && row.verification_status === "VERIFIED" && row.completed_round === "true" && num(row.score) !== null)
const weeklyBoundaryViolations = weeklyRows.filter((row) => row.source === "THE_WEEKLY" && row.personal_handicap_eligible !== "false")
if (weeklyBoundaryViolations.length) throw new Error(`Weekly personal-handicap boundary violation: ${weeklyBoundaryViolations.length}`)
const weeklyFingerprints = new Set()
const weeklyDuplicates = []
const weekly = []
for (const row of weeklyValid) {
  const fingerprint = [row.source, row.event_id, row.division, row.player_exact, row.course_code, row.source_row].join("|")
  if (weeklyFingerprints.has(fingerprint)) { weeklyDuplicates.push(fingerprint); continue }
  weeklyFingerprints.add(fingerprint)
  const course = courseByCode.get(clean(row.course_code))
  if (course && course.difficulty !== clean(row.difficulty).toLowerCase()) throw new Error(`Weekly course difficulty conflict: ${row.course_code}`)
  if (course) weekly.push({ source: "THE_WEEKLY", fingerprint, season: null, week: null, playerKey: `WEEKLY:${row.player_exact}`, playerName: row.player_exact, courseCode: row.course_code, courseId: course.courseId, difficulty: clean(row.difficulty).toLowerCase(), score: num(row.score) })
}

const oldRatingByCourse = new Map(phase104Ratings.map((row) => [clean(row.course_id), { rating: num(row.course_rating), slope: num(row.slope), status: row.rating_confidence, snapshotId: row.id }]))
const oldIndexByPlayer = new Map(phase104Indexes.map((row) => [clean(row.canonical_player_id), num(row.resulting_index)]))
const historicalByCourse = new Map()
const combinedKwtByCourse = new Map()
const weeklyByCourse = new Map()
const push = (map, row) => { const rows = map.get(row.courseId) ?? []; rows.push(row); map.set(row.courseId, rows) }
for (const row of completeHistoricalKwt) { push(historicalByCourse, row); push(combinedKwtByCourse, row) }
for (const row of completeNewKwt) push(combinedKwtByCourse, row)
for (const row of weekly) push(weeklyByCourse, row)

const courseIds = [...new Set([...phase104Ratings.map((row) => clean(row.course_id)), ...combinedKwtByCourse.keys(), ...weeklyByCourse.keys()])].sort()
const courseRows = []
for (const courseId of courseIds) {
  const old = ratingSummary(historicalByCourse.get(courseId) ?? [])
  const kwt = ratingSummary(combinedKwtByCourse.get(courseId) ?? [])
  const weeklySummary = ratingSummary(weeklyByCourse.get(courseId) ?? [])
  const combined = ratingSummary([...(combinedKwtByCourse.get(courseId) ?? []), ...(weeklyByCourse.get(courseId) ?? [])])
  const oldRating = oldRatingByCourse.get(courseId)
  const sourceModels = [["KWT_ONLY", old, historicalByCourse.get(courseId) ?? [], "Corrected Phase 68 KWT history"], ["KWT_PLUS_S14_W05_12", kwt, combinedKwtByCourse.get(courseId) ?? [], "Corrected KWT plus Phase 117; no overlap"], ["WEEKLY_ONLY", weeklySummary, weeklyByCourse.get(courseId) ?? [], "Verified THE_WEEKLY course-rating evidence only"], ["KWT_PLUS_WEEKLY", combined, [...(combinedKwtByCourse.get(courseId) ?? []), ...(weeklyByCourse.get(courseId) ?? [])], "Simulation only; Weekly excluded from personal indexes"]]
  for (const [model, summary, observations, note] of sourceModels) {
    courseRows.push({ course_id: courseId, difficulty: courseId.endsWith("_hard") ? "hard" : "easy", model, qualifying_rounds: summary.rounds, distinct_verified_players: summary.players, mean_score: round3(summary.mean), median_score: round3(summary.median), elite_benchmark: round3(summary.elite), simulated_course_rating: round3(summary.rating), simulated_slope: round3(summary.slope), maximum_player_concentration: round3(summary.maxPlayerShare), confidence_status: summary.status, confidence_reason: summary.reason, prior_phase104_rating: oldRating?.rating ?? "", prior_phase104_slope: oldRating?.slope ?? "", rating_delta_from_phase104: summary.rating === null || oldRating?.rating === null || oldRating?.rating === undefined ? "" : round3(summary.rating - oldRating.rating), slope_delta_from_phase104: summary.slope === null || oldRating?.slope === null || oldRating?.slope === undefined ? "" : round3(summary.slope - oldRating.slope), weekly_rows_in_model: model.includes("WEEKLY") ? observations.filter((row) => row.source === "THE_WEEKLY").length : 0, note })
  }
}

const readyCourseIds = new Set(courseRows.filter((row) => row.model === "KWT_PLUS_S14_W05_12" && row.confidence_status === "READY_CANDIDATE").map((row) => row.course_id))
function roundOrder(a, b) { return a.season - b.season || a.week - b.week || (a.difficulty === "easy" ? -1 : 1) - (b.difficulty === "easy" ? -1 : 1) || a.fingerprint.localeCompare(b.fingerprint) }
function calculateIndex(rows) {
  const eligible = rows.filter((row) => readyCourseIds.has(row.courseId) && completePairs.has(`${row.season}|${row.week}|${row.playerKey}`)).map((row) => {
    const course = courseRows.find((candidate) => candidate.model === "KWT_PLUS_S14_W05_12" && candidate.course_id === row.courseId)
    const differential = (row.score - Number(course.simulated_course_rating)) * REFERENCE_SLOPE / Number(course.simulated_slope)
    return { ...row, differential }
  }).filter((row) => Number.isFinite(row.differential))
  const grouped = new Map()
  for (const row of eligible) { const values = grouped.get(row.playerKey) ?? []; values.push(row); grouped.set(row.playerKey, values) }
  const result = new Map()
  for (const [playerKey, playerRows] of grouped) {
    const ordered = playerRows.slice().sort(roundOrder)
    const latestTen = ordered.slice(-10)
    const bestFive = latestTen.slice().sort((a, b) => a.differential - b.differential || a.fingerprint.localeCompare(b.fingerprint)).slice(0, 5)
    if (bestFive.length < 5) continue
    result.set(playerKey, { eligibleRounds: ordered.length, latestTen: latestTen.length, bestFive: bestFive.length, resultingIndex: round3(bestFive.reduce((sum, row) => sum + row.differential, 0) / bestFive.length), latestTenKeys: latestTen.map((row) => row.fingerprint), bestFiveKeys: bestFive.map((row) => row.fingerprint), chronology: "OFFICIAL_KWT_SEQUENCE" })
  }
  return result
}
const revisedPreview = calculateIndex([...historicalKwt, ...newKwt])
const playerIds = [...new Set([...oldIndexByPlayer.keys(), ...revisedPreview.keys()])].sort()
const playerRows = playerIds.map((playerKey) => {
  const oldValue = oldIndexByPlayer.get(playerKey) ?? null
  const revised = revisedPreview.get(playerKey)
  const newValue = revised?.resultingIndex ?? null
  const delta = oldValue === null || newValue === null ? null : round3(newValue - oldValue)
  return {
    canonical_player_id: playerKey,
    canonical_screen_name: canonicalName(playerKey),
    old_phase105_index: oldValue,
    old_golf_display: displayIndex(oldValue),
    revised_local_index: newValue,
    revised_golf_display: displayIndex(newValue),
    signed_delta: delta,
    absolute_change: delta === null ? null : Math.abs(delta),
    revised_eligible_rounds: revised?.eligibleRounds ?? 0,
    revised_latest_ten: revised?.latestTen ?? 0,
    revised_best_five: revised?.bestFive ?? 0,
    chronology_confidence: revised?.chronology ?? "UNAVAILABLE",
    weekly_rows_used: 0,
    status: revised ? "LOCAL_PREVIEW_ONLY" : "BLOCKED_OR_UNCHANGED",
    review_flag: revised && Math.abs(delta ?? 0) >= 1 ? "LARGE_MOVEMENT_REVIEW" : revised ? "NO_LARGE_MOVEMENT" : "BLOCKED_OR_INELIGIBLE",
  }
})

const blockedPlayers = playerRows.filter((row) => row.revised_local_index === null)
const changedPlayers = playerRows.filter((row) => row.signed_delta !== null && Math.abs(row.signed_delta) >= 0.01)
const largeMovements = playerRows.filter((row) => row.review_flag === "LARGE_MOVEMENT_REVIEW")
writeCsv(path.join(outputDir, "phase118_course_rating_comparison.csv"), courseRows)
writeCsv(path.join(outputDir, "phase118_player_index_comparison.csv"), playerRows)
writeCsv(path.join(outputDir, "phase118_exception_summary.csv"), [
  { type: "UNRESOLVED_PHASE117_PAIRS", count: 7, effect: "Excluded from KWT statistics and personal indexes" },
  { type: "INCOMPLETE_OR_DUPLICATE_KWT_PAIRS", count: incompletePairs.length, effect: "Excluded from personal indexes" },
  { type: "WEEKLY_DUPLICATE_FINGERPRINTS", count: weeklyDuplicates.length, effect: "Excluded from Weekly rating statistics" },
  { type: "WEEKLY_UNMAPPED_COURSE_ROWS", count: weeklyValid.length - weekly.length, effect: "Excluded from Weekly rating statistics" },
  { type: "BLOCKED_REVISED_PLAYERS", count: blockedPlayers.length, effect: "No local numeric index candidate" },
])

const courseReady = courseRows.filter((row) => row.model === "KWT_PLUS_S14_W05_12" && row.confidence_status === "READY_CANDIDATE").length
const courseProvisional = courseRows.filter((row) => row.model === "KWT_PLUS_S14_W05_12" && row.confidence_status === "PROVISIONAL").length
const courseUnratedOrBlocked = courseRows.filter((row) => row.model === "KWT_PLUS_S14_W05_12" && ["UNRATED", "BLOCKED_CONFIDENCE"].includes(row.confidence_status)).length
const report = `# Phase 118 updated KWT course-rating and player-index review

## Verified inputs

- Production postflight: **4 calculation runs, 28,672 provenance rows, 410 rating snapshots, 157 index snapshots, 844 THE_WEEKLY rows, zero publishable rows**.
- Historical corrected KWT source: **${historicalKwt.length}** rows from Phase 68.
- Phase 117 Season 14 Weeks 5–12 KWT source: **${newKwt.length}** rows; **${new Set(newKwt.map((row) => row.fingerprint)).size}** unique fingerprints; zero overlap with Phase 68.
- Combined KWT observations used: **${completeKwt.length}**.
- Weekly observations used for course-rating-only simulations: **${weekly.length}**; duplicate fingerprints excluded: **${weeklyDuplicates.length}**; personal-index rows used: **0**.
- Complete KWT player-week pairs: **${completePairs.size}**; incomplete/duplicate pairs excluded from personal indexes: **${incompletePairs.length}**.

## Revised KWT-only readiness

- READY_CANDIDATE: **${courseReady}**.
- PROVISIONAL: **${courseProvisional}**.
- UNRATED/BLOCKED_CONFIDENCE: **${courseUnratedOrBlocked}**.
- These are local simulations, not formal approvals. The six historically provisional entries remain ineligible unless the revised evidence independently satisfies all thresholds.

## Player-index comparison

- Baseline Phase 105 candidates: **${phase104Indexes.length}**.
- Revised local numeric candidates: **${revisedPreview.size}**.
- Blocked or ineligible players: **${blockedPlayers.length}**.
- Numeric movements at or above 0.01: **${changedPlayers.length}**.
- Movements at or above 1.00 index point requiring human review: **${largeMovements.length}**.
- All revised calculations use Candidate A with reference slope **${REFERENCE_SLOPE}**, KWT only, and Season → Week → Easy → Hard ordering. Weekly rows used: **0**.

## Interpretation

The comparison CSVs separate KWT-only, Weekly-only, and KWT+Weekly course models. Weekly source populations are never merged into personal identity or index calculations. A changed rating or index is a local evidence effect, not an approval decision. Any candidate with incomplete chronology, invalid rating, near-zero slope, concentration failure, unresolved identity, or missing qualifying rounds remains blocked.

## Formal status

**PARTIAL — LOCAL REVIEW READY, NOT PUBLISHABLE.** The corrected evidence is sufficient for deterministic local comparison, but formal rating approval, diagnostic dispositions, effective-period approval, and index publication remain separate gates. No Production rows were changed and no DRAFT/QUARANTINED package was installed.
`
fs.writeFileSync(path.join(outputDir, "phase118_review_report.md"), report, "utf8")
const manifest = { schemaVersion: "phase118-updated-handicap-review-v1", productionProject: "jfbndcwdsvsjgnzwvexp", phase117RunId: "9a9a4bc4-e43d-55d4-84fb-a83c0b757681", sourceZipSha256: SOURCE_ZIP_SHA256, phase117ManifestSha256: PHASE117_MANIFEST_SHA256, modelVersion: MODEL_VERSION, referenceSlope: REFERENCE_SLOPE, inputs: { phase68: sha256(phase68Path), phase117: sha256(phase117Path), weekly: sha256(weeklyPath), phase104Ratings: sha256(phase104RatingPath), phase104Indexes: sha256(phase104IndexPath), canonicalNames: sha256(canonicalNamesPath) }, counts: { historicalKwtRows: historicalKwt.length, newKwtRows: newKwt.length, combinedKwtRows: completeKwt.length, weeklyRows: weekly.length, completePairs: completePairs.size, incompletePairs: incompletePairs.length, oldIndexCandidates: phase104Indexes.length, revisedIndexCandidates: revisedPreview.size, blockedPlayers: blockedPlayers.length, readyCourseCandidates: courseReady, provisionalCourseCandidates: courseProvisional, blockedOrUnratedCourseCandidates: courseUnratedOrBlocked, largeIndexMovements: largeMovements.length }, outputChecksums: { courseComparison: sha256(path.join(outputDir, "phase118_course_rating_comparison.csv")), playerComparison: sha256(path.join(outputDir, "phase118_player_index_comparison.csv")), exceptions: sha256(path.join(outputDir, "phase118_exception_summary.csv")), report: sha256(path.join(outputDir, "phase118_review_report.md")) }, status: "LOCAL_ONLY_DRAFT_QUARANTINED_NOT_FOR_PUBLICATION" }
fs.writeFileSync(path.join(outputDir, "phase118_package_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
console.log(JSON.stringify(manifest, null, 2))
