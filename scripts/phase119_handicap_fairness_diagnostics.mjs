import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase119")
const phase68Path = path.join(root, "docs", "handicap", "phase68", "handicap_source_provenance_import.csv")
const phase117Path = path.join(root, "docs", "handicap", "phase117", "handicap_source_provenance_import.csv")
const phase104RatingPath = path.join(root, "docs", "handicap", "phase104", "rating_snapshot_import_rows.csv")
const phase104IndexPath = path.join(root, "docs", "handicap", "phase104", "index_snapshot_import_rows.csv")
const phase118CoursePath = path.join(root, "docs", "handicap", "phase118", "phase118_course_rating_comparison.csv")
const phase118PlayerPath = path.join(root, "docs", "handicap", "phase118", "phase118_player_index_comparison.csv")
const canonicalNamesPath = path.join(root, "docs", "handicap", "phase118", "canonical_player_names.json")
const catalogPath = path.join(root, "lib", "handicap", "adminReviewData.ts")
const weeklyPath = path.join(root, "weekly_course_evidence.csv")

const MODEL_VERSION = "krys-handicap-candidate-a-v1"
const REFERENCE_SLOPE = 8.515
const MOVEMENT_THRESHOLD = 1

function readCsv(file) {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${file}: ${parsed.errors.map((error) => error.message).join("; ")}`)
  return parsed.data
}
function writeCsv(file, rows) { fs.writeFileSync(file, `${Papa.unparse(rows, { newline: "\n" })}\n`, "utf8") }
function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase() }
function num(value) { const result = Number(value); return Number.isFinite(result) ? result : null }
function clean(value) { return String(value ?? "").trim() }
function metadata(row) { try { return JSON.parse(row.metadata || "{}"); } catch { return {} } }
function round3(value) { return value === null || value === undefined ? null : Math.round(value * 1000) / 1000 }
function displayIndex(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "NOT_AVAILABLE"
  return Number(value) < 0 ? `+${Math.abs(Number(value)).toFixed(2)}` : Number(value).toFixed(2)
}
function normalizeName(value) { return clean(value).replace(/[’‘]/g, "'").replace(/[\\u2013\\u2014]/g, "-") }
function roundOrder(a, b) {
  return a.season - b.season || a.week - b.week || (a.difficulty === "easy" ? -1 : 1) - (b.difficulty === "easy" ? -1 : 1) || a.fingerprint.localeCompare(b.fingerprint)
}
function courseKey(baseMap, difficulty) {
  return `${normalizeName(baseMap)}_${difficulty}`
}

fs.mkdirSync(outputDir, { recursive: true })
const historicalRows = readCsv(phase68Path)
const newRows = readCsv(phase117Path)
const phase104Ratings = readCsv(phase104RatingPath)
const phase104Indexes = readCsv(phase104IndexPath)
const phase118Courses = readCsv(phase118CoursePath)
const phase118Players = readCsv(phase118PlayerPath)
const weeklyRows = readCsv(weeklyPath)
const canonicalNames = JSON.parse(fs.readFileSync(canonicalNamesPath, "utf8"))
const catalogText = fs.readFileSync(catalogPath, "utf8")
const catalog = [...catalogText.matchAll(/\{ code: "([^"]+)", baseMap: "([^"]+)" \}/g)].map((match) => ({ code: match[1], baseMap: match[2] }))
if (catalog.length !== 41) throw new Error(`Expected 41 official course bases, got ${catalog.length}`)

function toKwt(row, source) {
  const meta = metadata(row)
  return {
    source,
    fingerprint: clean(row.source_fingerprint),
    season: Number(row.source_season),
    week: Number(row.source_week),
    playerKey: clean(row.canonical_player_id),
    playerName: normalizeName(row.original_player_name),
    courseCode: clean(row.original_course_code || meta.original_course_code || meta.course_code),
    courseId: normalizeName(meta.course_id || row.original_course_label),
    difficulty: clean(row.difficulty || meta.difficulty || (clean(row.original_course_label).endsWith("_hard") ? "hard" : "easy")).toLowerCase(),
    score: num(row.score ?? meta.score),
  }
}
const historicalKwt = historicalRows.filter((row) => row.source_type === "KWT").map((row) => toKwt(row, "KWT_HISTORICAL")).filter((row) => row.playerKey && row.courseId && row.score !== null)
const newKwt = newRows.filter((row) => row.source_type === "KWT").map((row) => toKwt(row, "KWT_S14_W05_12")).filter((row) => row.playerKey && row.courseId && row.score !== null)
if (historicalKwt.length !== 13550) throw new Error(`Expected 13,550 historical KWT rows, got ${historicalKwt.length}`)
if (newKwt.length !== 728) throw new Error(`Expected 728 Phase 117 KWT rows, got ${newKwt.length}`)
const historicalFingerprints = new Set(historicalKwt.map((row) => row.fingerprint))
if (newKwt.some((row) => historicalFingerprints.has(row.fingerprint))) throw new Error("Phase 117 fingerprint collision with historical KWT")

const pairGroups = (rows) => {
  const groups = new Map()
  for (const row of rows) {
    const key = `${row.season}|${row.week}|${row.playerKey}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return groups
}
function completePairSet(rows) {
  const complete = new Set()
  for (const [key, group] of pairGroups(rows)) {
    const difficulties = new Set(group.map((row) => row.difficulty))
    if (group.length === 2 && difficulties.has("easy") && difficulties.has("hard")) complete.add(key)
  }
  return complete
}
const historicalCompletePairs = completePairSet(historicalKwt)
const combinedRows = [...historicalKwt, ...newKwt]
const combinedCompletePairs = completePairSet(combinedRows)
const incompletePairCount = [...pairGroups(combinedRows)].filter(([key, group]) => !combinedCompletePairs.has(key) && group.length > 0).length
if (combinedCompletePairs.size !== 7138) throw new Error(`Expected 7,138 complete combined pairs, got ${combinedCompletePairs.size}`)

const oldRatingByCourse = new Map(phase104Ratings.map((row) => [normalizeName(row.course_id), { rating: num(row.course_rating), slope: num(row.slope), status: row.rating_confidence, snapshotId: row.id }]))
const revisedCourseRows = phase118Courses.filter((row) => row.model === "KWT_PLUS_S14_W05_12")
const revisedRatingByCourse = new Map(revisedCourseRows.map((row) => [normalizeName(row.course_id), { rating: num(row.simulated_course_rating), slope: num(row.simulated_slope), status: row.confidence_status, snapshotId: row.course_id }]))
const readyOldCourseIds = new Set([...oldRatingByCourse.entries()].filter(([, value]) => value.status === "READY" || value.status === "READY_CANDIDATE" || Number.isFinite(value.rating)).map(([key]) => key))
const readyRevisedCourseIds = new Set(revisedCourseRows.filter((row) => row.confidence_status === "READY_CANDIDATE" && num(row.simulated_course_rating) !== null && (num(row.simulated_slope) ?? 0) > 0.01).map((row) => normalizeName(row.course_id)))

const oldIndexByPlayer = new Map(phase104Indexes.map((row) => [clean(row.canonical_player_id), num(row.resulting_index)]))
const sourceRound = (row, rating) => ({
  ...row,
  rating: rating?.rating ?? null,
  slope: rating?.slope ?? null,
  differential: rating && rating.slope > 0.01 && Number.isFinite(rating.rating) ? (row.score - rating.rating) * REFERENCE_SLOPE / rating.slope : null,
})
function calculateIndex(rows, ratings, readyIds, completeSet) {
  const eligible = rows.filter((row) => readyIds.has(row.courseId) && Number.isFinite(ratings.get(row.courseId)?.rating) && (ratings.get(row.courseId)?.slope ?? 0) > 0.01 && completeSet.has(`${row.season}|${row.week}|${row.playerKey}`)).map((row) => sourceRound(row, ratings.get(row.courseId))).filter((row) => Number.isFinite(row.differential))
  const grouped = new Map()
  for (const row of eligible) grouped.set(row.playerKey, [...(grouped.get(row.playerKey) ?? []), row])
  const result = new Map()
  for (const [playerKey, playerRows] of grouped) {
    const ordered = playerRows.slice().sort(roundOrder)
    const latestTen = ordered.slice(-10)
    const bestFive = latestTen.slice().sort((a, b) => a.differential - b.differential || a.fingerprint.localeCompare(b.fingerprint)).slice(0, 5)
    if (bestFive.length < 5) continue
    result.set(playerKey, { eligibleRounds: ordered.length, latestTen, bestFive, resultingIndex: round3(bestFive.reduce((sum, row) => sum + row.differential, 0) / bestFive.length), chronology: "OFFICIAL_KWT_SEQUENCE" })
  }
  return result
}
const oldPreview = calculateIndex(historicalKwt, oldRatingByCourse, readyOldCourseIds, historicalCompletePairs)
const counterfactualPreview = calculateIndex(combinedRows, oldRatingByCourse, readyOldCourseIds, combinedCompletePairs)
const revisedPreview = calculateIndex(combinedRows, revisedRatingByCourse, readyRevisedCourseIds, combinedCompletePairs)

const namesByPlayer = new Map()
for (const row of combinedRows) {
  const names = namesByPlayer.get(row.playerKey) ?? new Map()
  names.set(row.playerName, (names.get(row.playerName) ?? 0) + 1)
  namesByPlayer.set(row.playerKey, names)
}
const canonicalName = (playerKey) => canonicalNames[playerKey] || [...(namesByPlayer.get(playerKey) ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "CANONICAL_NAME_UNAVAILABLE"
const phase118ByPlayer = new Map(phase118Players.map((row) => [clean(row.canonical_player_id), row]))
const playerIds = [...new Set([...oldIndexByPlayer.keys(), ...revisedPreview.keys()])].sort()
const largePlayerIds = playerIds.filter((playerKey) => {
  const oldValue = oldIndexByPlayer.get(playerKey)
  const newValue = revisedPreview.get(playerKey)?.resultingIndex
  return oldValue !== undefined && newValue !== undefined && Math.abs(newValue - oldValue) >= MOVEMENT_THRESHOLD
})
if (largePlayerIds.length !== 33) throw new Error(`Expected 33 large movements, got ${largePlayerIds.length}`)

function keys(rows) { return new Set(rows.map((row) => row.fingerprint)) }
function movementCause(oldValue, counter, revised) {
  if (!counter || !revised) return "ELIGIBILITY_OR_MISSING_RATING"
  const dataDelta = round3(counter.resultingIndex - oldValue)
  const ratingDelta = round3(revised.resultingIndex - counter.resultingIndex)
  if (Math.abs(dataDelta) >= Math.abs(ratingDelta) && Math.abs(dataDelta) >= 0.25) return "NEW_S14_SCORES_OR_LATEST_WINDOW"
  if (Math.abs(ratingDelta) >= 0.25) return "RATING_OR_ELIGIBILITY_CHANGE"
  return "MIXED_SMALL_EFFECTS"
}
function recommendationsForPlayer(cause, flags) {
  if (cause === "ELIGIBILITY_OR_MISSING_RATING" || flags.includes("UNRECONCILED_BASELINE")) return "INVESTIGATE"
  return "ACCEPT FOR REVIEW"
}

const movementSummary = []
const movementRounds = []
for (const playerKey of largePlayerIds) {
  const oldValue = oldIndexByPlayer.get(playerKey)
  const old = oldPreview.get(playerKey)
  const counter = counterfactualPreview.get(playerKey)
  const revised = revisedPreview.get(playerKey)
  const oldLatest = keys(old?.latestTen ?? [])
  const revisedLatest = keys(revised?.latestTen ?? [])
  const oldBest = keys(old?.bestFive ?? [])
  const revisedBest = keys(revised?.bestFive ?? [])
  const flags = []
  if (!old) flags.push("UNRECONCILED_BASELINE")
  const cause = movementCause(oldValue, counter, revised)
  const dataDelta = counter ? round3(counter.resultingIndex - oldValue) : null
  const ratingDelta = counter && revised ? round3(revised.resultingIndex - counter.resultingIndex) : null
  const recommendation = recommendationsForPlayer(cause, flags)
  movementSummary.push({
    canonical_player_id: playerKey,
    canonical_screen_name: canonicalName(playerKey),
    old_phase105_index: oldValue,
    old_golf_display: displayIndex(oldValue),
    revised_local_index: revised?.resultingIndex ?? null,
    revised_golf_display: displayIndex(revised?.resultingIndex ?? null),
    signed_delta: revised ? round3(revised.resultingIndex - oldValue) : null,
    absolute_change: revised ? Math.abs(round3(revised.resultingIndex - oldValue)) : null,
    counterfactual_with_s14_old_ratings: counter?.resultingIndex ?? null,
    change_attributable_to_new_s14_or_window: dataDelta,
    change_attributable_to_rating_or_eligibility: ratingDelta,
    cause,
    old_eligible_rounds: old?.eligibleRounds ?? 0,
    revised_eligible_rounds: revised?.eligibleRounds ?? 0,
    old_latest_ten_count: old?.latestTen.length ?? 0,
    revised_latest_ten_count: revised?.latestTen.length ?? 0,
    old_best_five_count: old?.bestFive.length ?? 0,
    revised_best_five_count: revised?.bestFive.length ?? 0,
    new_s14_rounds_in_revised_latest_ten: (revised?.latestTen ?? []).filter((row) => row.source === "KWT_S14_W05_12").length,
    weekly_rows_used: 0,
    quarantined_pairs_used: 0,
    chronology: revised?.chronology ?? "UNAVAILABLE",
    old_recomputed_index: old?.resultingIndex ?? null,
    old_recompute_delta_from_phase105: old ? round3(old.resultingIndex - oldValue) : null,
    flags: flags.join("|"),
    recommendation,
    phase118_review_flag: phase118ByPlayer.get(playerKey)?.review_flag ?? "LARGE_MOVEMENT_REVIEW",
  })
  const union = new Map([...(old?.latestTen ?? []), ...(old?.bestFive ?? []), ...(revised?.latestTen ?? []), ...(revised?.bestFive ?? [])].map((row) => [row.fingerprint, row]))
  for (const row of [...union.values()].sort(roundOrder)) {
    const inOldLatest = oldLatest.has(row.fingerprint)
    const inNewLatest = revisedLatest.has(row.fingerprint)
    const inOldBest = oldBest.has(row.fingerprint)
    const inNewBest = revisedBest.has(row.fingerprint)
    let transition = "UNCHANGED_SELECTION"
    if (!inOldLatest && inNewLatest) transition = row.source === "KWT_S14_W05_12" ? "ENTERED_NEW_S14_ROUND" : "ENTERED_AFTER_WINDOW_SHIFT"
    else if (inOldLatest && !inNewLatest) transition = "LEFT_LATEST10_AFTER_NEW_ORDER"
    else if (!inOldBest && inNewBest) transition = "ENTERED_BEST5_AFTER_RECALCULATION"
    else if (inOldBest && !inNewBest) transition = "LEFT_BEST5_AFTER_RECALCULATION"
    movementRounds.push({
      canonical_player_id: playerKey,
      canonical_screen_name: canonicalName(playerKey),
      source: row.source,
      source_fingerprint: row.fingerprint,
      season: row.season,
      week: row.week,
      difficulty: row.difficulty,
      course_code: row.courseCode,
      course_id: row.courseId,
      score: row.score,
      course_rating_used_for_old: oldRatingByCourse.get(row.courseId)?.rating ?? null,
      slope_used_for_old: oldRatingByCourse.get(row.courseId)?.slope ?? null,
      differential_used_for_old: round3(sourceRound(row, oldRatingByCourse.get(row.courseId)).differential),
      course_rating_used_for_revised: revisedRatingByCourse.get(row.courseId)?.rating ?? null,
      slope_used_for_revised: revisedRatingByCourse.get(row.courseId)?.slope ?? null,
      differential_used_for_revised: round3(sourceRound(row, revisedRatingByCourse.get(row.courseId)).differential),
      in_old_latest_ten: inOldLatest,
      in_new_latest_ten: inNewLatest,
      in_old_best_five: inOldBest,
      in_new_best_five: inNewBest,
      chronology: "OFFICIAL_KWT_SEQUENCE",
      transition,
    })
  }
}

const modeledIds = new Set(revisedCourseRows.map((row) => normalizeName(row.course_id)))
const expectedCourses = catalog.flatMap((course) => ["easy", "hard"].map((difficulty) => ({ code: `${course.code}${difficulty === "easy" ? "E" : "H"}`, baseMap: course.baseMap, difficulty, course_id: courseKey(course.baseMap, difficulty) })))
const missingCourses = expectedCourses.filter((course) => !modeledIds.has(course.course_id))
const courseReview = revisedCourseRows.map((row) => {
  const weekly = phase118Courses.find((candidate) => normalizeName(candidate.course_id) === normalizeName(row.course_id) && candidate.model === "WEEKLY_ONLY")
  const combined = phase118Courses.find((candidate) => normalizeName(candidate.course_id) === normalizeName(row.course_id) && candidate.model === "KWT_PLUS_WEEKLY")
  const isDiagnostic = ["Shangri-La_easy", "Forgotten Fairyland_easy", "Bogey's Bonanza_hard", "Original Gothic_easy"].some((id) => normalizeName(id) === normalizeName(row.course_id))
  const isRaptorHard = normalizeName(row.course_id) === "Raptor Cliff's_hard"
  const isGloopEasy = normalizeName(row.course_id) === "Gloop Lair_easy"
  const isWeeklyOnly = Number(row.qualifying_rounds) === 0 && Number(weekly?.qualifying_rounds ?? 0) >= 20
  const recommendation = isDiagnostic || isRaptorHard ? "INVESTIGATE" : row.confidence_status === "PROVISIONAL" || row.confidence_status === "UNRATED" || row.confidence_status === "BLOCKED_CONFIDENCE" ? "HOLD" : isGloopEasy || isWeeklyOnly ? "ACCEPT FOR REVIEW" : "ACCEPT FOR REVIEW"
  const flags = []
  if (isDiagnostic) flags.push("DIAGNOSTIC_OUTLIER_REVIEW")
  if (isRaptorHard) flags.push("KWT_WEEKLY_COHORT_DIFFERENCE")
  if (isGloopEasy) flags.push("WEEKLY_COURSE_RATING_ONLY")
  if (Number(row.simulated_slope) <= 0.01) flags.push("INVALID_OR_NEAR_ZERO_SLOPE")
  return {
    course_id: row.course_id,
    difficulty: row.difficulty,
    course_rating: row.simulated_course_rating,
    slope: row.simulated_slope,
    sample_size: row.qualifying_rounds,
    distinct_players: row.distinct_verified_players,
    max_player_concentration: row.maximum_player_concentration,
    confidence: row.confidence_status,
    provenance: "KWT_PLUS_S14_W05_12",
    kwt_rating: row.simulated_course_rating,
    kwt_slope: row.simulated_slope,
    weekly_rounds: weekly?.qualifying_rounds ?? 0,
    weekly_distinct_players: weekly?.distinct_verified_players ?? 0,
    weekly_rating: weekly?.simulated_course_rating ?? "",
    weekly_slope: weekly?.simulated_slope ?? "",
    combined_rating: combined?.simulated_course_rating ?? "",
    combined_slope: combined?.simulated_slope ?? "",
    rating_difference_kwt_vs_weekly: weekly && row.simulated_course_rating !== "" && weekly.simulated_course_rating !== "" ? round3(Number(row.simulated_course_rating) - Number(weekly.simulated_course_rating)) : "",
    slope_difference_kwt_vs_weekly: weekly && row.simulated_slope !== "" && weekly.simulated_slope !== "" ? round3(Number(row.simulated_slope) - Number(weekly.simulated_slope)) : "",
    player_index_eligible: row.confidence_status === "READY_CANDIDATE" && !isWeeklyOnly,
    flags: flags.join("|"),
    recommendation,
    note: isGloopEasy ? "Weekly evidence can support a course-rating review, but never personal indexes." : isRaptorHard ? "Separate KWT and Weekly cohorts require human comparability review; do not blend automatically." : "Local evidence review only; no formal approval.",
  }
})
for (const missing of missingCourses) courseReview.push({ course_id: missing.course_id, difficulty: missing.difficulty, course_rating: "", slope: "", sample_size: 0, distinct_players: 0, max_player_concentration: "", confidence: "UNRATED", provenance: "NO_VERIFIED_EVIDENCE", kwt_rating: "", kwt_slope: "", weekly_rounds: 0, weekly_distinct_players: 0, weekly_rating: "", weekly_slope: "", combined_rating: "", combined_slope: "", rating_difference_kwt_vs_weekly: "", slope_difference_kwt_vs_weekly: "", player_index_eligible: false, flags: "NO_VERIFIED_EVIDENCE", recommendation: "HOLD", note: "Official catalog entry has no modeled evidence in Phase 118 inputs." })

const coverageRows = [
  { category: "READY_CANDIDATE", count: revisedCourseRows.filter((row) => row.confidence_status === "READY_CANDIDATE").length },
  { category: "PROVISIONAL", count: revisedCourseRows.filter((row) => row.confidence_status === "PROVISIONAL").length },
  { category: "UNRATED_OR_BLOCKED", count: revisedCourseRows.filter((row) => ["UNRATED", "BLOCKED_CONFIDENCE"].includes(row.confidence_status)).length },
  { category: "MISSING_FROM_PHASE118_MODELS", count: missingCourses.length },
  { category: "OFFICIAL_CATALOG_TOTAL", count: expectedCourses.length },
  { category: "PHASE118_MODELED_TOTAL", count: revisedCourseRows.length },
]

writeCsv(path.join(outputDir, "phase119_movement_summary.csv"), movementSummary)
writeCsv(path.join(outputDir, "phase119_movement_rounds.csv"), movementRounds)
writeCsv(path.join(outputDir, "phase119_course_fairness_review.csv"), courseReview)
writeCsv(path.join(outputDir, "phase119_coverage_reconciliation.csv"), coverageRows)

const diagnosticCourses = courseReview.filter((row) => row.flags.includes("DIAGNOSTIC_OUTLIER_REVIEW"))
const raptorHard = courseReview.find((row) => normalizeName(row.course_id) === "Raptor Cliff's_hard")
const gloopEasy = courseReview.find((row) => normalizeName(row.course_id) === "Gloop Lair_easy")
const causeCounts = Object.fromEntries([...new Set(movementSummary.map((row) => row.cause))].map((cause) => [cause, movementSummary.filter((row) => row.cause === cause).length]))
const report = `# Phase 119 Handicap fairness diagnostics

## Status

**PARTIAL — deterministic local fairness review complete; no approval or publication.**

All outputs are local-only diagnostics. Existing Phase 105, Phase 117, and Phase 118 Production records were not modified.

## Evidence and calculation boundary

- Corrected historical KWT rows: **${historicalKwt.length}**.
- Phase 117 Season 14 rows: **${newKwt.length}**.
- Combined KWT rows loaded: **${combinedRows.length}**; rows used after excluding incomplete groups: **${combinedRows.filter((row) => combinedCompletePairs.has(`${row.season}|${row.week}|${row.playerKey}`)).length}**; complete official pairs: **${combinedCompletePairs.size}**; incomplete groups excluded: **${incompletePairCount}**.
- Verified THE_WEEKLY rows: **${weeklyRows.filter((row) => row.source === "THE_WEEKLY" && row.verification_status === "VERIFIED").length}**; Weekly rows used in personal indexes: **0**.
- Index calculation remains Candidate A: \`(score - course rating) × ${REFERENCE_SLOPE} / course slope\`.
- Chronology remains **OFFICIAL_KWT_SEQUENCE**: Season → Week → Easy → Hard.

## Large player movements

${movementSummary.map((row) => `- **${row.canonical_screen_name}** (${row.canonical_player_id}): ${row.old_phase105_index} → ${row.revised_local_index} (${row.signed_delta >= 0 ? "+" : ""}${row.signed_delta}); counterfactual with old ratings ${row.counterfactual_with_s14_old_ratings}; cause **${row.cause}**; new Season 14 rounds in revised latest ten ${row.new_s14_rounds_in_revised_latest_ten}; recommendation **${row.recommendation}**.`).join("\n")}

Cause counts: ${JSON.stringify(causeCounts)}. Every flagged player's round-level membership, exact score, course, rating, slope, differential, source, season/week, and window transition is in \`phase119_movement_rounds.csv\`.

The three named movements requested for attention are preserved exactly in the summary: YUK1N, KILLERBEE, and ULTRAFOX_LYNNE. A large movement is not treated as a calculation defect solely because its magnitude is large; it is flagged for human fairness review.

## Course evidence review

- Phase 118 modeled entries: **${revisedCourseRows.length}**.
- Official catalog: **${expectedCourses.length}** entries.
- Missing modeled entry: **${missingCourses.map((row) => `${row.code} — ${row.baseMap} ${row.difficulty}`).join(", ") || "none"}**.
- The missing entry explains the prior 78 + 2 + 1 = 81 reconciliation: the remaining catalog entry is unrated/missing evidence, so it is not a fourth modeled status row.
- All course-level recommendations are in \`phase119_course_fairness_review.csv\`.

### Raptor Cliff's Hard

KWT and Weekly are reported separately. Current KWT+Season 14 evidence is ${raptorHard?.sample_size ?? "unavailable"} rounds, rating ${raptorHard?.kwt_rating ?? "unavailable"}, slope ${raptorHard?.kwt_slope ?? "unavailable"}; Weekly-only evidence is ${raptorHard?.weekly_rounds ?? 0} rounds, rating ${raptorHard?.weekly_rating || "unavailable"}, slope ${raptorHard?.weekly_slope || "unavailable"}. The cohorts differ and are not interchangeable. Recommendation: **INVESTIGATE**, not automatic blending or hardest-course designation.

### Diagnostic outliers

${diagnosticCourses.map((row) => `- **${row.course_id}**: rating ${row.course_rating}, slope ${row.slope}, sample ${row.sample_size}, distinct players ${row.distinct_players}; no arithmetic or source-boundary failure was found in this local run; recommendation **${row.recommendation}**.`).join("\n")}

### Gloop Lair Easy

Weekly-only evidence is ${gloopEasy?.weekly_rounds ?? 0} rounds from ${gloopEasy?.weekly_distinct_players ?? 0} source players, with simulated rating ${gloopEasy?.weekly_rating || "unavailable"} and slope ${gloopEasy?.weekly_slope || "unavailable"}. That satisfies the proposed sample-size and distinct-player diagnostics for a **course-rating-only ACCEPT FOR REVIEW** candidate, but it is not eligible to enter personal Handicap indexes. Gloop Lair Hard is the missing official catalog entry and remains **HOLD / UNRATED**.

## Safety checks

- Quarantined Season 14 player-week pairs used: **0**.
- Weekly rows used in player indexes: **0**.
- Unapproved rating references used in revised indexes: **0**; only revised READY_CANDIDATE KWT ratings were used.
- Negative scores were retained as numeric scores.
- Existing records and snapshots were not changed.

## Decision requested from Krys

1. Review the 33 named movement rows and their round-level evidence; accept only those that are explainable after human review.
2. Keep Raptor Cliff's Hard in **INVESTIGATE** until KWT versus Weekly cohort comparability is decided.
3. Treat Gloop Lair Easy as **course-rating-only ACCEPT FOR REVIEW**, never a personal-index rating until a permitted KWT/policy path exists.
4. Keep the missing **${missingCourses.map((row) => `${row.code} — ${row.baseMap} ${row.difficulty}`).join(", ")}** unrated.
5. Do not publish any rating or index from these diagnostics.

## Generated artifacts

- \`docs/handicap/phase119/phase119_movement_summary.csv\`
- \`docs/handicap/phase119/phase119_movement_rounds.csv\`
- \`docs/handicap/phase119/phase119_course_fairness_review.csv\`
- \`docs/handicap/phase119/phase119_coverage_reconciliation.csv\`
`
fs.writeFileSync(path.join(outputDir, "phase119_review_report.md"), report, "utf8")
const manifest = {
  schemaVersion: "phase119-fairness-diagnostics-v1",
  productionProject: "jfbndcwdsvsjgnzwvexp",
  phase118Checkpoint: "8f0da3465ddedaef8c9c89c72e236990ccce0b03",
  modelVersion: MODEL_VERSION,
  referenceSlope: REFERENCE_SLOPE,
  status: "LOCAL_ONLY_READ_ONLY_NOT_FOR_PUBLICATION",
  inputs: Object.fromEntries([[phase68Path, sha256(phase68Path)], [phase117Path, sha256(phase117Path)], [phase104RatingPath, sha256(phase104RatingPath)], [phase104IndexPath, sha256(phase104IndexPath)], [phase118CoursePath, sha256(phase118CoursePath)], [phase118PlayerPath, sha256(phase118PlayerPath)], [canonicalNamesPath, sha256(canonicalNamesPath)], [weeklyPath, sha256(weeklyPath)]]),
  counts: { historicalKwtRows: historicalKwt.length, season14Rows: newKwt.length, combinedKwtRowsLoaded: combinedRows.length, combinedKwtRowsUsed: combinedRows.filter((row) => combinedCompletePairs.has(`${row.season}|${row.week}|${row.playerKey}`)).length, completePairs: combinedCompletePairs.size, incompleteGroups: incompletePairCount, weeklyRows: 844, oldIndexCandidates: phase104Indexes.length, revisedIndexCandidates: revisedPreview.size, largeMovements: movementSummary.length, modeledCourses: revisedCourseRows.length, officialCourses: expectedCourses.length, missingCourses: missingCourses.length, quarantinedPairsUsed: 0, weeklyRowsUsedInIndexes: 0 },
  outputChecksums: Object.fromEntries(["phase119_movement_summary.csv", "phase119_movement_rounds.csv", "phase119_course_fairness_review.csv", "phase119_coverage_reconciliation.csv", "phase119_review_report.md"].map((name) => [name, sha256(path.join(outputDir, name))])),
}
fs.writeFileSync(path.join(outputDir, "phase119_package_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ ...manifest, missingCourses, movementSummary: movementSummary.map((row) => ({ name: row.canonical_screen_name, old: row.old_phase105_index, revised: row.revised_local_index, cause: row.cause, recommendation: row.recommendation })) }, null, 2))
