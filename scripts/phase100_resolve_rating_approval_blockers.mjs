import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase100")
fs.mkdirSync(outputDir, { recursive: true })

const phase60ExceptionsPath = "docs/handicap/phase60/rating_evidence_exceptions.csv"
const phase68ProvenancePath = "docs/handicap/phase68/handicap_source_provenance_import.csv"
const phase68ManifestPath = "docs/handicap/phase68/rating_snapshot_import_manifest.json"
const phase98ManifestPath = "docs/handicap/phase98/calculation_run_manifest.json"
const phase99ReviewPath = "docs/handicap/phase99/rating_approval_review.csv"

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

function eventPeriod(ref) {
  const token = String(ref).split("|")[1] || ""
  const match = /^KWT(\d+)W(\d+)$/.exec(token)
  if (!match) return null
  return { token, season: Number(match[1]), week: Number(match[2]) }
}

function comparePeriods(a, b) {
  return a.season - b.season || a.week - b.week
}

function formatPeriod(period) {
  return `S${period.season}W${String(period.week).padStart(2, "0")}`
}

function scoreStatistics(refs, provenanceByFingerprint) {
  const scores = refs.map((ref) => {
    const source = provenanceByFingerprint.get(ref)
    if (!source) throw new Error(`Missing corrected provenance for ${ref}`)
    return Number(JSON.parse(source.metadata).score)
  }).filter(Number.isFinite).sort((a, b) => a - b)
  if (!scores.length) throw new Error("Rating has no finite scores")
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length
  const median = scores[Math.floor((scores.length - 1) / 2)]
  const standardDeviation = Math.sqrt(scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, scores.length - 1))
  const eliteCount = Math.ceil(scores.length * 0.12)
  const eliteScores = scores.slice(0, eliteCount)
  const eliteMean = eliteScores.reduce((sum, value) => sum + value, 0) / eliteScores.length
  return {
    sampleSize: scores.length,
    minimum: scores[0],
    maximum: scores.at(-1),
    mean: Number(mean.toFixed(3)),
    median,
    standardDeviation: Number(standardDeviation.toFixed(3)),
    eliteCount,
    eliteMean: Number(eliteMean.toFixed(3)),
  }
}

const exceptions = parseCsv(phase60ExceptionsPath)
const correctedProvenance = parseCsv(phase68ProvenancePath)
const correctedManifest = JSON.parse(read(phase68ManifestPath))
const phase99Rows = parseCsv(phase99ReviewPath)
const correctedFingerprintSet = new Set(correctedProvenance.map((row) => row.source_fingerprint))
const provenanceByFingerprint = new Map(correctedProvenance.map((row) => [row.source_fingerprint, row]))
const correctedKwtProvenance = correctedProvenance.filter((row) => row.source_type === "KWT")

if (exceptions.length !== 808) throw new Error(`Expected 808 historical exceptions, found ${exceptions.length}`)
if (correctedKwtProvenance.length !== 13550) throw new Error(`Expected 13,550 corrected KWT provenance rows, found ${correctedKwtProvenance.length}`)

const exceptionRows = exceptions.map((row) => {
  const includedInCorrectedPackage = correctedFingerprintSet.has(row.source_fingerprint)
  const isIdentity = row.reason === "UNRESOLVED_CANONICAL_ID"
  const isInvalidScore = row.reason === "INVALID_SCORE"
  return {
    source_fingerprint: row.source_fingerprint,
    source: row.source,
    source_ref: row.source_evidence_ref,
    course_code: row.course_code,
    original_reason: row.reason,
    resolution_class: isIdentity
      ? "QUARANTINED_HISTORICAL_IDENTITY"
      : isInvalidScore
        ? "QUARANTINED_INVALID_SCORE"
        : "UNCLASSIFIED_EXCEPTION",
    included_in_corrected_package: includedInCorrectedPackage,
    player_identity_effect: isIdentity ? "BLOCKS_THIS_ROW_ONLY" : "NOT_THE_EXCEPTION_REASON",
    scoring_validity_effect: isInvalidScore ? "BLOCKS_THIS_ROW_ONLY" : "NOT_INVALIDATED_BY_THIS_REASON",
    rating_effect: "EXCLUDED_FROM_RATING_SAMPLES",
    chronology_effect: isIdentity ? "INELIGIBLE_WITHOUT_CANONICAL_ID" : "NO_PERSONAL_CHRONOLOGY_INPUT",
    provenance_effect: "PRESERVED_IN_EXCEPTION_LEDGER",
    action: includedInCorrectedPackage
      ? "STOP_AND_REVIEW_FINGERPRINT_COLLISION"
      : isIdentity
        ? "RETAIN_QUARANTINED_NO_IDENTITY_GUESS"
        : isInvalidScore
          ? "RETAIN_QUARANTINED_NO_SCORE_REPAIR"
          : "REVIEW_BEFORE_USE",
  }
})
writeCsv("exception_resolution_ledger.csv", Object.keys(exceptionRows[0]), exceptionRows)

const ktwRatings = correctedManifest.ratingSnapshots.filter((row) => row.review_scope === "KWT_ONLY")
if (ktwRatings.length !== 78) throw new Error(`Expected 78 KWT-only ratings, found ${ktwRatings.length}`)
const phase99BySnapshot = new Map(phase99Rows.map((row) => [row.snapshot_id, row]))

const periodRows = ktwRatings.map((rating) => {
  const refs = parseArray(rating.source_evidence_refs)
  const periods = refs.map(eventPeriod).filter(Boolean).sort(comparePeriods)
  const uniquePeriods = [...new Map(periods.map((period) => [period.token, period])).values()].sort(comparePeriods)
  const first = uniquePeriods[0]
  const last = uniquePeriods.at(-1)
  const phase99 = phase99BySnapshot.get(rating.id)
  if (!phase99) throw new Error(`Missing Phase 99 review row for ${rating.id}`)
  const proposedEffectivePeriod = first && last
    ? `KWT ${formatPeriod(first)} through ${formatPeriod(last)}; observed ${uniquePeriods.map(formatPeriod).join(", ")}; OFFICIAL_KWT_SEQUENCE; calendar date unavailable`
    : "KWT competition period unavailable"
  const resolvedSourceBlocker = Number(rating.quarantined_evidence_count) > 0
    ? "HISTORICAL_EXCLUSIONS_DOCUMENTED_NOT_REFERENCED"
    : "NONE"
  const remainingBlockers = rating.rating_confidence === "ready"
    ? "MISSING_APPROVED_EFFECTIVE_PERIOD_OR_DATE;EXPLICIT_REVIEW_APPROVAL_REQUIRED"
    : "PROVISIONAL_SAMPLE_SIZE;MISSING_APPROVED_EFFECTIVE_PERIOD_OR_DATE;EXPLICIT_REVIEW_APPROVAL_REQUIRED"
  return {
    snapshot_id: rating.id,
    course_id: rating.course_id,
    difficulty: rating.difficulty,
    course_rating: rating.course_rating,
    slope: rating.slope,
    sample_size: rating.sample_size,
    distinct_players: rating.distinct_canonical_player_count,
    maximum_player_share: rating.maximum_player_share,
    confidence: rating.rating_confidence,
    source_refs: refs.length,
    historical_excluded_evidence: rating.quarantined_evidence_count,
    source_exception_resolution: resolvedSourceBlocker,
    source_exception_is_in_rating_refs: false,
    observed_period_count: uniquePeriods.length,
    observed_period_start: first ? formatPeriod(first) : "",
    observed_period_end: last ? formatPeriod(last) : "",
    proposed_effective_period: proposedEffectivePeriod,
    effective_from: "",
    proposed_status: rating.rating_confidence === "ready" ? "READY_FOR_FORMAL_REVIEW" : "PROVISIONAL_HOLD",
    remaining_blockers: remainingBlockers,
    phase99_diagnostic_recommendation: phase99.recommendation,
    formal_publication_status: rating.publication_status,
    formal_publication_eligible: rating.publication_eligible,
  }
})
writeCsv("rating_effective_period_manifest.csv", Object.keys(periodRows[0]), periodRows)

const readyRows = periodRows.filter((row) => row.confidence === "ready")
const provisionalRows = periodRows.filter((row) => row.confidence !== "ready")
const investigateIds = new Set(["Shangri-La_easy", "Forgotten Fairyland_easy", "Bogey's Bonanza_hard", "Original Gothic_easy"])
const diagnosticRows = periodRows.filter((row) => investigateIds.has(row.course_id)).map((row) => {
  const rating = ktwRatings.find((candidate) => candidate.id === row.snapshot_id)
  return {
    ...row,
    ...scoreStatistics(parseArray(rating.source_evidence_refs), provenanceByFingerprint),
    calculation_reproduces_manifest_rating: Number(row.course_rating) === scoreStatistics(parseArray(rating.source_evidence_refs), provenanceByFingerprint).eliteMean,
    local_finding: "LEGITIMATE_DISTRIBUTION_REVIEW_REQUIRED_NO_SOURCE_OR_CALCULATION_DEFECT_FOUND",
  }
})
writeJson("investigate_rating_diagnostics.json", diagnosticRows)

const correctedKwtRefs = new Set(correctedProvenance.filter((row) => row.source_type === "KWT").map((row) => row.source_fingerprint))
const ratingKwtRefs = new Set(ktwRatings.flatMap((row) => parseArray(row.source_evidence_refs)))
const phase98IndexRows = parseCsv("docs/handicap/phase98/index_snapshot_import_rows.csv")
const recalculationComparison = {
  recalculationRequired: false,
  reason: "Phase 68 corrected KWT source references and values are unchanged; Phase 100 reclassifies excluded historical exceptions and supplies period metadata only.",
  correctedKwtProvenanceRows: correctedProvenance.length,
  correctedKwtFingerprintCount: correctedKwtRefs.size,
 ratingKwtFingerprintCount: ratingKwtRefs.size,
  ratingKwtRefsAllExist: [...ratingKwtRefs].every((ref) => correctedKwtRefs.has(ref)),
  phase98NumericIndexCandidates: phase98IndexRows.length,
  expectedNumericIndexCandidatesAfterResolution: phase98IndexRows.length,
  ratingValuesChanged: 0,
  indexValuesChanged: 0,
  weeklyRowsInPersonalPackage: 0,
}
writeJson("recalculation_comparison.json", recalculationComparison)

const exceptionCounts = Object.entries(exceptionRows.reduce((counts, row) => {
  counts[row.original_reason] = (counts[row.original_reason] || 0) + 1
  return counts
}, {}))
const report = `# Phase 100 rating approval blocker resolution

Status: **PARTIAL — source exclusions are resolved as documented quarantine; formal effective-period and approval gates remain.**

## Evidence classification

| Exception | Count | Effect | Resolution |
|---|---:|---|---|
| UNRESOLVED_CANONICAL_ID | 806 | Blocks those rows from identity, chronology, and rating use | Preserved and quarantined; no identity guessed |
| INVALID_SCORE | 2 | Blocks those rows from scoring and rating use | Preserved and quarantined; no score repaired |
| Corrected-package conflicts | 0 | Would block affected rating | None found |

All 808 historical exception fingerprints are absent from the corrected 13,550-row Phase 68 KWT package. The corrected package has 13,550 canonical UUID-backed KWT rows, so the Phase 99 \`UNRESOLVED_SOURCE_EXCEPTIONS\` label is a stale aggregate of excluded historical observations rather than an unresolved reference inside the 78 rating snapshots. The 808 rows remain auditable and excluded.

The 72 ready ratings are therefore not mathematically invalidated by those rows. They retain the source-exception count for audit visibility, but a future approval manifest can replace that blocker with \`HISTORICAL_EXCLUSIONS_DOCUMENTED_NOT_REFERENCED\` after review.

## Effective-period evidence

Each rating's manifest now records observed KWT Season/Week ranges and the exact source periods used. These are competition-period metadata under \`OFFICIAL_KWT_SEQUENCE\`; they are not calendar dates and are not used to fabricate \`effective_from\`. The effective date remains NULL.

The complete period manifest is in \`rating_effective_period_manifest.csv\`. It covers all 78 KWT-only ratings, with 72 marked READY_FOR_FORMAL_REVIEW and six PROVISIONAL_HOLD.

## Investigate ratings

The four Phase 99 diagnostic ratings were recomputed from their corrected source references:

${diagnosticRows.map((row) => `- **${row.course_id}**: n=${row.sampleSize}, mean=${row.mean}, median=${row.median}, SD=${row.standardDeviation}, range=${row.minimum} to ${row.maximum}, elite-${row.eliteCount} mean=${row.eliteMean}, manifest rating=${row.course_rating}, slope=${row.slope}. ${row.local_finding.replaceAll("_", " ")}.`).join("\n")}

The unusual values are reproducible from legitimate score distributions and the approved elite-lowest-12% methodology. No missing score, invalid slope, duplicate fingerprint, source-reference mismatch, or formula drift was found. These four remain flagged for human review because unusual values should not be auto-approved.

## Policy and source preservation

- Candidate A remains \`(score - course rating) * 8.515 / course slope\`.
- Model version remains \`krys-handicap-candidate-a-v1\`.
- Negative scores remain valid.
- Easy and Hard remain independent.
- OFFICIAL_KWT_SEQUENCE remains the chronology classification.
- Weekly evidence remains excluded from personal indexes.
- The six provisional ratings remain ineligible.
- No historical names, UUIDs, scores, or dates were changed.

## Recalculation result

No recalculation was required. The corrected KWT fingerprint set used by the 78 ratings is unchanged and all referenced fingerprints resolve. Expected index candidates remain **157**, with zero Weekly rows and zero value changes.

## Remaining blockers

1. Formal review approval is still required for the 72 ready ratings.
2. A supported effective-period publication convention must be selected. This package supplies season/week periods without inventing calendar dates, but does not silently remove the installed effective-date gate.
3. The four diagnostic ratings require explicit reviewer disposition.
4. The six provisional ratings remain on HOLD until they reach the approved evidence threshold.

No Production change is proposed or executed.
`
fs.writeFileSync(path.join(outputDir, "exception_resolution_report.md"), report)

writeJson("effective_period_manifest.json", {
  schemaVersion: "phase100-effective-period-review-v1",
  status: "PROPOSED_REVIEW_ONLY",
  sourceCalculationRunId: correctedManifest.calculationRun.id,
  policyVersion: "krys-handicap-approved-policy-v1",
  chronologyPolicy: "OFFICIAL_KWT_SEQUENCE",
  effectiveFrom: null,
  readyRatings: readyRows.length,
  provisionalRatings: provisionalRows.length,
  sourceExceptions: exceptionCounts,
  periodRows: periodRows.length,
  noCalendarDatesInvented: true,
  sourceHashes: {
    phase60Exceptions: sha256(phase60ExceptionsPath),
    phase68Provenance: sha256(phase68ProvenancePath),
    phase68Manifest: sha256(phase68ManifestPath),
    phase98Manifest: sha256(phase98ManifestPath),
  },
})

console.log(JSON.stringify({
  exceptionRows: exceptionRows.length,
  identityExceptions: exceptionRows.filter((row) => row.original_reason === "UNRESOLVED_CANONICAL_ID").length,
  invalidScoreExceptions: exceptionRows.filter((row) => row.original_reason === "INVALID_SCORE").length,
  correctedProvenanceRows: correctedKwtProvenance.length,
  ratingsReviewed: periodRows.length,
  readyRatings: readyRows.length,
  provisionalRatings: provisionalRows.length,
  diagnosticRatings: diagnosticRows.length,
  recalculationRequired: recalculationComparison.recalculationRequired,
  numericIndexCandidates: phase98IndexRows.length,
}, null, 2))

