import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import Papa from "papaparse"
import {
  decodeCsvBytes,
  localEvidenceKey,
  parseCsvText,
  reconcileKwtWeek,
  weekFromEvent,
} from "../lib/handicap/phase111Reconciliation.ts"

const inputDir = process.env.KWT_PHASE111_INPUT_DIR || path.join(process.cwd(), ".local", "phase111-kwt-s14w05-12")
const outputDir = process.env.KWT_PHASE111_OUTPUT_DIR || path.join(process.cwd(), "docs", "handicap", "phase111")
const provenanceFile = path.join(process.cwd(), "docs", "handicap", "phase68", "handicap_source_provenance_import.csv")
const weeklyFile = path.join(process.cwd(), "weekly_course_evidence.csv")

function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase() }
function writeCsv(fileName, rows, columns) {
  fs.writeFileSync(path.join(outputDir, fileName), Papa.unparse(rows, { columns, newline: "\n" }) + "\n", "utf8")
}
function readCsv(fileName) {
  const bytes = fs.readFileSync(path.join(inputDir, fileName))
  const decoded = decodeCsvBytes(bytes)
  const parsed = parseCsvText(decoded.text, decoded.encoding)
  if (parsed.errors.length) throw new Error(`${fileName}: ${parsed.errors.join("; ")}`)
  return { ...parsed, bytes, sha256: sha256(bytes), fileName }
}
function fileNames() {
  return fs.readdirSync(inputDir).filter((file) => file.toLowerCase().endsWith(".csv")).sort((a, b) => a.localeCompare(b))
}
function sourceWeek(file) {
  const match = /^kwt14w(\d+)_ful_results(?:\(1\))?\.csv$/i.exec(file)
  if (match) return Number(match[1])
  return null
}
function clean(value) { return String(value ?? "").trim() }
function csvRows(fileName) {
  const text = fs.readFileSync(fileName, "utf8")
  const result = Papa.parse(text, { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${fileName}: ${result.errors.map((e) => e.message).join("; ")}`)
  return result.data
}
function json(value) { return JSON.stringify(value) }

fs.mkdirSync(outputDir, { recursive: true })
const names = fileNames()
const detailed = names.filter((file) => /^kwt14w\d+_ful_results/i.test(file))
const summaries = names.filter((file) => /^weekly_results/i.test(file))
if (detailed.length !== 8 || summaries.length !== 8) throw new Error(`Expected 8 detail and 8 summary files; got ${detailed.length}/${summaries.length}`)

const parsedFiles = new Map(names.map((file) => [file, readCsv(file)]))
const manifestRows = names.map((file) => {
  const parsed = parsedFiles.get(file)
  const internalEvents = parsed.rows.map((row) => row.Week).filter(Boolean).map(weekFromEvent).filter(Boolean)
  return {
    file: file,
    sha256: parsed.sha256,
    bytes: parsed.bytes.length,
    encoding: parsed.encoding,
    row_count: parsed.rows.length,
    internal_event_ids: [...new Set(internalEvents.map((event) => event.eventId))].join(";"),
    source_week_from_filename: sourceWeek(file) ?? "",
    parse_errors: parsed.errors.join(";"),
  }
})
writeCsv("phase111_source_manifest.csv", manifestRows, Object.keys(manifestRows[0]))

const detailByWeek = new Map(detailed.map((file) => [sourceWeek(file), file]))
const summaryByWeek = new Map()
for (const file of summaries) {
  const parsed = parsedFiles.get(file)
  const event = parsed.rows.map((row) => weekFromEvent(row.Week)).find(Boolean)
  if (!event) throw new Error(`${file}: missing KWT14Wxx Week value`)
  if (summaryByWeek.has(event.week)) throw new Error(`Duplicate summary week ${event.week}`)
  summaryByWeek.set(event.week, file)
}

const pairRows = []
for (let week = 5; week <= 12; week += 1) {
  const detailFile = detailByWeek.get(week)
  const summaryFile = summaryByWeek.get(week)
  if (!detailFile || !summaryFile) throw new Error(`Missing pair for week ${week}`)
  const result = reconcileKwtWeek({
    detailFile,
    summaryFile,
    detailRows: parsedFiles.get(detailFile).rows,
    summaryRows: parsedFiles.get(summaryFile).rows,
  })
  pairRows.push(...result)
}

const provenanceRows = csvRows(provenanceFile)
const exactNameToIds = new Map()
for (const row of provenanceRows.filter((row) => row.source_type === "KWT")) {
  const name = clean(row.original_player_name)
  const id = clean(row.canonical_player_id)
  if (!name || !id) continue
  const set = exactNameToIds.get(name) ?? new Set()
  set.add(id)
  exactNameToIds.set(name, set)
}
const existingWeeks = new Set(provenanceRows.filter((row) => row.source_type === "KWT" && row.source_season === "14" && Number(row.source_week) >= 5 && Number(row.source_week) <= 12).map((row) => `${row.source_week}|${row.original_player_name}`))
const pairKeyCounts = new Map()
for (const row of pairRows) {
  const key = `${row.week}|${row.player}`
  pairKeyCounts.set(key, (pairKeyCounts.get(key) ?? 0) + 1)
}
const duplicatePairGroups = [...pairKeyCounts.values()].filter((count) => count > 1).length
const enriched = pairRows.map((row) => {
  const ids = [...(exactNameToIds.get(row.player) ?? [])]
  const canonicalStatus = ids.length === 1 ? "EXACT_EXISTING_EVIDENCE" : ids.length === 0 ? "UNMATCHED_EXACT_NAME" : "AMBIGUOUS_EXACT_NAME"
  return {
    ...row,
    canonical_player_id: ids.length === 1 ? ids[0] : "",
    canonical_identity_status: canonicalStatus,
    existing_production_pair: existingWeeks.has(`${row.week}|${row.player}`) ? "PRESENT" : "MISSING",
    duplicate_player_week: (pairKeyCounts.get(`${row.week}|${row.player}`) ?? 0) > 1 ? "DUPLICATE" : "UNIQUE",
    local_evidence_key: localEvidenceKey(row),
    authoritative_fingerprint: "",
    staged_import_status: canonicalStatus === "EXACT_EXISTING_EVIDENCE" && row.summaryMatch === "EXACT" && row.holeSumStatus !== "MISMATCH"
      ? "BLOCKED_MISSING_AUTHORITATIVE_SOURCE_ID_AND_ROUND_ID"
      : "QUARANTINED_RECONCILIATION_EXCEPTION",
  }
})
const pairColumns = Object.keys(enriched[0])
writeCsv("kwt_s14w05_12_pair_reconciliation.csv", enriched, pairColumns)

const exceptions = enriched.filter((row) => row.summaryMatch !== "EXACT" || row.holeSumStatus === "MISMATCH" || row.canonical_identity_status !== "EXACT_EXISTING_EVIDENCE" || row.existing_production_pair === "PRESENT" || row.duplicate_player_week === "DUPLICATE")
writeCsv("kwt_s14w05_12_exceptions.csv", exceptions, pairColumns)

const weeklyRows = csvRows(weeklyFile)
const weeklyValid = weeklyRows.filter((row) => row.verification_status === "VERIFIED" && row.completed_round === "true" && Number.isFinite(Number(row.score)))
const weeklyByCourse = new Map()
for (const row of weeklyValid) {
  const key = `${clean(row.course_code)}|${clean(row.difficulty)}`
  const group = weeklyByCourse.get(key) ?? []
  group.push(row)
  weeklyByCourse.set(key, group)
}
const weeklyReview = [...weeklyByCourse.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
  const [courseCode, difficulty] = key.split("|")
  const scores = rows.map((row) => Number(row.score)).sort((a, b) => a - b)
  const eliteCount = Math.max(1, Math.ceil(scores.length * 0.12))
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const median = scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
  const elite = scores.slice(0, eliteCount).reduce((sum, score) => sum + score, 0) / eliteCount
  return {
    course_code: courseCode,
    difficulty,
    qualifying_rounds: scores.length,
    distinct_external_players: new Set(rows.map((row) => row.player_exact)).size,
    mean_score: mean,
    median_score: median,
    minimum_score: scores[0],
    maximum_score: scores[scores.length - 1],
    elite_benchmark_lowest_12_percent: elite,
    slope_simulation_field_minus_elite: mean - elite,
    personal_handicap_eligible: false,
    source: "THE_WEEKLY",
  }
})
writeCsv("weekly_course_rating_review.csv", weeklyReview, Object.keys(weeklyReview[0] ?? { source: "" }))

// Local-only impact simulation. It deliberately uses the Phase 104 package as
// an input, never as a write target. New KWT rows are marked non-importable
// above because the supplied CSVs do not carry the authoritative source and
// round IDs needed for Production fingerprints.
const phase104Dir = path.join(process.cwd(), "docs", "handicap", "phase104")
const phase104Ratings = csvRows(path.join(phase104Dir, "rating_snapshot_import_rows.csv"))
const phase104Indexes = csvRows(path.join(phase104Dir, "index_snapshot_import_rows.csv"))
const ratingByCourse = new Map(phase104Ratings.map((row) => [clean(row.course_id), {
  rating: Number(row.course_rating),
  slope: Number(row.slope),
  snapshotId: row.id,
  confidence: row.rating_confidence,
}]))
const courseByCode = new Map()
for (const row of provenanceRows.filter((value) => value.source_type === "KWT")) {
  try {
    const metadata = JSON.parse(row.metadata || "{}")
    if (metadata.original_course_code && metadata.course_id) courseByCode.set(metadata.original_course_code, {
      courseId: metadata.course_id,
      difficulty: metadata.difficulty,
    })
  } catch {
    // A malformed metadata value is excluded from simulation, not repaired.
  }
}
// These four code-to-catalog mappings are already established in the local
// Handicap review catalog (the historical Phase 68 provenance cannot provide
// them because those courses were unrated there). They are code-backed,
// explicit mappings, not fuzzy name matching.
for (const [code, courseId, difficulty] of [
  ["BHE", "Blokhaven_easy", "easy"],
  ["BHH", "Blokhaven_hard", "hard"],
  ["GLE", "Gloop Lair_easy", "easy"],
  ["GLH", "Gloop Lair_hard", "hard"],
]) {
  if (!courseByCode.has(code)) courseByCode.set(code, { courseId, difficulty })
}
function median(scores) {
  const sorted = scores.slice().sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function ratingSummary(observations) {
  const scores = observations.map((row) => row.score).filter(Number.isFinite).sort((a, b) => a - b)
  if (!scores.length) return { rounds: 0, players: 0, mean: null, median: null, elite: null, rating: null, slope: null, status: "INSUFFICIENT" }
  const eliteCount = Math.max(1, Math.ceil(scores.length * 0.12))
  const elite = scores.slice(0, eliteCount).reduce((sum, score) => sum + score, 0) / eliteCount
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
  return {
    rounds: scores.length,
    players: new Set(observations.map((row) => row.playerKey)).size,
    mean,
    median: median(scores),
    elite,
    rating: scores.length >= 20 ? elite : null,
    slope: scores.length >= 20 ? mean - elite : null,
    status: scores.length >= 50 ? "POTENTIALLY_READY" : scores.length >= 20 ? "PROVISIONAL" : "UNRATED",
  }
}
const oldKwtObservations = []
for (const row of provenanceRows.filter((value) => value.source_type === "KWT")) {
  try {
    const metadata = JSON.parse(row.metadata || "{}")
    const score = Number(metadata.score)
    const courseId = clean(metadata.course_id)
    if (Number.isFinite(score) && courseId) oldKwtObservations.push({ courseId, score, playerKey: clean(row.canonical_player_id) || clean(row.original_player_name), source: "KWT_HISTORICAL", sourceKey: clean(row.source_fingerprint) })
  } catch {
    // Exclude malformed source metadata from the local simulation.
  }
}
const newKwtObservations = []
for (const row of enriched) {
  const courseEasy = courseByCode.get(row.easyCode)
  const courseHard = courseByCode.get(row.hardCode)
  const playerKey = row.canonical_player_id ? row.canonical_player_id : `UNRESOLVED:${row.player}`
  if (courseEasy && Number.isFinite(row.easyScore)) newKwtObservations.push({ courseId: courseEasy.courseId, score: row.easyScore, playerKey, source: "KWT_S14_NEW", sourceKey: `${row.eventId}|${row.player}|${row.easyCode}|${row.detailRow}` })
  if (courseHard && Number.isFinite(row.hardScore)) newKwtObservations.push({ courseId: courseHard.courseId, score: row.hardScore, playerKey, source: "KWT_S14_NEW", sourceKey: `${row.eventId}|${row.player}|${row.hardCode}|${row.detailRow}` })
}
const weeklyObservations = weeklyValid.flatMap((row) => {
  const course = courseByCode.get(clean(row.course_code))
  return course ? [{ courseId: course.courseId, score: Number(row.score), playerKey: `WEEKLY:${row.player_exact}`, source: "THE_WEEKLY" }] : []
})
const byCourse = (observations) => {
  const grouped = new Map()
  for (const observation of observations) {
    const rows = grouped.get(observation.courseId) ?? []
    rows.push(observation)
    grouped.set(observation.courseId, rows)
  }
  return grouped
}
const oldByCourse = byCourse(oldKwtObservations)
const newByCourse = byCourse([...oldKwtObservations, ...newKwtObservations])
const weeklyByCanonicalCourse = byCourse(weeklyObservations)
const allByCourse = byCourse([...oldKwtObservations, ...newKwtObservations, ...weeklyObservations])
const comparisonRows = []
for (const courseId of [...new Set([...ratingByCourse.keys(), ...newByCourse.keys(), ...weeklyByCanonicalCourse.keys()])].sort()) {
  const rating = ratingByCourse.get(courseId)
  const models = [
    ["KWT_ONLY", oldByCourse.get(courseId) ?? [], "historical Phase 68 KWT provenance"],
    ["KWT_PLUS_S14W05_12", newByCourse.get(courseId) ?? [], "local simulation; supplied Season 14 rows lack authoritative source IDs/round IDs"],
    ["WEEKLY_ONLY", weeklyByCanonicalCourse.get(courseId) ?? [], "THE_WEEKLY course-rating-only evidence"],
    ["KWT_PLUS_WEEKLY", allByCourse.get(courseId) ?? [], "local combined simulation; Weekly never enters personal indexes"],
  ]
  const oldSummary = ratingSummary(oldByCourse.get(courseId) ?? [])
  for (const [model, observations, note] of models) {
    const summary = ratingSummary(observations)
    comparisonRows.push({
      course_id: courseId,
      difficulty: courseId.endsWith("_hard") ? "hard" : "easy",
      model,
      qualifying_rounds: summary.rounds,
      distinct_players: summary.players,
      mean_score: summary.mean,
      median_score: summary.median,
      elite_benchmark: summary.elite,
      simulated_course_rating: summary.rating,
      simulated_slope: summary.slope,
      status: summary.status,
      phase104_rating: rating?.rating ?? "",
      phase104_slope: rating?.slope ?? "",
      rating_delta_from_kwt_only: model === "KWT_ONLY" || summary.rating === null || oldSummary.rating === null ? "" : summary.rating - oldSummary.rating,
      slope_delta_from_kwt_only: model === "KWT_ONLY" || summary.slope === null || oldSummary.slope === null ? "" : summary.slope - oldSummary.slope,
      note,
    })
  }
}
writeCsv("phase111_course_rating_comparison.csv", comparisonRows, Object.keys(comparisonRows[0] ?? { course_id: "" }))

const stagedCourseRows = enriched.flatMap((row) => [
  { season: row.season, week: row.week, event_id: row.eventId, player: row.player, canonical_player_id: row.canonical_player_id, source_player_metadata: row.summaryAvatar, course_code: row.easyCode, difficulty: "easy", score: row.easyScore, detail_file: row.detailFile, detail_row: row.detailRow, local_evidence_key: `${row.local_evidence_key}|easy`, source_fingerprint: "", official_sequence: "SEASON_WEEK_EASY_HARD", import_eligible: "false", block_reason: "MISSING_AUTHORITATIVE_SOURCE_ID_AND_ROUND_ID" },
  { season: row.season, week: row.week, event_id: row.eventId, player: row.player, canonical_player_id: row.canonical_player_id, source_player_metadata: row.summaryAvatar, course_code: row.hardCode, difficulty: "hard", score: row.hardScore, detail_file: row.detailFile, detail_row: row.detailRow, local_evidence_key: `${row.local_evidence_key}|hard`, source_fingerprint: "", official_sequence: "SEASON_WEEK_EASY_HARD", import_eligible: "false", block_reason: "MISSING_AUTHORITATIVE_SOURCE_ID_AND_ROUND_ID" },
])
writeCsv("kwt_s14w05_12_staging_rows.csv", stagedCourseRows, Object.keys(stagedCourseRows[0]))

const oldIndexByPlayer = new Map(phase104Indexes.map((row) => [row.canonical_player_id, Number(row.resulting_index)]))
const readyCourseIds = new Set([...ratingByCourse.keys()])
function indexPreview(observations) {
  const eligible = observations.filter((row) => readyCourseIds.has(row.courseId) && !String(row.playerKey).startsWith("UNRESOLVED:")).map((row) => {
    const rating = ratingByCourse.get(row.courseId)
    const differential = Math.round(((row.score - rating.rating) * 8.515 / rating.slope) * 100) / 100
    return { ...row, differential }
  })
  const grouped = new Map()
  for (const row of eligible) {
    const values = grouped.get(row.playerKey) ?? []
    values.push(row)
    grouped.set(row.playerKey, values)
  }
  const result = new Map()
  for (const [playerKey, rows] of grouped) {
    const sorted = rows.slice().sort((a, b) => String(a.sourceKey ?? `${a.courseId}|${a.source}`).localeCompare(String(b.sourceKey ?? `${b.courseId}|${b.source}`)))
    const latest = sorted.slice(-10)
    const best = latest.slice().sort((a, b) => a.differential - b.differential).slice(0, 5)
    if (best.length >= 5) result.set(playerKey, {
      playerKey,
      eligibleRounds: rows.length,
      latestTen: latest.length,
      bestFive: best.length,
      resultingIndex: best.reduce((sum, row) => sum + row.differential, 0) / best.length,
      chronology: "OFFICIAL_KWT_SEQUENCE",
    })
  }
  return result
}
const oldIndexPreview = indexPreview(oldKwtObservations)
const revisedIndexPreview = indexPreview([...oldKwtObservations, ...newKwtObservations])
const playerIds = [...new Set([...oldIndexPreview.keys(), ...revisedIndexPreview.keys(), ...oldIndexByPlayer.keys()])].sort()
const indexComparison = playerIds.map((playerKey) => {
  const oldValue = oldIndexByPlayer.get(playerKey) ?? oldIndexPreview.get(playerKey)?.resultingIndex ?? null
  const revised = revisedIndexPreview.get(playerKey)
  const revisedValue = revised?.resultingIndex ?? null
  return {
    canonical_player_id: playerKey,
    old_phase104_index: oldValue,
    revised_local_index: revisedValue,
    absolute_change: oldValue === null || revisedValue === null ? "" : Math.abs(revisedValue - oldValue),
    revised_eligible_rounds: revised?.eligibleRounds ?? 0,
    revised_latest_ten: revised?.latestTen ?? 0,
    revised_best_five: revised?.bestFive ?? 0,
    chronology_confidence: revised?.chronology ?? "UNAVAILABLE",
    weekly_rows_used: 0,
    status: revised ? "LOCAL_PREVIEW_ONLY" : "BLOCKED_OR_UNCHANGED",
  }
})
writeCsv("phase111_player_index_comparison.csv", indexComparison, Object.keys(indexComparison[0] ?? { canonical_player_id: "" }))

const detailRows = enriched.length
const exact = enriched.filter((row) => row.summaryMatch === "EXACT").length
const pairSummary = [...new Set(enriched.map((row) => `${row.week}|${row.player}`))]
const uniqueNames = new Set(enriched.map((row) => row.player))
const exactNames = new Set(enriched.filter((row) => row.canonical_identity_status === "EXACT_EXISTING_EVIDENCE").map((row) => row.player))
const encodingCounts = manifestRows.reduce((acc, row) => { acc[row.encoding] = (acc[row.encoding] ?? 0) + 1; return acc }, {})
const report = `# Phase 111 KWT Season 14 Weeks 5–12 reconciliation\n\n` +
  `- ZIP SHA-256: **${process.env.KWT_PHASE111_ZIP_SHA256 || "E599CF6DF746F6C60C9718FBB73486396055567B738ED1A6EEB5808D2E2E46CE"}**\n` +
  `- Source files: **${names.length}** (8 detailed, 8 weekly summaries); encodings: ${json(encodingCounts)}.\n` +
  `- Detail/player-week observations: **${detailRows}**; unique player-week keys: **${pairSummary.length}**; unique source names: **${uniqueNames.size}**.\n` +
  `- Course observations staged locally: **${stagedCourseRows.length}** (Easy and Hard preserved separately); exact identity-supported pair rows: **${enriched.filter((row) => row.canonical_identity_status === "EXACT_EXISTING_EVIDENCE").length}**; unresolved/ambiguous pair rows: **${enriched.filter((row) => row.canonical_identity_status !== "EXACT_EXISTING_EVIDENCE").length}**.\n` +
  `- Exact summary reconciliations: **${exact}**; non-exact rows: **${detailRows - exact}**.\n` +
  `- Exact name matches to existing authoritative KWT provenance: **${exactNames.size}**; unresolved/ambiguous names are quarantined.\n` +
  `- Existing Production Season 14 W05–W12 provenance rows: **0** at read-only preflight; this package stages no Production writes.\n` +
  `- Duplicate player/week groups in the supplied package: **${duplicatePairGroups}**; no duplicate group was accepted.\n` +
  `- Supplied files do not contain the authoritative numeric source-player IDs and round IDs required for Production-compatible KWT fingerprints. Every staged row is therefore **blocked from import**, even when the summary and detail rows reconcile exactly.\n` +
  `- Weekly review uses the existing 844 verified course-score rows only. Weekly rows remain course-rating-only and are never personal Handicap input.\n\n` +
  `## Local impact simulation\n\n` +
  `- ${newKwtObservations.length} new KWT course observations were usable for local statistics after exact field reconciliation and code-backed course lookup; they are not importable because source IDs/round IDs are absent.\n` +
  `- ${new Set(newKwtObservations.map((row) => row.playerKey)).size} player keys were available for local comparison; unresolved names remain visibly quarantined in the reconciliation CSV.\n` +
  "- Course and index comparisons are in phase111_course_rating_comparison.csv and phase111_player_index_comparison.csv. They are simulations only; no Phase 105 snapshot is changed.\n" +
  `## Safety result\n\n` +
  `**PARTIAL / BLOCKED FOR IMPORT:** source reconciliation is complete for accessible rows, but no Production-compatible append-only import package is authorized until authoritative KWT source IDs and round IDs are recovered. No scores, identities, snapshots, or Production rows were changed.\n`
fs.writeFileSync(path.join(outputDir, "phase111_reconciliation_report.md"), report, "utf8")
const generatedFiles = fs.readdirSync(outputDir).filter((file) => file !== "phase111_package_manifest.json").sort()
const generatedChecksums = Object.fromEntries(generatedFiles.map((file) => [file, sha256(fs.readFileSync(path.join(outputDir, file)))]))
fs.writeFileSync(path.join(outputDir, "phase111_package_manifest.json"), JSON.stringify({
  schemaVersion: "phase111-kwt-season14-reconciliation-v1",
  sourceZipSha256: process.env.KWT_PHASE111_ZIP_SHA256 || "E599CF6DF746F6C60C9718FBB73486396055567B738ED1A6EEB5808D2E2E46CE",
  sourceFiles: manifestRows,
  counts: {
    detailedFiles: detailed.length,
    summaryFiles: summaries.length,
    playerWeekPairs: pairSummary.length,
    courseObservations: stagedCourseRows.length,
    exactSummaryMatches: exact,
    duplicatePlayerWeekGroups: duplicatePairGroups,
    exactIdentityPairRows: enriched.filter((row) => row.canonical_identity_status === "EXACT_EXISTING_EVIDENCE").length,
    unresolvedIdentityPairRows: enriched.filter((row) => row.canonical_identity_status !== "EXACT_EXISTING_EVIDENCE").length,
    importReadyRows: 0,
    weeklyVerifiedCourseRows: weeklyValid.length,
    weeklyPersonalHandicapRows: 0,
    baselineIndexCandidates: phase104Indexes.length,
    revisedNumericLocalPreviews: indexComparison.filter((row) => row.revised_local_index !== null && row.revised_local_index !== "").length,
  },
  generatedChecksums,
  status: "LOCAL_ONLY_BLOCKED_PENDING_AUTHORITATIVE_KWT_SOURCE_IDS_AND_ROUND_IDS",
}, null, 2) + "\n", "utf8")
console.log(JSON.stringify({ outputDir, sourceFiles: names.length, detailRows, uniquePlayerWeeks: pairSummary.length, exactSummaryMatches: exact, nonExact: detailRows - exact, uniqueNames: uniqueNames.size, exactIdentityNames: exactNames.size, weeklyRows: weeklyValid.length, weeklyCourses: weeklyReview.length, encodingCounts }, null, 2))
