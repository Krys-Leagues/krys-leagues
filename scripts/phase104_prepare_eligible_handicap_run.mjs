import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase104")
const policyVersion = "krys-handicap-approved-policy-v1"
const differentialModelVersion = "krys-handicap-candidate-a-v1"
const ratingModelVersion = "krys-course-rating-elite-lowest-12-v1"
const chronologyPolicy = "OFFICIAL_KWT_SEQUENCE"
const packageRef = "phase104-first-eligible-kwt-handicap-run-v1"
const runId = uuidFromText(`calculation-run:${packageRef}:${policyVersion}:${differentialModelVersion}:${chronologyPolicy}`)

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase()
}

function sha256File(relativePath) {
  return sha256Text(read(relativePath))
}

function parseCsv(relativePath) {
  const result = Papa.parse(read(relativePath), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${relativePath}: ${JSON.stringify(result.errors)}`)
  return result.data
}

function uuidFromText(value) {
  const hex = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const normalized = hex.join("")
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(fileName, columns, rows) {
  const lines = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))]
  fs.writeFileSync(path.join(outputDir, fileName), `${lines.join("\n")}\n`)
}

function parseJsonArray(value, label) {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error("not an array")
    return parsed
  } catch (error) {
    throw new Error(`${label}: invalid JSON array (${error.message})`)
  }
}

function parseMetadata(value, label) {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`${label}: invalid JSON (${error.message})`)
  }
}

function requireUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label}: invalid UUID ${value}`)
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label}: missing text`)
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true })

  const sourceManifestPath = "docs/handicap/phase68/rating_snapshot_import_manifest.json"
  const sourceProvenancePath = "docs/handicap/phase68/handicap_source_provenance_import.csv"
  const sourceIndexPath = "docs/handicap/phase98/index_snapshot_import_rows.csv"
  const approvalPath = "docs/handicap/phase101/rating_approval_manifest.csv"
  const periodPath = "docs/handicap/phase101/season_week_effective_period_manifest.csv"

  const sourceManifest = JSON.parse(read(sourceManifestPath))
  const sourceRatings = sourceManifest.ratingSnapshots
  if (sourceRatings.length !== 169) throw new Error(`expected 169 source ratings, got ${sourceRatings.length}`)
  const provenanceRows = parseCsv(sourceProvenancePath)
  const provenanceByFingerprint = new Map(provenanceRows.map((row) => [row.source_fingerprint, row]))
  if (provenanceRows.length !== 14394 || provenanceByFingerprint.size !== provenanceRows.length) {
    throw new Error("source provenance count or uniqueness differs from validated package")
  }
  const approvalRows = parseCsv(approvalPath)
  const periodRows = parseCsv(periodPath)
  const approvalById = new Map(approvalRows.map((row) => [row.snapshot_id, row]))
  const periodById = new Map(periodRows.map((row) => [row.snapshot_id, row]))
  if (approvalRows.length !== 78 || periodRows.length !== 78) throw new Error("Phase 101 manifests must contain 78 rows")

  const readyRatings = sourceRatings.filter((row) => {
    const approval = approvalById.get(row.id)
    return row.review_scope === "KWT_ONLY"
      && row.rating_confidence === "ready"
      && ["APPROVE_PENDING_FORMAL_REVIEW", "APPROVE_AFTER_DIAGNOSTIC_REVIEW"].includes(approval?.recommendation)
  })
  const provisionalRatings = sourceRatings.filter((row) => {
    const approval = approvalById.get(row.id)
    return row.review_scope === "KWT_ONLY" && row.rating_confidence === "provisional" && approval?.recommendation === "HOLD_PROVISIONAL"
  })
  if (readyRatings.length !== 72 || provisionalRatings.length !== 6) {
    throw new Error(`Phase 101 eligibility differs: ready=${readyRatings.length}, provisional=${provisionalRatings.length}`)
  }

  const snapshotIdMap = new Map()
  const ratingRows = readyRatings.map((source) => {
    const period = periodById.get(source.id)
    if (!period || period.chronology_policy !== chronologyPolicy || period.source_scope !== "KWT_ONLY") {
      throw new Error(`missing or incompatible effective period for ${source.id}`)
    }
    if (period.effective_from !== "" || period.publication_eligible !== "false") {
      throw new Error(`unapproved effective date or publication flag for ${source.id}`)
    }
    const refs = Array.isArray(source.source_evidence_refs) ? source.source_evidence_refs : parseJsonArray(source.source_evidence_refs, source.id)
    if (!refs.length || refs.some((ref) => provenanceByFingerprint.get(ref)?.source_type !== "KWT" || !provenanceByFingerprint.get(ref)?.canonical_player_id)) {
      throw new Error(`rating ${source.id} has incomplete KWT provenance`)
    }
    const id = uuidFromText(`rating-snapshot:${runId}:KWT_ONLY:${source.course_id}:${source.difficulty}:${ratingModelVersion}`)
    requireUuid(id, `rating ${source.id}`)
    if (snapshotIdMap.has(source.id)) throw new Error(`duplicate source rating ${source.id}`)
    snapshotIdMap.set(source.id, id)
    return {
      id,
      calculation_run_id: runId,
      course_id: source.course_id,
      difficulty: source.difficulty,
      course_rating: source.course_rating,
      slope: source.slope,
      sample_size: source.sample_size,
      distinct_canonical_player_count: source.distinct_canonical_player_count,
      rating_confidence: "ready",
      model_version: ratingModelVersion,
      effective_from: "",
      effective_period: period.proposed_effective_period,
      source_evidence_refs: JSON.stringify(refs),
      publication_status: "UNPUBLISHED",
      review_scope: "KWT_ONLY",
      statistical_eligibility: "ELIGIBLE",
      import_eligible: "true",
      publication_eligible: "false",
      maximum_player_concentration: source.maximum_player_concentration,
      source_ref_count: refs.length,
      observed_period_start: period.observed_period_start,
      observed_period_end: period.observed_period_end,
    }
  })
  if (new Set(ratingRows.map((row) => row.id)).size !== 72) throw new Error("rating snapshot IDs are not unique")

  const provisionalRows = provisionalRatings.map((row) => ({
    snapshot_id: row.id,
    course_id: row.course_id,
    difficulty: row.difficulty,
    course_rating: row.course_rating,
    slope: row.slope,
    sample_size: row.sample_size,
    distinct_canonical_player_count: row.distinct_canonical_player_count,
    reason: "PROVISIONAL_SAMPLE_EXCLUDED_FROM_FIRST_ELIGIBLE_RUN",
  }))

  const sourceIndexes = parseCsv(sourceIndexPath)
  if (sourceIndexes.length !== 157) throw new Error(`expected 157 index candidates, got ${sourceIndexes.length}`)
  const indexRows = sourceIndexes.map((source) => {
    requireUuid(source.canonical_player_id, "index canonical_player_id")
    const oldRatingIds = parseJsonArray(source.rating_snapshot_ids, source.id)
    const newRatingIds = oldRatingIds.map((oldId) => {
      const mapped = snapshotIdMap.get(oldId)
      if (!mapped) throw new Error(`index ${source.id} references non-ready rating ${oldId}`)
      return mapped
    })
    const ratingVersionIds = newRatingIds
    const sourceRoundIds = parseJsonArray(source.source_round_ids, source.id)
    if (!sourceRoundIds.length || sourceRoundIds.some((ref) => provenanceByFingerprint.get(ref)?.source_type !== "KWT")) {
      throw new Error(`index ${source.id} is not KWT-only`) 
    }
    const latestTen = parseJsonArray(source.latest_ten_source_round_ids, source.id)
    const bestFive = parseJsonArray(source.best_five_source_round_ids, source.id)
    if (source.chronology_confidence !== "OFFICIAL_KWT_SEQUENCE" || source.publication_status !== "UNPUBLISHED") {
      throw new Error(`index ${source.id} has incompatible publication state`)
    }
    const id = uuidFromText(`local-handicap-index:${runId}:${source.canonical_player_id}:${differentialModelVersion}:${latestTen.join("|")}`)
    requireUuid(id, `index ${source.id}`)
    return {
      id,
      calculation_run_id: runId,
      canonical_player_id: source.canonical_player_id,
      source_round_ids: JSON.stringify(sourceRoundIds),
      rating_snapshot_ids: JSON.stringify(ratingVersionIds),
      rating_version_ids: JSON.stringify(ratingVersionIds),
      differential_model_version: differentialModelVersion,
      latest_ten_source_round_ids: JSON.stringify(latestTen),
      best_five_source_round_ids: JSON.stringify(bestFive),
      resulting_index: source.resulting_index,
      chronology_confidence: "OFFICIAL_KWT_SEQUENCE",
      publication_status: "UNPUBLISHED",
      source_snapshot_id: source.id,
    }
  })
  if (new Set(indexRows.map((row) => row.id)).size !== 157) throw new Error("index snapshot IDs are not unique")

  const blockedRows = parseCsv("docs/handicap/phase98/blocked_players.csv")
  if (blockedRows.length !== 44) throw new Error(`expected 44 blocked players, got ${blockedRows.length}`)

  const calculationRun = {
    id: runId,
    label: packageRef,
    policy_version: policyVersion,
    model_version: differentialModelVersion,
    source_package_ref: "phase68-provenance-recovery-v1",
    chronology_policy: chronologyPolicy,
    status: "DRAFT",
    publication_eligibility: "QUARANTINED",
    metadata: {
      allow_official_kwt_sequence_publication: true,
      source_scope: "KWT_ONLY",
      source_separation: "THE_WEEKLY excluded from personal indexes",
      effective_from: null,
      effective_period_policy: "KWT_SEASON_WEEK_ONLY",
      rating_approval_required: true,
      index_publication_requires_separate_approval: true,
      preserved_quarantined_source_exception_count: 808,
    },
  }
  const manifest = {
    schemaVersion: "phase104-first-eligible-kwt-handicap-run-v1",
    packageRef,
    calculationRun,
    policy: {
      differential: "(score - course rating) * 8.515 / course slope",
      referenceSlope: 8.515,
      latestRoundLimit: 10,
      bestRoundLimit: 5,
      minimumIndexRounds: 5,
      chronologyOrdering: "Season -> Week -> Easy -> Hard",
      chronologyConfidence: chronologyPolicy,
    },
    sourceInputs: {
      phase98CalculationRunId: "e2f53406-75b7-5acb-a3e9-9bec0d39421b",
      phase101ApprovalManifest: sha256File(approvalPath),
      phase101PeriodManifest: sha256File(periodPath),
      phase68Provenance: sha256File(sourceProvenancePath),
      phase98IndexCandidates: sha256File(sourceIndexPath),
    },
    counts: {
      readyRatingSnapshots: ratingRows.length,
      provisionalRatingsExcluded: provisionalRows.length,
      playerIndexSnapshots: indexRows.length,
      blockedPlayers: blockedRows.length,
      correctedKwtProvenanceRowsReferenced: 13550,
      weeklyRowsExcludedFromPersonalIndexes: 844,
      quarantinedSourceExceptionsPreserved: 808,
      effectiveFromValuesInvented: 0,
    },
    publication: {
      allRatingsUnpublished: true,
      allIndexesUnpublished: true,
      runDraft: true,
      runQuarantined: true,
      formalApprovalRequired: true,
      productionWrites: false,
    },
  }

  writeCsv("rating_snapshot_import_rows.csv", [
    "id", "calculation_run_id", "course_id", "difficulty", "course_rating", "slope", "sample_size", "distinct_canonical_player_count", "rating_confidence", "model_version", "effective_from", "effective_period", "source_evidence_refs", "publication_status", "review_scope", "statistical_eligibility", "import_eligible", "publication_eligible", "maximum_player_concentration", "source_ref_count", "observed_period_start", "observed_period_end",
  ], ratingRows)
  writeCsv("index_snapshot_import_rows.csv", [
    "id", "calculation_run_id", "canonical_player_id", "source_round_ids", "rating_snapshot_ids", "rating_version_ids", "differential_model_version", "latest_ten_source_round_ids", "best_five_source_round_ids", "resulting_index", "chronology_confidence", "publication_status", "source_snapshot_id",
  ], indexRows)
  writeCsv("provisional_rating_exclusions.csv", Object.keys(provisionalRows[0]), provisionalRows)
  writeCsv("blocked_players.csv", Object.keys(blockedRows[0]), blockedRows)
  writeCsv("snapshot_id_map.csv", ["source_phase98_snapshot_id", "phase104_snapshot_id", "course_id", "difficulty"], readyRatings.map((row) => ({ source_phase98_snapshot_id: row.id, phase104_snapshot_id: snapshotIdMap.get(row.id), course_id: row.course_id, difficulty: row.difficulty })))
  fs.writeFileSync(path.join(outputDir, "calculation_run_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)

  const plan = `# Phase 104 controlled installation plan\n\n` +
    `This package is local-only. No Production rows were inserted.\n\n` +
    `## Exact package\n\n` +
    `- Package: \`${packageRef}\`\n- Run: \`${runId}\`\n- Run state: \`DRAFT / QUARANTINED\`\n- Ratings: 72 ready KWT-only snapshots, all \`UNPUBLISHED\`\n- Indexes: 157 KWT-only candidates, all \`UNPUBLISHED\`\n- Provisional ratings excluded: 6\n- Blocked players: 44\n\n` +
    `## Installation order (future approval required)\n\n` +
    `1. Read-only preflight confirms project identity, Phase 103 gate, all source fingerprints, UUIDs, package checksums, empty target run/snapshot IDs, and unchanged legacy counts.\n` +
    `2. Begin one transaction and acquire the reviewed advisory lock.\n` +
    `3. Insert the DRAFT/QUARANTINED calculation run with explicit KWT-only scope and opt-in metadata.\n` +
    `4. Validate that all source evidence references already exist and are KWT with canonical UUIDs; do not insert or alter provenance in this package.\n` +
    `5. Insert 72 rating snapshots with NULL calendar dates, validated Season/Week effective periods, \`KWT_ONLY\`, and \`UNPUBLISHED\`.\n` +
    `6. Insert 157 index snapshots with remapped Phase 104 rating IDs, \`OFFICIAL_KWT_SEQUENCE\`, and \`UNPUBLISHED\`.\n` +
    `7. Assert exact counts, source separation, foreign-key integrity, no Weekly index references, and no publication state.\n` +
    `8. Commit; otherwise abort the entire transaction on any mismatch.\n\n` +
    `## Prohibited\n\n` +
    `No UPDATE, DELETE, TRUNCATE, migration, legacy-table write, rating publication, index publication, player identity change, or historical-score change.\n\n` +
    `## Postflight\n\n` +
    `Expect the two pre-existing quarantined runs and the new quarantined run to remain non-publishable; all imported rows remain unpublished; publishable views remain empty; legacy Handicap counts remain unchanged; Weekly provenance remains excluded from personal indexes.\n\n` +
    `## Failure handling\n\n` +
    `Any duplicate ID, missing source fingerprint, invalid UUID, invalid period, non-KWT reference, foreign-key failure, or publication-state mismatch aborts the transaction. Do not repair in place or rerun without a new read-only preflight.\n`
  fs.writeFileSync(path.join(outputDir, "production_installation_plan.md"), plan)

  const artifacts = [
    "calculation_run_manifest.json", "rating_snapshot_import_rows.csv", "index_snapshot_import_rows.csv", "provisional_rating_exclusions.csv", "blocked_players.csv", "snapshot_id_map.csv", "production_installation_plan.md",
  ]
  const checksums = Object.fromEntries(artifacts.map((file) => {
    const contents = fs.readFileSync(path.join(outputDir, file))
    return [file, { sha256: sha256Text(contents), bytes: contents.length }]
  }))
  checksums.source_artifacts = {
    phase68_provenance: sha256File(sourceProvenancePath),
    phase101_approval: sha256File(approvalPath),
    phase101_periods: sha256File(periodPath),
    phase98_indexes: sha256File(sourceIndexPath),
  }
  fs.writeFileSync(path.join(outputDir, "package_checksums.json"), `${JSON.stringify({ schemaVersion: "phase104-package-checksums-v1", packageRef, runId, artifacts: checksums }, null, 2)}\n`)
  fs.writeFileSync(path.join(outputDir, "package_report.md"), `# Phase 104 package report\n\n- Status: READY FOR SEPARATE PRODUCTION REVIEW; NOT INSTALLED\n- Run: \`${runId}\`\n- 72 ready KWT-only ratings\n- 6 provisional ratings excluded\n- 157 unpublished index candidates\n- 44 blocked players\n- 808 quarantined source exceptions preserved\n- 844 Weekly observations excluded from personal indexes\n- Calendar effective dates invented: 0\n- Production writes: 0\n\nThe generated identifiers and package hashes are deterministic. The package reuses the validated Phase 98 selected rounds and Phase 101 Season/Week period descriptors; it does not recalculate historical evidence.\n`)

  console.log(JSON.stringify({ packageRef, runId, readyRatings: ratingRows.length, provisionalExcluded: provisionalRows.length, indexCandidates: indexRows.length, blockedPlayers: blockedRows.length, sourceKwtRows: 13550, sourceWeeklyRowsExcluded: 844, quarantinedExceptions: 808 }, null, 2))
}

main()
