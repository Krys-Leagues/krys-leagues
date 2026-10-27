import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase101")
fs.mkdirSync(outputDir, { recursive: true })

const phase99ReviewPath = "docs/handicap/phase99/rating_approval_review.csv"
const phase99ManifestPath = "docs/handicap/phase99/rating_approval_manifest.json"
const phase100PeriodPath = "docs/handicap/phase100/rating_effective_period_manifest.csv"
const phase100DiagnosticsPath = "docs/handicap/phase100/investigate_rating_diagnostics.json"
const phase100LedgerPath = "docs/handicap/phase100/exception_resolution_ledger.csv"
const phase98ManifestPath = "docs/handicap/phase98/calculation_run_manifest.json"

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

function parseCsv(relativePath) {
  const result = Papa.parse(read(relativePath), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${relativePath}: ${JSON.stringify(result.errors)}`)
  return result.data
}

function sha256(relativePath) {
  return crypto.createHash("sha256").update(read(relativePath)).digest("hex").toUpperCase()
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(name, columns, rows) {
  const lines = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))]
  fs.writeFileSync(path.join(outputDir, name), `${lines.join("\n")}\n`)
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`)
}

function mdCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ")
}

const reviewRows = parseCsv(phase99ReviewPath)
const periodRows = parseCsv(phase100PeriodPath)
const phase99Manifest = JSON.parse(read(phase99ManifestPath))
const phase98Manifest = JSON.parse(read(phase98ManifestPath))
const diagnostics = JSON.parse(read(phase100DiagnosticsPath))
const ledger = parseCsv(phase100LedgerPath)

if (reviewRows.length !== 78) throw new Error(`Expected 78 Phase 99 review rows, found ${reviewRows.length}`)
if (periodRows.length !== 78) throw new Error(`Expected 78 Phase 100 period rows, found ${periodRows.length}`)
if (ledger.length !== 808) throw new Error(`Expected 808 exception-ledger rows, found ${ledger.length}`)
if (phase99Manifest.ratings?.statisticallyReady !== 72 || phase99Manifest.ratings?.provisional !== 6) {
  throw new Error("Phase 99 rating counts do not match the approved baseline")
}
if (phase98Manifest.ratingEligibility?.readyForPersonalIndexes !== 72) {
  throw new Error("Phase 98 ready-rating count does not match the approved baseline")
}

const periodBySnapshot = new Map(periodRows.map((row) => [row.snapshot_id, row]))
const diagnosticIds = new Set(diagnostics.map((row) => row.snapshot_id))
const expectedDiagnosticIds = new Set([
  "dedee913-6e56-56d9-a7d8-0d896a7ec5d4",
  "3c2abf18-7cb3-5037-8492-0b80653bdca0",
  "d88e932f-9fb4-56c1-a948-f1016ff385da",
  "d56c62a4-f356-5ac8-86f4-4976637fb207",
])
if (diagnosticIds.size !== expectedDiagnosticIds.size || [...expectedDiagnosticIds].some((id) => !diagnosticIds.has(id))) {
  throw new Error("Phase 100 diagnostic set changed unexpectedly")
}

const formalRows = reviewRows.map((review) => {
  const period = periodBySnapshot.get(review.snapshot_id)
  if (!period) throw new Error(`Missing period row for ${review.snapshot_id}`)
  const ready = review.confidence === "ready"
  const diagnostic = diagnosticIds.has(review.snapshot_id)
  const recommendation = !ready
    ? "HOLD_PROVISIONAL"
    : diagnostic
      ? "APPROVE_AFTER_DIAGNOSTIC_REVIEW"
      : "APPROVE_PENDING_FORMAL_REVIEW"
  const diagnosticDisposition = diagnostic
    ? "NO_DEFECT_FOUND_DISTRIBUTION_REPRODUCED_FORMAL_REVIEW_REQUIRED"
    : "NOT_APPLICABLE"
  return {
    snapshot_id: review.snapshot_id,
    course_id: review.course_id,
    course_name: review.course_name,
    difficulty: review.difficulty,
    course_rating: review.course_rating,
    slope: review.slope,
    sample_size: review.sample_size,
    distinct_players: review.distinct_players,
    maximum_player_concentration: review.maximum_player_concentration,
    confidence: review.confidence,
    source_ref_count: review.source_ref_count,
    dependent_index_candidates: review.dependent_index_candidates,
    source_exception_resolution: period.source_exception_resolution,
    source_exception_is_in_rating_refs: period.source_exception_is_in_rating_refs,
    observed_period_count: period.observed_period_count,
    observed_period_start: period.observed_period_start,
    observed_period_end: period.observed_period_end,
    proposed_effective_period: period.proposed_effective_period,
    effective_from: "",
    model_version: review.model_version,
    differential_model_version: review.differential_model_version,
    reference_slope: review.reference_slope,
    recommendation,
    diagnostic_disposition: diagnosticDisposition,
    publication_status: "UNPUBLISHED",
    formal_publication_eligible: "false",
    publication_blockers: ready
      ? "EXPLICIT_REVIEW_APPROVAL_REQUIRED;EFFECTIVE_PERIOD_GATE_REVIEW_REQUIRED"
      : "PROVISIONAL_SAMPLE_SIZE;EXPLICIT_REVIEW_APPROVAL_REQUIRED;EFFECTIVE_PERIOD_GATE_REVIEW_REQUIRED",
  }
})

const columns = Object.keys(formalRows[0])
writeCsv("rating_approval_manifest.csv", columns, formalRows)

const mdHeaders = ["Course", "Difficulty", "Rating", "Slope", "Rounds", "Players", "Max share", "Confidence", "Periods", "Index candidates", "Recommendation", "Diagnostic disposition"]
const mdLines = [
  "# Phase 101 KWT rating approval manifest",
  "",
  "Status: **PROPOSED REVIEW ONLY — NO RATINGS APPROVED OR PUBLISHED**",
  "",
  "All 72 statistically ready rows meet the approved evidence thresholds. The 68 non-diagnostic rows are recommended for formal approval review; the four diagnostic rows reproduced their values from valid corrected KWT distributions and require explicit reviewer disposition, not recalculation. The six provisional rows remain ineligible.",
  "",
  `| ${mdHeaders.join(" | ")} |`,
  `| ${mdHeaders.map(() => "---").join(" | ")} |`,
]
for (const row of formalRows) {
  mdLines.push(`| ${[
    row.course_name,
    row.difficulty,
    row.course_rating,
    row.slope,
    row.sample_size,
    row.distinct_players,
    `${(Number(row.maximum_player_concentration) * 100).toFixed(1)}%`,
    row.confidence,
    `${row.observed_period_start}–${row.observed_period_end}`,
    row.dependent_index_candidates,
    row.recommendation,
    row.diagnostic_disposition,
  ].map(mdCell).join(" | ")} |`)
}
fs.writeFileSync(path.join(outputDir, "rating_approval_manifest.md"), `${mdLines.join("\n")}\n`)

const approvalManifest = {
  schemaVersion: "phase101-kwt-rating-approval-v1",
  status: "PROPOSED_REVIEW_ONLY_UNPUBLISHED",
  sourceCheckpoint: "0c8e09fd6463094ecbfb6d15a3a3237e1b39b808",
  sourceCalculationRunId: phase99Manifest.sourceCalculationRunId,
  policyVersion: phase99Manifest.policyVersion,
  differentialModelVersion: phase99Manifest.differentialModelVersion,
  referenceSlope: phase99Manifest.referenceSlope,
  chronologyPolicy: "OFFICIAL_KWT_SEQUENCE",
  formula: phase99Manifest.formula,
  totalKwtOnlyRatings: formalRows.length,
  readyRatings: formalRows.filter((row) => row.confidence === "ready").length,
  provisionalRatings: formalRows.filter((row) => row.confidence !== "ready").length,
  readyRecommendedForFormalApproval: formalRows.filter((row) => row.recommendation !== "HOLD_PROVISIONAL").length,
  diagnosticRatings: formalRows.filter((row) => row.diagnostic_disposition !== "NOT_APPLICABLE").length,
  numericIndexCandidates: phase99Manifest.indexDependency.numericCandidates,
  dependentIndexReferences: phase99Manifest.indexDependency.totalDependencyReferences,
  sourceExceptions: {
    unresolvedCanonicalId: ledger.filter((row) => row.original_reason === "UNRESOLVED_CANONICAL_ID").length,
    invalidScore: ledger.filter((row) => row.original_reason === "INVALID_SCORE").length,
    includedInCorrectedPackage: ledger.filter((row) => row.included_in_corrected_package === "true").length,
  },
  effectivePeriod: {
    representation: "per-snapshot KWT Season/Week range under OFFICIAL_KWT_SEQUENCE",
    calendarDate: null,
    noCalendarDatesInvented: true,
    currentProductionGateRequiresCalendarDate: true,
    proposedGateRequiresExplicitRunOptIn: true,
  },
  allRatingsRemainUnpublished: true,
  formalPublicationEligible: false,
  sourceHashes: {
    phase99Review: sha256(phase99ReviewPath),
    phase99Manifest: sha256(phase99ManifestPath),
    phase100PeriodManifest: sha256(phase100PeriodPath),
    phase100Diagnostics: sha256(phase100DiagnosticsPath),
    phase100Ledger: sha256(phase100LedgerPath),
    phase98Manifest: sha256(phase98ManifestPath),
  },
}
writeJson("rating_approval_manifest.json", approvalManifest)

const effectivePeriodManifest = formalRows.map((row) => ({
  snapshot_id: row.snapshot_id,
  course_id: row.course_id,
  difficulty: row.difficulty,
  observed_period_start: row.observed_period_start,
  observed_period_end: row.observed_period_end,
  proposed_effective_period: row.proposed_effective_period,
  effective_from: null,
  chronology_policy: "OFFICIAL_KWT_SEQUENCE",
  source_scope: "KWT_ONLY",
  recommendation: row.recommendation,
  publication_eligible: false,
}))
writeCsv("season_week_effective_period_manifest.csv", Object.keys(effectivePeriodManifest[0]), effectivePeriodManifest)
writeJson("season_week_effective_period_manifest.json", {
  schemaVersion: "phase101-season-week-effective-period-v1",
  status: "PROPOSED_REVIEW_ONLY",
  chronologyPolicy: "OFFICIAL_KWT_SEQUENCE",
  effectiveFrom: null,
  rows: effectivePeriodManifest,
  noCalendarDatesInvented: true,
})

const report = `# Phase 101 final KWT rating approval readiness

Status: **PARTIAL — statistically ready and source-compatible locally; formal approval and a narrow effective-period gate change remain.**

## Production compatibility

The verified Production project is \`jfbndcwdsvsjgnzwvexp\`. The current database has the \`effective_period\` text column, but the installed publishable-rating view still requires \`effective_from IS NOT NULL\`. Production currently has 338 unpublished snapshots with NULL calendar dates and a generic historical period label. No Production row was changed.

The Phase 100 package instead carries exact per-snapshot Season/Week ranges. These are authoritative competition periods under \`OFFICIAL_KWT_SEQUENCE\`, not invented calendar dates. A future approved run must carry those values and explicit run-level opt-in; the existing quarantined runs must remain excluded.

## Approval recommendations

- 72 ratings meet the approved sample, distinct-player, concentration, positive-slope, and provenance requirements.
- 68 are recommended \`APPROVE_PENDING_FORMAL_REVIEW\`.
- Four are recommended \`APPROVE_AFTER_DIAGNOSTIC_REVIEW\`; their values reproduce from valid corrected KWT distributions with no source or formula defect.
- Six remain \`HOLD_PROVISIONAL\` and cannot support official indexes.
- 157 numeric player-index candidates remain unpublished and dependent on approved ratings.

The complete 78-row review is in \`rating_approval_manifest.md\` and \`rating_approval_manifest.csv\`. The four diagnostic rows are Shangri-La Easy, Forgotten Fairyland Easy, Bogey's Bonanza Hard, and Original Gothic Easy.

## Source exceptions

The 806 unresolved-identity and 2 invalid-score rows remain preserved in the Phase 100 exception ledger, excluded from the corrected KWT package, and unchanged. They do not invalidate the 72 rating samples because none of their fingerprints is referenced by those snapshots.

## Proposed effective-period compatibility change

The separate proposal \`supabase/proposals/20261020_handicap_kwt_effective_period_publication_gate.proposed.sql\` preserves the existing calendar-date path and adds a strictly gated period-only path requiring:

1. \`COMPLETED\` run status and \`ELIGIBLE\` publication eligibility;
2. \`PUBLISHED\` snapshot status;
3. \`chronology_policy = OFFICIAL_KWT_SEQUENCE\`;
4. explicit run metadata opt-in \`allow_official_kwt_sequence_publication = true\`;
5. a validated per-snapshot KWT Season/Week period string; and
6. valid slope and complete source provenance.

It changes no tables, rows, grants, RLS, or existing publication status. It is not executed in this phase.

## Remaining controlled steps

1. Krys explicitly approves the 72 rating recommendations, including the four diagnostic dispositions.
2. Review and approve the effective-period proposal.
3. Build a new append-only eligible calculation run with exact per-snapshot periods; do not update the existing 338 immutable rows.
4. Run the production preflight and import/publish only the approved rating subset.
5. Generate and review the 157 index candidates, then publish only after the existing OFFICIAL_KWT_SEQUENCE gate and all player-level safeguards pass.
`
fs.writeFileSync(path.join(outputDir, "rating_approval_readiness_report.md"), report)

console.log(JSON.stringify({
  ratingsReviewed: formalRows.length,
  readyRatings: formalRows.filter((row) => row.confidence === "ready").length,
  provisionalRatings: formalRows.filter((row) => row.confidence !== "ready").length,
  readyRecommendedForFormalApproval: formalRows.filter((row) => row.recommendation !== "HOLD_PROVISIONAL").length,
  diagnosticRatings: formalRows.filter((row) => row.diagnostic_disposition !== "NOT_APPLICABLE").length,
  sourceExceptions: { unresolvedCanonicalId: 806, invalidScore: 2 },
  numericIndexCandidates: phase99Manifest.indexDependency.numericCandidates,
  effectiveFrom: null,
  productionRowsModified: 0,
}, null, 2))
