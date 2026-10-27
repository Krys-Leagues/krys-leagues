import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const phase134Dir = path.join(root, "docs", "handicap", "phase134")
const phase130Dir = path.join(root, "docs", "handicap", "phase130")
const phase121Dir = path.join(root, "docs", "handicap", "phase121")
const phase104Dir = path.join(root, "docs", "handicap", "phase104")
const phase126Dir = path.join(root, "docs", "handicap", "phase126")
const expectedPhase130BatchSha = "52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B"
const expectedPhase125Sha = "09382A8C7901F549377ADE119E3DF5068CD40A9C8FF9629F572DA5FE7EFB22A6"
const currentRunId = "3973f8e7-f2c9-5d05-bdb7-e49810713612"
const productionProject = "jfbndcwdsvsjgnzwvexp"
const modelVersion = "krys-course-rating-elite-lowest-12-v1"
const sourceScope = "KWT_ONLY"
const ownerApproved = {
  "Bogey's Bonanza_hard": { rating: -22.444, slope: 13.355 },
  "Forgotten Fairyland_easy": { rating: -28.917, slope: 8.127 },
  "Original Gothic_easy": { rating: -20.591, slope: 4.363 },
  "Raptor Cliff's_hard": { rating: -13.895, slope: 12.197 },
  "Shangri-La_easy": { rating: -29.81, slope: 7.342 },
}

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const readCsv = (file) => {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${file}: ${JSON.stringify(parsed.errors)}`)
  return parsed.data
}
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
const writeCsv = (file, rows) => fs.writeFileSync(file, `${Papa.unparse(rows, { newline: "\n" })}\n`, "utf8")
const n = (value) => Number(value)
const key = (row) => `${row.course_id}\u0000${row.difficulty}\u0000${n(row.course_rating)}\u0000${n(row.slope)}`
const jsonArray = (value) => {
  if (!value) return []
  const parsed = JSON.parse(value)
  return Array.isArray(parsed) ? parsed : []
}
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`
const stableHash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").toUpperCase()
const deterministicUuid = (value) => {
  const hex = crypto.createHash("sha256").update(value).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}

fs.mkdirSync(phase134Dir, { recursive: true })
const batchPath = path.join(phase130Dir, "rating_approval_batch_manifest.json")
const phase125Path = path.join(phase121Dir, "rating_approval_manifest.json")
const phase104Path = path.join(phase104Dir, "rating_snapshot_import_rows.csv")
const phase121CandidatesPath = path.join(phase121Dir, "rating_snapshot_candidates.csv")
const phase126Path = path.join(phase126Dir, "player_index_candidates.csv")
const phase130IndexesPath = path.join(phase130Dir, "player_index_approval_manifest.json")
const batchSha = sha256(batchPath)
const phase125Sha = sha256(phase125Path)
if (batchSha !== expectedPhase130BatchSha) throw new Error(`Phase130 batch SHA mismatch: ${batchSha}`)
if (phase125Sha !== expectedPhase125Sha) throw new Error(`Phase125 manifest SHA mismatch: ${phase125Sha}`)

const batch = readJson(batchPath)
const phase125 = readJson(phase125Path)
if (batch.pending_candidate_count !== 73 || batch.pending_candidates.length !== 73) throw new Error("Expected 73 Phase130 pending candidates")
if (phase125.rows.length !== 73) throw new Error("Expected 73 Phase125 reference rows")
if (batch.source_manifest_sha256 !== phase125Sha) throw new Error("Phase130/Phase125 source hash mismatch")
const pendingByKey = new Map(batch.pending_candidates.map((row) => [key(row), row]))
if (pendingByKey.size !== 73) throw new Error("Phase130 pending keys are not unique")

// Phase104's CSV contract records the source scope as `review_scope` (it does
// not have a separate `source_scope` column). Do not treat the missing alias
// as evidence that the Production inventory is empty.
const productionRows = readCsv(phase104Path).filter((row) => row.calculation_run_id === currentRunId && row.review_scope === sourceScope && row.model_version === modelVersion && row.publication_status === "UNPUBLISHED" && row.source_evidence_refs)
const productionByKey = new Map()
for (const row of productionRows) {
  const rowKey = key(row)
  if (productionByKey.has(rowKey)) throw new Error(`Duplicate current Production value key: ${rowKey}`)
  productionByKey.set(rowKey, row)
}
const phase121Candidates = readCsv(phase121CandidatesPath)
const localByCourse = new Map(phase121Candidates.map((row) => [row.course_id, row]))
const reconciliation = []
for (const row of batch.pending_candidates) {
  const prod = productionByKey.get(key(row))
  reconciliation.push({
    batch_scope: "PENDING_73",
    local_snapshot_id: row.snapshot_id,
    course_id: row.course_id,
    difficulty: row.difficulty,
    approved_rating: row.course_rating,
    approved_slope: row.slope,
    production_snapshot_id: prod?.id ?? "",
    production_run_id: prod?.calculation_run_id ?? "",
    production_rating: prod?.course_rating ?? "",
    production_slope: prod?.slope ?? "",
    status: prod ? "EXACT_EXISTING_PRODUCTION" : "BLOCKED_MISSING_EXACT_PRODUCTION_SNAPSHOT_AND_SOURCE_PACKAGE",
    source_ref_count: prod ? jsonArray(prod.source_evidence_refs).length : 0,
    source_refs_sha256: prod ? stableHash(jsonArray(prod.source_evidence_refs)) : "",
    owner_decision: "APPROVED_BY_OWNER_PHASE130",
    blocker: prod ? "" : "No exact Production snapshot and the local candidate has no verified source_evidence_refs for a safe successor.",
  })
}
for (const [courseId, expected] of Object.entries(ownerApproved)) {
  const local = localByCourse.get(courseId)
  if (!local) throw new Error(`Owner-approved course missing from Phase121 candidates: ${courseId}`)
  const prod = productionByKey.get(key({ course_id: courseId, difficulty: local.difficulty, course_rating: expected.rating, slope: expected.slope }))
  const currentByCourse = productionRows.find((candidate) => candidate.course_id === courseId && candidate.difficulty === local.difficulty)
  reconciliation.push({
    batch_scope: "PRIOR_OWNER_APPROVAL_5",
    local_snapshot_id: local.snapshot_id,
    course_id: courseId,
    difficulty: local.difficulty,
    approved_rating: expected.rating,
    approved_slope: expected.slope,
    production_snapshot_id: prod?.id ?? "",
    production_run_id: prod?.calculation_run_id ?? "",
    production_rating: currentByCourse?.course_rating ?? "",
    production_slope: currentByCourse?.slope ?? "",
    status: prod ? "EXACT_EXISTING_PRODUCTION" : "BLOCKED_PRODUCTION_VALUE_MISMATCH",
    source_ref_count: prod ? jsonArray(prod.source_evidence_refs).length : 0,
    source_refs_sha256: prod ? stableHash(jsonArray(prod.source_evidence_refs)) : "",
    owner_decision: "PRESERVED_OWNER_APPROVAL",
    blocker: prod ? "" : `Production has ${currentByCourse?.course_rating ?? "missing"}/${currentByCourse?.slope ?? "missing"}; approved value is ${expected.rating}/${expected.slope}. No exact successor source package is present locally.`,
  })
}

const blockedRatingIds = new Set(reconciliation.filter((row) => row.status !== "EXACT_EXISTING_PRODUCTION").map((row) => row.local_snapshot_id))
const indexRows = readCsv(phase126Path)
const indexManifest = readJson(phase130IndexesPath)
if (indexRows.length !== 166 || indexManifest.counts.total !== 166) throw new Error("Expected 166 index candidates")
const indexReconciliation = indexRows.map((row) => {
  const ids = jsonArray(row.rating_snapshot_ids)
  const missing = ids.filter((id) => blockedRatingIds.has(id))
  return {
    snapshot_id: row.snapshot_id,
    canonical_player_id: row.canonical_player_id,
    canonical_screen_name: row.canonical_screen_name,
    resulting_index: row.resulting_index,
    golf_display_index: row.golf_display_index,
    handicap_status: row.handicap_status,
    active_round_count: row.active_round_count,
    source_scope: row.source_scope,
    weekly_rows_used: row.weekly_rows_used,
    chronology_confidence: row.chronology_confidence,
    rating_snapshot_count: ids.length,
    missing_or_mismatched_local_rating_snapshot_ids: JSON.stringify(missing),
    index_reconciliation_status: missing.length ? "BLOCKED_RATING_DEPENDENCY" : "READY_TO_REVALIDATE_AGAINST_PRODUCTION",
  }
})
if (indexReconciliation.some((row) => row.weekly_rows_used !== "0" && row.weekly_rows_used !== 0)) throw new Error("Weekly rows entered an index candidate")

const exactRows = reconciliation.filter((row) => row.status === "EXACT_EXISTING_PRODUCTION")
const blockedRows = reconciliation.filter((row) => row.status !== "EXACT_EXISTING_PRODUCTION")
const pendingRows = reconciliation.filter((row) => row.batch_scope === "PENDING_73")
const pendingExactRows = pendingRows.filter((row) => row.status === "EXACT_EXISTING_PRODUCTION")
const pendingBlockedRows = pendingRows.filter((row) => row.status !== "EXACT_EXISTING_PRODUCTION")
const ownerRows = reconciliation.filter((row) => row.batch_scope === "PRIOR_OWNER_APPROVAL_5")
const ownerExactRows = ownerRows.filter((row) => row.status === "EXACT_EXISTING_PRODUCTION")
const ownerBlockedRows = ownerRows.filter((row) => row.status !== "EXACT_EXISTING_PRODUCTION")
const evidenceRows = exactRows.map((row) => ({
  evidence_id: deterministicUuid(`phase134-rating-approval-evidence:${batchSha}:${row.production_snapshot_id}`),
  decision_id: deterministicUuid(`phase134-rating-approval-decision:${batchSha}:${row.production_snapshot_id}`),
  snapshot_id: row.production_snapshot_id,
  course_id: row.course_id,
  difficulty: row.difficulty,
  course_rating: row.approved_rating,
  slope: row.approved_slope,
  source_ref: `phase134/rating-approval/${batchSha}/${row.production_snapshot_id}`,
}))

writeCsv(path.join(phase134Dir, "rating_snapshot_reconciliation.csv"), reconciliation)
writeCsv(path.join(phase134Dir, "rating_snapshot_blockers.csv"), blockedRows)
writeCsv(path.join(phase134Dir, "index_dependency_reconciliation.csv"), indexReconciliation)
writeCsv(path.join(phase134Dir, "production_exact_rating_decision_rows.csv"), evidenceRows)

const values = evidenceRows.map((row) => `(${sql(row.evidence_id)}, 'SOURCE_RECORD', ${sql(row.snapshot_id)}, ${sql(row.source_ref)}, ${sql(JSON.stringify({ kind: "PHASE134_OWNER_APPROVED_RATING", snapshot_id: row.snapshot_id, course_id: row.course_id, difficulty: row.difficulty, course_rating: row.course_rating, slope: row.slope, source_batch_sha256: batchSha, owner_approval: "Krys Phase130", publication_status: "UNPUBLISHED" }))}::jsonb)`).join(",\n")
const decisionValues = evidenceRows.map((row) => `(${sql(row.decision_id)}, ${sql(row.evidence_id)}, 'SOURCE_RECORD', ${sql(row.snapshot_id)}, 'ACCEPT', ${sql("Owner-approved rating decision; publication remains separately gated and the snapshot remains UNPUBLISHED.")}, null, 1)`).join(",\n")
const guardedInstall = `-- PHASE134 BLOCKED INSTALLATION PACKAGE; DO NOT EXECUTE UNTIL BLOCKERS ARE RESOLVED AND THIS FILE IS REGENERATED.\n-- Target project: ${productionProject}\n-- Phase130 owner batch SHA-256: ${batchSha}\n-- Exact current Production mappings: ${exactRows.length}; blocked ratings: ${blockedRows.length}\n-- This guard intentionally aborts before any insert while unresolved dependencies exist.\nBEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('phase134-rating-decision-installation', 0));\nDO $$\nBEGIN\n  IF ${blockedRows.length} <> 0 THEN\n    RAISE EXCEPTION 'Phase134 blocked: ${blockedRows.length} rating records lack exact Production snapshot/source lineage; no rows may be inserted';\n  END IF;\nEND $$;\nINSERT INTO public.handicap_review_evidence (id, subject_kind, subject_key, source_ref, evidence_payload) VALUES\n${values || "-- no exact rows"};\nINSERT INTO public.handicap_review_decisions (id, evidence_id, subject_kind, subject_key, decision, rationale, reviewer_id, decision_sequence) VALUES\n${decisionValues || "-- no exact rows"};\nCOMMIT;\n`
fs.writeFileSync(path.join(phase134Dir, "production_rating_decision_installation.sql"), guardedInstall, "utf8")

const preflight = `-- PHASE134 READ-ONLY PREFLIGHT; no writes.\nBEGIN; SET TRANSACTION READ ONLY;\nSELECT current_database(), current_setting('server_version');\nSELECT count(*) AS calculation_runs FROM public.handicap_calculation_runs;\nSELECT count(*) AS provenance_rows FROM public.handicap_source_provenance;\nSELECT count(*) AS rating_snapshots FROM public.handicap_rating_snapshots;\nSELECT count(*) AS index_snapshots FROM public.handicap_index_snapshots;\nSELECT count(*) AS publishable_ratings FROM public.handicap_publishable_rating_snapshots;\nSELECT count(*) AS publishable_indexes FROM public.handicap_publishable_index_snapshots;\nSELECT count(*) AS phase134_exact_dependencies FROM public.handicap_rating_snapshots WHERE id IN (${exactRows.map((row) => sql(row.production_snapshot_id)).join(",") || "NULL"});\nROLLBACK;\n`
const postflight = `-- PHASE134 READ-ONLY POSTFLIGHT TEMPLATE; no writes.\nBEGIN; SET TRANSACTION READ ONLY;\nSELECT count(*) AS calculation_runs FROM public.handicap_calculation_runs;\nSELECT count(*) AS provenance_rows FROM public.handicap_source_provenance;\nSELECT count(*) AS rating_snapshots FROM public.handicap_rating_snapshots;\nSELECT count(*) AS index_snapshots FROM public.handicap_index_snapshots;\nSELECT count(*) AS publishable_ratings FROM public.handicap_publishable_rating_snapshots;\nSELECT count(*) AS publishable_indexes FROM public.handicap_publishable_index_snapshots;\nROLLBACK;\n`
fs.writeFileSync(path.join(phase134Dir, "production_preflight.sql"), preflight, "utf8")
fs.writeFileSync(path.join(phase134Dir, "production_postflight.sql"), postflight, "utf8")

const indexBlocked = indexReconciliation.filter((row) => row.index_reconciliation_status === "BLOCKED_RATING_DEPENDENCY")
const report = `# Phase 134 rating snapshot reconciliation\n\nStatus: **BLOCKED — package lineage incomplete; Production unchanged**\n\n## Verified inputs\n\n- Production project: \`${productionProject}\`\n- Phase130 owner batch SHA-256: \`${batchSha}\`\n- Phase125 reference SHA-256: \`${phase125Sha}\`\n- Current Production rating inventory source: Phase104 import rows, run \`${currentRunId}\`\n- Existing Production baseline: 4 calculation runs, 28,672 provenance rows, 410 rating snapshots, 157 index snapshots, 0 publishable ratings/indexes.\n\n## Exact mapping\n\nThe 73 Phase130 pending ratings were matched by exact course ID, difficulty, rating, slope, model, scope, publication state, current run, and non-empty source evidence. **${exactRows.length}/73** have exact current Production snapshots. **${blockedRows.length}/73** do not. The blocked rows are not assigned replacement IDs and no source evidence is fabricated.\n\nThe five earlier owner approvals were checked separately: three exact Production values match; Forgotten Fairyland Easy and Shangri-La Easy are value mismatches and remain blocked until verified successor snapshots with their approved values and complete source lineage are prepared.\n\n## Index impact\n\n- 166 candidate indexes were checked against all blocked rating dependencies (the 15 missing Phase130 ratings plus the 2 owner-approved value mismatches).\n- ${indexBlocked.length}/166 are blocked pending rating lineage; ${indexReconciliation.length - indexBlocked.length}/166 have no blocked dependency and still require normal publication revalidation.\n- Weekly personal-index inputs: 0.\n- No index is approved or published by this package.\n\n## Safety boundary\n\nThe old Phase133 SQL is not reused because it assumes absent Phase125 snapshot IDs and run \`19777bdb-8c2d-5c39-80fa-55a7b429fe93\`. The generated installation SQL fails closed before any insert while blockers remain. It is not a Production execution authorization.\n\n## Next safe step\n\nPrepare and locally validate verified successor rating snapshots for the 15 missing exact ratings and the two approved-value mismatches, including authoritative source evidence and deterministic IDs. Then regenerate the full reconciliation, revalidate all 166 index dependencies, and seek separate authorization for the resulting append-only decision package.\n`
fs.writeFileSync(path.join(phase134Dir, "reconciliation_report.md"), report, "utf8")
const correctedReport = report
  .replaceAll(`**${exactRows.length}/73**`, `**${pendingExactRows.length}/73**`)
  .replaceAll(`**${blockedRows.length}/73**`, `**${pendingBlockedRows.length}/73**`)
  .replace("three exact Production values match", `**${ownerExactRows.length}/5** exact Production values match`)
fs.writeFileSync(path.join(phase134Dir, "reconciliation_report.md"), correctedReport, "utf8")

const files = ["rating_snapshot_reconciliation.csv", "rating_snapshot_blockers.csv", "index_dependency_reconciliation.csv", "production_exact_rating_decision_rows.csv", "production_rating_decision_installation.sql", "production_preflight.sql", "production_postflight.sql", "reconciliation_report.md"]
const checksums = Object.fromEntries(files.map((name) => [name, sha256(path.join(phase134Dir, name))]))
writeJson(path.join(phase134Dir, "checksums.json"), {
  schema_version: "phase134-rating-reconciliation-v1",
  status: "BLOCKED_MISSING_EXACT_PRODUCTION_LINEAGE",
  production_project: productionProject,
  phase130_batch_sha256: batchSha,
  phase125_manifest_sha256: phase125Sha,
  source_files: { phase104_rating_inventory_sha256: sha256(phase104Path), phase126_index_candidates_sha256: sha256(phase126Path), phase121_candidates_sha256: sha256(phase121CandidatesPath) },
  counts: { pending_ratings: 73, pending_exact_production_ratings: pendingExactRows.length, pending_blocked_ratings: pendingBlockedRows.length, owner_approved_ratings: 5, owner_exact_production_ratings: ownerExactRows.length, owner_blocked_value_mismatches: ownerBlockedRows.length, exact_production_rows_total: exactRows.length, blocked_rating_rows_total: blockedRows.length, index_candidates: 166, blocked_index_candidates: indexBlocked.length, revalidatable_index_candidates: indexReconciliation.length - indexBlocked.length },
  generated_files: checksums,
})
console.log(JSON.stringify({ exactRatings: exactRows.length, blockedRatings: blockedRows.length, blockedIndexes: indexBlocked.length, revalidatableIndexes: indexReconciliation.length - indexBlocked.length, phase130BatchSha: batchSha }, null, 2))
