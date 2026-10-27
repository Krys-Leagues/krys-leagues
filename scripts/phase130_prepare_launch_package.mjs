import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const phase126 = path.join(root, "docs", "handicap", "phase126")
const phase121 = path.join(root, "docs", "handicap", "phase121")
const output = path.join(root, "docs", "handicap", "phase130")
fs.mkdirSync(output, { recursive: true })

function read(file) {
  return fs.readFileSync(file, "utf8")
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
}

function parseCsvLine(line) {
  const cells = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === "," && !quoted) {
      cells.push(cell)
      cell = ""
    } else {
      cell += character
    }
  }
  cells.push(cell)
  return cells
}

function parseCsv(file) {
  const lines = read(file).split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])))
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

const candidateFile = path.join(phase126, "player_index_candidates.csv")
const ratingFile = path.join(phase121, "rating_approval_manifest.json")
const candidates = parseCsv(candidateFile)
const ratings = JSON.parse(read(ratingFile))
const approvedRatings = [
  { course_id: "Bogey's Bonanza_hard", course_rating: -22.444, slope: 13.355 },
  { course_id: "Forgotten Fairyland_easy", course_rating: -28.917, slope: 8.127 },
  { course_id: "Original Gothic_easy", course_rating: -20.591, slope: 4.363 },
  { course_id: "Raptor Cliff's_hard", course_rating: -13.895, slope: 12.197 },
  { course_id: "Shangri-La_easy", course_rating: -29.81, slope: 7.342 },
].map(row => ({ ...row, decision: "APPROVED_FOR_INITIAL_PUBLICATION_PREPARATION", reviewer: "Krys", decision_date: "2026-10-21", reviewer_uuid: null, recorded_at: null }))

if (candidates.length !== 166) throw new Error(`Expected 166 candidates, found ${candidates.length}`)
if (new Set(candidates.map(row => row.canonical_player_id)).size !== 166) throw new Error("Candidate canonical-player IDs are not unique")
if (candidates.some(row => row.source_scope !== "KWT_ONLY" || Number(row.weekly_rows_used) !== 0)) throw new Error("Weekly evidence entered a personal-index candidate")
if (candidates.some(row => !["OFFICIAL_ELIGIBLE", "PROVISIONAL"].includes(row.handicap_status))) throw new Error("Unexpected candidate status")

const indexRows = candidates.map(row => ({
  snapshot_id: row.snapshot_id,
  calculation_run_id: row.calculation_run_id,
  canonical_player_id: row.canonical_player_id,
  canonical_screen_name: row.canonical_screen_name,
  resulting_index: number(row.resulting_index),
  golf_display_index: row.golf_display_index,
  handicap_status: row.handicap_status,
  active_round_count: Number(row.active_round_count),
  chronology_confidence: row.chronology_confidence,
  source_scope: row.source_scope,
  weekly_rows_used: Number(row.weekly_rows_used),
  publication_status: row.publication_status,
  approval_decision: "PENDING_EXPLICIT_APPROVAL",
}))

const indexApproval = {
  schema_version: "phase130-rolling20-index-approval-manifest-v1",
  status: "PENDING_EXPLICIT_APPROVAL",
  source_package: "docs/handicap/phase126/player_index_candidates.csv",
  source_package_sha256: sha256(candidateFile),
  policy_version: "krys-handicap-approved-policy-v1",
  model_version: "krys-handicap-candidate-a-v1",
  differential_formula: "(score - course rating) * 8.515 / course slope",
  reference_slope: 8.515,
  active_round_limit: 20,
  chronology_policy: "OFFICIAL_KWT_SEQUENCE",
  source_scope: "KWT_ONLY",
  owner_acceptance: { scope: "NUMERIC_FAIRNESS_ONLY", reviewers: ["Krys", "Tricky"], reviewer_uuids: [], accepted_at: null },
  counts: { total: 166, official_eligible: 120, provisional: 46, weekly_personal_inputs: 0 },
  rows: indexRows,
}
const indexApprovalFile = path.join(output, "player_index_approval_manifest.json")
writeJson(indexApprovalFile, indexApproval)

const indexPublication = {
  schema_version: "phase130-rolling20-index-publication-manifest-v1",
  status: "PENDING_SEPARATE_PUBLICATION_AUTHORIZATION",
  approval_manifest_sha256: sha256(indexApprovalFile),
  source_package_sha256: sha256(candidateFile),
  candidate_count: indexRows.length,
  publication_status_required: "PUBLISHED",
  run_status_required: "COMPLETED",
  run_eligibility_required: "ELIGIBLE",
  rows: indexRows.map(row => ({
    snapshot_id: row.snapshot_id,
    canonical_player_id: row.canonical_player_id,
    canonical_screen_name: row.canonical_screen_name,
    handicap_status: row.handicap_status,
    approval_decision: "PENDING",
    publication_decision: "PENDING",
  })),
}
const indexPublicationFile = path.join(output, "player_index_publication_manifest.json")
writeJson(indexPublicationFile, indexPublication)

const ratingApproval = {
  schema_version: "phase130-rating-approval-batch-manifest-v1",
  status: "PENDING_EXPLICIT_OWNER_APPROVAL",
  source_manifest: "docs/handicap/phase121/rating_approval_manifest.json",
  source_manifest_sha256: sha256(ratingFile),
  source_scope: "KWT_ONLY",
  model_version: "krys-handicap-candidate-a-v1",
  reference_slope: 8.515,
  owner_approved_ratings: approvedRatings,
  pending_candidate_count: ratings.rows.length,
  pending_candidates: ratings.rows.map(row => ({
    snapshot_id: row.snapshot_id,
    course_id: row.course_id,
    difficulty: row.difficulty,
    course_rating: row.course_rating,
    slope: row.slope,
    sample_size: row.sample_size,
    distinct_players: row.distinct_players,
    rating_confidence: row.rating_confidence,
    weekly_rows_used_for_rating_only: row.weekly_rows_used,
    owner_decision: "PENDING",
  })),
  explicit_holds: [
    "Hollywood Easy and Hollywood Hard remain PROVISIONAL.",
    "Gloop Lair Easy and Gloop Lair Hard remain UNRATED under the current KWT-only package.",
  ],
}
const ratingApprovalFile = path.join(output, "rating_approval_batch_manifest.json")
writeJson(ratingApprovalFile, ratingApproval)

const checksums = {
  "phase126/player_index_candidates.csv": sha256(candidateFile),
  "phase126/calculation_summary.json": sha256(path.join(phase126, "calculation_summary.json")),
  "phase127/player_read_rpc.proposed.sql": sha256(path.join(root, "supabase/proposals/20261022_handicap_rolling20_player_read_rpc.proposed.sql")),
  "phase130/player_index_approval_manifest.json": sha256(indexApprovalFile),
  "phase130/player_index_publication_manifest.json": sha256(indexPublicationFile),
  "phase130/rating_approval_batch_manifest.json": sha256(ratingApprovalFile),
}
writeJson(path.join(output, "checksums.json"), checksums)

console.log(JSON.stringify({
  index_candidates: candidates.length,
  official_eligible: candidates.filter(row => row.handicap_status === "OFFICIAL_ELIGIBLE").length,
  provisional: candidates.filter(row => row.handicap_status === "PROVISIONAL").length,
  weekly_personal_inputs: candidates.reduce((sum, row) => sum + Number(row.weekly_rows_used), 0),
  rating_candidates: ratings.rows.length,
  checksums,
}, null, 2))
