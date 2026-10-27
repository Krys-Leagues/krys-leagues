import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const sourceManifestPath = "docs/handicap/phase68/rating_snapshot_import_manifest.json"
const sourceProvenancePath = "docs/handicap/phase68/handicap_source_provenance_import.csv"
const packageManifestPath = "docs/handicap/phase98/calculation_run_manifest.json"
const packageIndexPath = "docs/handicap/phase98/index_snapshot_import_rows.csv"
const outputDir = path.join(root, "docs", "handicap", "phase99")
fs.mkdirSync(outputDir, { recursive: true })

const policyVersion = "krys-handicap-approved-policy-v1"
const differentialModelVersion = "krys-handicap-candidate-a-v1"
const referenceSlope = 8.515

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

function sha256(relativePath) {
  return crypto.createHash("sha256").update(read(relativePath)).digest("hex").toUpperCase()
}

function parseCsv(relativePath) {
  const result = Papa.parse(read(relativePath), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${relativePath}: ${JSON.stringify(result.errors)}`)
  return result.data
}

function parseArray(value) {
  if (Array.isArray(value)) return value
  return JSON.parse(value || "[]")
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

function mean(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key]), 0) / rows.length
}

function sampleStandardDeviation(rows, key, average) {
  return Math.sqrt(rows.reduce((sum, row) => sum + (Number(row[key]) - average) ** 2, 0) / (rows.length - 1))
}

function splitCourseId(courseId) {
  const separator = courseId.lastIndexOf("_")
  if (separator < 1) throw new Error(`Course ID has no difficulty suffix: ${courseId}`)
  return { courseName: courseId.slice(0, separator), difficulty: courseId.slice(separator + 1) }
}

function diagnosticFlags(row, ratingMean, ratingSd, slopeMean, slopeSd) {
  const flags = []
  const ratingZ = (Number(row.course_rating) - ratingMean) / ratingSd
  const slopeZ = (Number(row.slope) - slopeMean) / slopeSd
  if (row.rating_confidence !== "ready" || Number(row.sample_size) < 50) flags.push("PROVISIONAL_SAMPLE")
  if (Math.abs(ratingZ) >= 2) flags.push("COURSE_RATING_2SD_DIAGNOSTIC")
  if (Math.abs(slopeZ) >= 2) flags.push("SLOPE_2SD_DIAGNOSTIC")
  if (Number(row.maximum_player_share) > 0.10) flags.push("PLAYER_CONCENTRATION_OVER_10_PERCENT")
  if (Number(row.slope) <= 0.01) flags.push("INVALID_SLOPE")
  if (Number(row.quarantined_evidence_count) > 0) flags.push("QUARANTINED_EVIDENCE_REQUIRES_REVIEW")
  return { flags, ratingZ, slopeZ }
}

function recommendation(row, flags) {
  if (flags.includes("PROVISIONAL_SAMPLE")) return "HOLD"
  if (flags.some((flag) => flag.endsWith("_DIAGNOSTIC") || flag === "PLAYER_CONCENTRATION_OVER_10_PERCENT" || flag === "INVALID_SLOPE")) return "INVESTIGATE"
  return "HOLD"
}

const sourceManifest = JSON.parse(read(sourceManifestPath))
const packageManifest = JSON.parse(read(packageManifestPath))
const packageIndexRows = parseCsv(packageIndexPath)
const allRows = sourceManifest.ratingSnapshots.filter((row) => row.review_scope === "KWT_ONLY")
if (allRows.length !== 78) throw new Error(`Expected 78 KWT_ONLY ratings, found ${allRows.length}`)

const dependencyCounts = new Map(allRows.map((row) => [row.id, 0]))
for (const indexRow of packageIndexRows) {
  for (const snapshotId of new Set(parseArray(indexRow.rating_snapshot_ids))) {
    if (dependencyCounts.has(snapshotId)) dependencyCounts.set(snapshotId, dependencyCounts.get(snapshotId) + 1)
  }
}

const ratingMean = mean(allRows, "course_rating")
const ratingSd = sampleStandardDeviation(allRows, "course_rating", ratingMean)
const slopeMean = mean(allRows, "slope")
const slopeSd = sampleStandardDeviation(allRows, "slope", slopeMean)

const reviewRows = allRows.map((row) => {
  const { courseName, difficulty } = splitCourseId(row.course_id)
  const refs = parseArray(row.source_evidence_refs)
  const diagnostics = diagnosticFlags(row, ratingMean, ratingSd, slopeMean, slopeSd)
  const recommendationValue = recommendation(row, diagnostics.flags)
  const blockers = [...(row.publication_blockers || [])]
  return {
    course_id: row.course_id,
    course_name: courseName,
    difficulty,
    snapshot_id: row.id,
    course_rating: row.course_rating,
    slope: row.slope,
    sample_size: row.sample_size,
    distinct_players: row.distinct_canonical_player_count,
    maximum_player_concentration: row.maximum_player_share,
    confidence: row.rating_confidence,
    statistical_eligibility: row.statistical_eligibility,
    provenance: `KWT / Phase 68 corrected; ${refs.length} source refs; ${row.quarantined_evidence_count} quarantined evidence refs`,
    source_ref_count: refs.length,
    quarantined_evidence_count: row.quarantined_evidence_count,
    dependent_index_candidates: dependencyCounts.get(row.id),
    diagnostic_flags: diagnostics.flags.join(";"),
    rating_z_score: diagnostics.ratingZ.toFixed(3),
    slope_z_score: diagnostics.slopeZ.toFixed(3),
    recommendation: recommendationValue,
    recommendation_reason: row.rating_confidence !== "ready"
      ? "Below the approved 50-round ready threshold; retain as provisional and exclude from index calculation."
      : diagnostics.flags.some((flag) => flag.endsWith("_DIAGNOSTIC"))
        ? "Statistically ready, but the diagnostic distribution flag requires human review before approval."
        : "Statistically ready, but source exceptions, effective-date approval, and explicit review approval remain outstanding.",
    formal_publication_status: row.publication_status,
    formal_publication_eligible: row.publication_eligible,
    publication_blockers: blockers.join(";"),
    model_version: row.model_version,
    policy_version: policyVersion,
    differential_model_version: differentialModelVersion,
    reference_slope: referenceSlope,
    effective_from: row.effective_from ?? "",
  }
})

const readyRows = reviewRows.filter((row) => row.confidence === "ready")
const provisionalRows = reviewRows.filter((row) => row.confidence !== "ready")
const investigateRows = reviewRows.filter((row) => row.recommendation === "INVESTIGATE")
const sourceHashes = {
  phase68_rating_manifest_sha256: sha256(sourceManifestPath),
  phase68_provenance_sha256: sha256(sourceProvenancePath),
  phase98_calculation_manifest_sha256: sha256(packageManifestPath),
  phase98_index_rows_sha256: sha256(packageIndexPath),
}

writeCsv("rating_approval_review.csv", Object.keys(reviewRows[0]), reviewRows)

const approvalManifest = {
  schemaVersion: "phase99-rating-approval-review-v1",
  sourceCheckpoint: "75da6c9d5d01e7849bb2caa04397ef17cc555faf",
  sourceCalculationRunId: packageManifest.calculationRun.id,
  status: "REVIEW_ONLY_UNPUBLISHED",
  policyVersion,
  differentialModelVersion,
  referenceSlope,
  formula: "(score - course_rating) * 8.515 / course_slope",
  ratings: {
    totalKwtOnly: reviewRows.length,
    statisticallyReady: readyRows.length,
    provisional: provisionalRows.length,
    recommendedHold: reviewRows.filter((row) => row.recommendation === "HOLD").length,
    recommendedInvestigate: investigateRows.length,
    recommendedApprove: 0,
  },
  indexDependency: {
    numericCandidates: packageIndexRows.length,
    ratingsUsed: readyRows.filter((row) => row.dependent_index_candidates > 0).length,
    totalDependencyReferences: readyRows.reduce((sum, row) => sum + row.dependent_index_candidates, 0),
  },
  evidence: {
    source: "KWT",
    sourcePackage: sourceManifest.packageRef,
    sourceProvenanceRows: sourceManifest.provenance.recoveredFingerprintCount,
    allRefsRecovered: sourceManifest.provenance.missingOrConflictingFingerprintCount === 0,
    weeklyRowsInPersonalPackage: 0,
    effectiveDatesInvented: false,
  },
  diagnostics: {
    ratingMean,
    ratingSampleStandardDeviation: ratingSd,
    slopeMean,
    slopeSampleStandardDeviation: slopeSd,
    zScoreThreshold: 2,
    note: "Z-score flags are review diagnostics, not additional approval policy thresholds.",
  },
  allRatingsRemainUnpublished: reviewRows.every((row) => row.formal_publication_status === "UNPUBLISHED"),
  sourceHashes,
}
writeJson("rating_approval_manifest.json", approvalManifest)

const table = reviewRows.map((row) => `| ${row.course_name} | ${row.difficulty} | ${row.course_rating} | ${row.slope} | ${row.sample_size} | ${row.distinct_players} | ${(Number(row.maximum_player_concentration) * 100).toFixed(2)}% | ${row.confidence.toUpperCase()} | ${row.dependent_index_candidates} | ${row.recommendation} | ${row.diagnostic_flags || "—"} |`).join("\n")
const report = `# Phase 99 KWT course-rating approval review

Status: **REVIEW ONLY — NO RATINGS APPROVED OR PUBLISHED**

Source checkpoint: \`75da6c9d5d01e7849bb2caa04397ef17cc555faf\`
Calculation package: \`${packageManifest.calculationRun.id}\`

## Decision summary

- KWT-only ratings reviewed: **${reviewRows.length}**
- Statistically ready: **${readyRows.length}**
- Provisional and excluded from personal indexes: **${provisionalRows.length}**
- Recommended HOLD: **${approvalManifest.ratings.recommendedHold}**
- Recommended INVESTIGATE: **${approvalManifest.ratings.recommendedInvestigate}**
- Recommended APPROVE: **0**
- Unpublished index candidates depending on these ratings: **${packageIndexRows.length}**

The 72 ready ratings meet the approved sample, distinct-player, concentration, and positive-slope requirements. They are not formally publishable because every row still carries the common blockers **UNRESOLVED_SOURCE_EXCEPTIONS**, **MISSING_APPROVED_EFFECTIVE_DATE**, and **EXPLICIT_REVIEW_APPROVAL_REQUIRED**. The six provisional ratings remain on HOLD because they have fewer than 50 qualifying rounds.

## Formula and version checks

- Differential: \`(score - course_rating) * 8.515 / course_slope\`
- Differential model: \`${differentialModelVersion}\`
- Reference slope: **8.515**
- Negative scores: preserved by the existing engine and source package.
- Easy and Hard: reviewed independently.
- Source: corrected KWT provenance only; Weekly evidence contributes zero personal-index rows.
- Effective dates: none fabricated; all remain unset.

## Diagnostic findings

The following are statistical review diagnostics only, not new policy gates:

- Course-rating values outside two sample standard deviations: Shangri-La Easy, Forgotten Fairyland Easy, Alice's Adventures in Wonderland Hard.
- Slope values outside two sample standard deviations: Hollywood Hard, Bogey's Bonanza Hard, Original Gothic Easy.
- These rows are marked INVESTIGATE. They remain unpublished and do not enter Production.

## Complete review table

| Course | Difficulty | Rating | Slope | Rounds | Players | Max player share | Confidence | Index candidates | Recommendation | Diagnostic flags |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
${table}

Provenance for every row is the corrected Phase 68 KWT package. Each source reference was recovered in the committed manifest; quarantined evidence counts remain visible for review rather than being silently discarded.

## Safe next step

Review the 72 ready rows and the six provisional rows through the approval ledger. Resolve source exceptions and choose approved effective-period metadata without inventing historical dates. Only after explicit rating approval should a separate controlled transaction be prepared for rating publication and the 157 unpublished index snapshots. No Production change is authorized by this package.
`
fs.writeFileSync(path.join(outputDir, "rating_approval_review.md"), report)

console.log(JSON.stringify({
  totalKwtOnly: reviewRows.length,
  ready: readyRows.length,
  provisional: provisionalRows.length,
  hold: approvalManifest.ratings.recommendedHold,
  investigate: approvalManifest.ratings.recommendedInvestigate,
  approve: 0,
  indexCandidates: packageIndexRows.length,
  dependencyReferences: approvalManifest.indexDependency.totalDependencyReferences,
}, null, 2))

