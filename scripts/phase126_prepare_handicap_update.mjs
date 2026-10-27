import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase126")
const phase68Path = path.join(root, "docs", "handicap", "phase68", "handicap_source_provenance_import.csv")
const phase117Path = path.join(root, "docs", "handicap", "phase117", "handicap_source_provenance_import.csv")
const phase121RatingsPath = path.join(root, "docs", "handicap", "phase121", "rating_snapshot_candidates.csv")
const phase121IndexesPath = path.join(root, "docs", "handicap", "phase121", "player_index_candidates.csv")
const canonicalNamesPath = path.join(root, "docs", "handicap", "phase118", "canonical_player_names.json")

const CALCULATION_RUN_ID = "12600000-0000-5000-8000-000000000001"
const MODEL_VERSION = "krys-handicap-candidate-a-v1"
const REFERENCE_SLOPE = 8.515
const ACTIVE_ROUND_LIMIT = 20
const OFFICIAL_ROUND_THRESHOLD = 20

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

function clean(value) { return String(value ?? "").trim() }
function num(value) { const result = Number(value); return Number.isFinite(result) ? result : null }
function metadata(row) { try { return JSON.parse(row.metadata || "{}") } catch { return {} } }
function round3(value) { return Math.round(value * 1000) / 1000 }
function round2(value) { return Math.round(value * 100) / 100 }
function displayIndex(value) { return value < 0 ? `+${Math.abs(value).toFixed(2)}` : value.toFixed(2) }
function uuidFromText(value) {
  const hex = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const normalized = hex.join("")
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`
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

function orderRows(a, b) {
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
const ratings = readCsv(phase121RatingsPath).filter((row) => row.publication_status === "UNPUBLISHED" && Number(row.slope) > 0.01)
const oldIndexes = readCsv(phase121IndexesPath)
const canonicalNames = JSON.parse(fs.readFileSync(canonicalNamesPath, "utf8"))

if (historical.length !== 13550) throw new Error(`Expected 13,550 historical KWT rows, got ${historical.length}`)
if (season14.length !== 728) throw new Error(`Expected 728 Season 14 rows, got ${season14.length}`)
if (ratings.length !== 78) throw new Error(`Expected 78 unchanged rating candidates, got ${ratings.length}`)
if (oldIndexes.length !== 166) throw new Error(`Expected 166 prior candidates, got ${oldIndexes.length}`)

const historicalFingerprints = new Set(historical.map((row) => row.fingerprint))
if (season14.some((row) => historicalFingerprints.has(row.fingerprint))) throw new Error("Season 14 fingerprint collision with historical KWT")
const combined = [...historical, ...season14]
const completePairs = completePairSet(combined)
const ratingByCourse = new Map(ratings.map((row) => [clean(row.course_id), {
  snapshotId: clean(row.snapshot_id),
  rating: Number(row.course_rating),
  slope: Number(row.slope),
}]))

const eligible = combined
  .filter((row) => ratingByCourse.has(row.courseId) && completePairs.has(`${row.season}|${row.week}|${row.playerKey}`))
  .map((row) => {
    const rating = ratingByCourse.get(row.courseId)
    return {
      ...row,
      rating: rating.rating,
      slope: rating.slope,
      ratingSnapshotId: rating.snapshotId,
      differential: (row.score - rating.rating) * REFERENCE_SLOPE / rating.slope,
    }
  })
  .filter((row) => Number.isFinite(row.differential))

const grouped = new Map()
for (const row of eligible) grouped.set(row.playerKey, [...(grouped.get(row.playerKey) ?? []), row])
const oldByPlayer = new Map(oldIndexes.map((row) => [clean(row.canonical_player_id), row]))
const playerIds = [...new Set(oldIndexes.map((row) => clean(row.canonical_player_id)))].sort()
if (playerIds.length !== 166) throw new Error(`Expected 166 canonical players, got ${playerIds.length}`)

const candidates = []
for (const playerId of playerIds) {
  const ordered = (grouped.get(playerId) ?? []).slice().sort(orderRows)
  const active = ordered.slice(-ACTIVE_ROUND_LIMIT)
  const index = active.length > 0 ? round2(active.reduce((sum, row) => sum + row.differential, 0) / active.length) : null
  const status = active.length === 0 ? "NOT_YET_RATED" : active.length >= OFFICIAL_ROUND_THRESHOLD ? "OFFICIAL_ELIGIBLE" : "PROVISIONAL"
  const old = oldByPlayer.get(playerId)
  const oldIndex = num(old?.resulting_index)
  candidates.push({
    snapshot_id: uuidFromText(`phase126-index:${CALCULATION_RUN_ID}:${playerId}:${active.map((row) => row.fingerprint).join("|")}`),
    source_snapshot_ids: JSON.stringify(old ? [clean(old.id)] : []),
    calculation_run_id: CALCULATION_RUN_ID,
    canonical_player_id: playerId,
    canonical_screen_name: canonicalNames[playerId] || clean(old?.canonical_screen_name),
    source_round_ids: JSON.stringify(ordered.map((row) => row.fingerprint)),
    rating_snapshot_ids: JSON.stringify([...new Set(active.map((row) => row.ratingSnapshotId))].sort()),
    rating_version_ids: JSON.stringify([...new Set(active.map((row) => row.ratingSnapshotId))].sort()),
    differential_model_version: MODEL_VERSION,
    active_twenty_source_round_ids: JSON.stringify(active.map((row) => row.fingerprint)),
    latest_ten_source_round_ids: JSON.stringify([]),
    best_five_source_round_ids: JSON.stringify([]),
    resulting_index: index === null ? "" : index,
    golf_display_index: index === null ? "NOT_YET_RATED" : displayIndex(index),
    handicap_status: status,
    qualifying_scorecard_count: ordered.length,
    active_round_count: active.length,
    chronology_confidence: active.length ? "OFFICIAL_KWT_SEQUENCE" : "UNKNOWN",
    source_scope: "KWT_ONLY",
    weekly_rows_used: 0,
    old_calculation_rule: "BEST_5_OF_LATEST_10",
    old_resulting_index: oldIndex === null ? "" : oldIndex,
    new_minus_old: index === null || oldIndex === null ? "" : round3(index - oldIndex),
    publication_decision: "PENDING_EXPLICIT_APPROVAL",
    publication_status: "UNPUBLISHED",
    review_flag: index === null ? "NO_QUALIFYING_RATED_CARDS" : status === "PROVISIONAL" ? "PROVISIONAL_UNDER_20_CARDS" : "NONE",
  })
}

const summary = {
  schema_version: "phase126-rolling-20-handicap-update-v1",
  status: "LOCAL_PRELIMINARY_UNPUBLISHED",
  calculation_run_id: CALCULATION_RUN_ID,
  source_scope: "KWT_ONLY",
  differential_formula: "(score - course rating) * 8.515 / course slope",
  model_version: MODEL_VERSION,
  reference_slope: REFERENCE_SLOPE,
  active_round_limit: ACTIVE_ROUND_LIMIT,
  official_threshold: OFFICIAL_ROUND_THRESHOLD,
  provisional_rule: "1-19 qualifying cards; average all available differentials",
  no_cards_rule: "NOT_YET_RATED",
  counts: {
    candidates: candidates.length,
    official_eligible: candidates.filter((row) => row.handicap_status === "OFFICIAL_ELIGIBLE").length,
    provisional: candidates.filter((row) => row.handicap_status === "PROVISIONAL").length,
    not_yet_rated: candidates.filter((row) => row.handicap_status === "NOT_YET_RATED").length,
    weekly_rows_used_in_personal_indexes: 0,
    changed_from_old: candidates.filter((row) => row.new_minus_old !== "0").length,
  },
  input_checksums: {
    phase68_provenance: sha256(phase68Path),
    phase117_provenance: sha256(phase117Path),
    phase121_ratings: sha256(phase121RatingsPath),
    phase121_indexes: sha256(phase121IndexesPath),
    canonical_names: sha256(canonicalNamesPath),
  },
  publication_boundary: "No Production rows, ratings, indexes, or profiles changed; all candidates remain unpublished.",
}

const report = [
  "# Phase 126 rolling-20 Handicap update",
  "",
  "Status: **LOCAL PRELIMINARY / UNPUBLISHED**.",
  "",
  `The previous best-5-of-latest-10 calculation was replaced locally with a rolling window of the ${ACTIVE_ROUND_LIMIT} most recent qualifying KWT scorecards. Every active differential is averaged; no best-round selection or weighting is applied.`,
  "",
  `- Candidates recalculated: **${summary.counts.candidates}**`,
  `- Official-eligible by card count: **${summary.counts.official_eligible}**`,
  `- Provisional (1–19 cards): **${summary.counts.provisional}**`,
  `- Not yet rated: **${summary.counts.not_yet_rated}**`,
  `- Weekly personal-round rows: **${summary.counts.weekly_rows_used_in_personal_indexes}**`,
  `- Numeric changes versus Phase 125: **${summary.counts.changed_from_old}**`,
  "",
  "All values remain unpublished. Official eligibility is not publication approval. The five approved ratings are reused unchanged; the remaining 73 remain subject to formal rating approval. Hollywood remains provisional and Gloop Lair remains unrated under the existing package.",
  "",
  "The existing database snapshot columns are named for latest-ten/best-five history. This local package records the new active window explicitly as `active_twenty_source_round_ids` and leaves the legacy selection arrays empty. A separately reviewed persistence/read-model change is required before these candidates can be installed or displayed as official.",
  "",
  "## Player comparison",
  "",
  "See `player_index_comparison.csv` for canonical UUID, exact canonical screen name, qualifying-card count, old/new signed index, golf display value, status, and movement.",
  "",
  "No Weekly observation enters any personal index. Negative scores and signed index values are preserved; golf-style plus notation is display-only.",
].join("\n") + "\n"

writeCsv(path.join(outputDir, "player_index_comparison.csv"), candidates)
writeCsv(path.join(outputDir, "player_index_candidates.csv"), candidates)
fs.writeFileSync(path.join(outputDir, "calculation_summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8")
fs.writeFileSync(path.join(outputDir, "README.md"), report, "utf8")

const artifactNames = ["player_index_comparison.csv", "player_index_candidates.csv", "calculation_summary.json", "README.md"]
const checksums = Object.fromEntries(artifactNames.map((name) => [name, sha256(path.join(outputDir, name))]))
fs.writeFileSync(path.join(outputDir, "checksums.json"), `${JSON.stringify(checksums, null, 2)}\n`, "utf8")

console.log(JSON.stringify({ ...summary.counts, calculationRunId: CALCULATION_RUN_ID }, null, 2))
