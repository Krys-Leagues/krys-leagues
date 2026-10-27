import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const outputDir = path.join(root, "docs", "handicap", "phase132")
const phase130Dir = path.join(root, "docs", "handicap", "phase130")
const phase121Dir = path.join(root, "docs", "handicap", "phase121")
const phase130BatchPath = path.join(phase130Dir, "rating_approval_batch_manifest.json")
const phase125ManifestPath = path.join(phase121Dir, "rating_approval_manifest.json")
const phase130Checkpoint = "da2d139d63e96e79303da665449bb821a23398a7"
const phase125Checkpoint = "dfd3558109a6dcbd00703feadd52acb2276dc899"
const productionProject = "jfbndcwdsvsjgnzwvexp"
const expectedPhase130Sha = "52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B"
const expectedPhase125Sha = "09382A8C7901F549377ADE119E3DF5068CD40A9C8FF9629F572DA5FE7EFB22A6"
const modelVersion = "krys-handicap-candidate-a-v1"
const referenceSlope = 8.515
const sourceScope = "KWT_ONLY"

fs.mkdirSync(outputDir, { recursive: true })

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
}

function uuidFromText(value) {
  const hex = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const normalized = hex.join("")
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function normalizePhase130(row, manifest) {
  return {
    snapshot_id: row.snapshot_id,
    calculation_run_id: manifest.calculation_run_id ?? "19777bdb-8c2d-5c39-80fa-55a7b429fe93",
    course_id: row.course_id,
    difficulty: row.difficulty,
    course_rating: row.course_rating,
    slope: row.slope,
    sample_size: row.sample_size,
    distinct_players: row.distinct_players,
    rating_confidence: row.rating_confidence,
    source_scope: manifest.source_scope,
    weekly_rows_used: row.weekly_rows_used_for_rating_only,
  }
}

function compareRows(phase130Rows, phase125Rows, phase130Manifest) {
  const p130 = phase130Rows.map((row) => normalizePhase130(row, phase130Manifest))
  const p125 = phase125Rows.map((row) => ({
    snapshot_id: row.snapshot_id,
    calculation_run_id: row.calculation_run_id,
    course_id: row.course_id,
    difficulty: row.difficulty,
    course_rating: row.course_rating,
    slope: row.slope,
    sample_size: row.sample_size,
    distinct_players: row.distinct_players,
    maximum_player_concentration: row.maximum_player_concentration,
    rating_confidence: row.rating_confidence,
    source_scope: row.source_scope,
    weekly_rows_used: row.weekly_rows_used,
  }))
  const left = new Map(p130.map((row) => [row.snapshot_id, row]))
  const right = new Map(p125.map((row) => [row.snapshot_id, row]))
  const missingInPhase125 = p130.filter((row) => !right.has(row.snapshot_id)).map((row) => row.snapshot_id)
  const missingInPhase130 = p125.filter((row) => !left.has(row.snapshot_id)).map((row) => row.snapshot_id)
  const mismatches = []
  for (const [snapshotId, leftRow] of left) {
    const rightRow = right.get(snapshotId)
    if (!rightRow) continue
    for (const key of Object.keys(leftRow)) {
      if (String(leftRow[key]) !== String(rightRow[key])) {
        mismatches.push({ snapshot_id: snapshotId, field: key, phase130: leftRow[key], phase125: rightRow[key] })
      }
    }
  }
  const duplicateIds = (rows) => rows.map((row) => row.snapshot_id).filter((id, index, all) => all.indexOf(id) !== index)
  return {
    phase130_count: p130.length,
    phase125_count: p125.length,
    missing_in_phase125: missingInPhase125,
    missing_in_phase130: missingInPhase130,
    duplicate_phase130_ids: duplicateIds(p130),
    duplicate_phase125_ids: duplicateIds(p125),
    field_mismatches: mismatches,
    exact_match: p130.length === p125.length && missingInPhase125.length === 0 && missingInPhase130.length === 0 && mismatches.length === 0,
  }
}

const phase130 = readJson(phase130BatchPath)
const phase125 = readJson(phase125ManifestPath)
const phase130Sha = sha256(phase130BatchPath)
const phase125Sha = sha256(phase125ManifestPath)
if (phase130Sha !== expectedPhase130Sha) throw new Error(`Phase130 batch checksum mismatch: ${phase130Sha}`)
if (phase125Sha !== expectedPhase125Sha) throw new Error(`Phase125 manifest checksum mismatch: ${phase125Sha}`)
if (phase130.pending_candidate_count !== 73 || phase130.pending_candidates.length !== 73 || phase125.candidate_count !== 73 || phase125.rows.length !== 73) throw new Error("Expected exactly 73 rating candidates")
if (phase130.source_manifest_sha256 !== phase125Sha) throw new Error("Phase130 source-manifest hash does not match Phase125 manifest")
const comparison = compareRows(phase130.pending_candidates, phase125.rows, phase125)
if (!comparison.exact_match) throw new Error(`Phase130/Phase125 mismatch: ${JSON.stringify(comparison)}`)
if (new Set(phase130.pending_candidates.map((row) => row.snapshot_id)).size !== 73) throw new Error("Phase130 snapshot IDs are not unique")
if (phase130.pending_candidates.some((row) => !Number.isFinite(Number(row.course_rating)) || !Number.isFinite(Number(row.slope)) || Number(row.slope) <= 0)) throw new Error("Invalid rating or slope in approval batch")
if (phase130.pending_candidates.some((row) => row.owner_decision !== "PENDING")) throw new Error("Source batch is not the expected pending Phase130 batch")

const sourceBatchSha = phase130Sha
const decisionRows = phase125.rows.map((row) => ({
  ...row,
  owner_decision: "APPROVED_FOR_FORMAL_RATING_DECISION",
  production_decision: "ACCEPT",
  production_recorded: false,
  decision_scope: "COURSE_RATING_ONLY",
  source_batch_sha256: sourceBatchSha,
}))
const priorApprovals = phase130.owner_approved_ratings.map((row) => ({ ...row }))
const catalogHolds = [
  { course_id: "Hollywood_easy", status: "HOLD_PROVISIONAL", reason: "Hollywood Easy remains provisional under the current KWT-only package." },
  { course_id: "Hollywood_hard", status: "HOLD_PROVISIONAL", reason: "Hollywood Hard remains provisional under the current KWT-only package." },
  { course_id: "Gloop Lair_easy", status: "HOLD_UNRATED", reason: "Gloop Lair Easy remains unrated under the current KWT-only package." },
  { course_id: "Gloop Lair_hard", status: "HOLD_UNRATED", reason: "Gloop Lair Hard remains unrated under the current KWT-only package." },
]

const ownerManifest = {
  schema_version: "phase132-owner-approved-rating-decisions-v1",
  status: "LOCAL_OWNER_APPROVED_NOT_PRODUCTION",
  production_project: productionProject,
  phase130_checkpoint: phase130Checkpoint,
  phase125_checkpoint: phase125Checkpoint,
  source_batch: {
    path: "docs/handicap/phase130/rating_approval_batch_manifest.json",
    sha256: sourceBatchSha,
    shortened_sha256_from_request: "52D2D88F...CF53C0B",
  },
  phase125_reference: {
    path: "docs/handicap/phase121/rating_approval_manifest.json",
    sha256: phase125Sha,
  },
  policy: {
    source_scope: sourceScope,
    model_version: modelVersion,
    reference_slope: referenceSlope,
    publication_status: "UNPUBLISHED",
    personal_handicap_weekly_rows: 0,
  },
  owner_decision: {
    owner: "Krys",
    decision: "APPROVE_ALL_73_FOR_FORMAL_RATING_DECISION_INSTALLATION",
    recorded_at: null,
    reviewer_uuid: null,
    signature: null,
    basis: "Explicit Phase132 owner instruction; this local artifact is not a Production record and does not publish ratings or indexes.",
  },
  exact_match: comparison,
  prior_approvals_preserved: priorApprovals,
  explicit_catalog_holds: catalogHolds,
  counts: {
    owner_approved_batch_rows: decisionRows.length,
    prior_approved_ratings: priorApprovals.length,
    explicit_catalog_holds: catalogHolds.length,
    dependent_index_candidates: decisionRows.reduce((sum, row) => sum + Number(row.referenced_index_candidates), 0),
    weekly_personal_inputs: 0,
  },
  rows: decisionRows,
}
const ownerManifestPath = path.join(outputDir, "rating_owner_decision_manifest.json")
writeJson(ownerManifestPath, ownerManifest)

const csvRows = decisionRows.map((row) => ({
  snapshot_id: row.snapshot_id,
  calculation_run_id: row.calculation_run_id,
  course_id: row.course_id,
  difficulty: row.difficulty,
  course_rating: row.course_rating,
  slope: row.slope,
  sample_size: row.sample_size,
  distinct_players: row.distinct_players,
  maximum_player_concentration: row.maximum_player_concentration,
  rating_confidence: row.rating_confidence,
  source_scope: row.source_scope,
  weekly_rows_used: row.weekly_rows_used,
  referenced_index_candidates: row.referenced_index_candidates,
  referenced_best_five_candidates: row.referenced_best_five_candidates,
  owner_decision: row.owner_decision,
  production_decision: row.production_decision,
  production_recorded: row.production_recorded,
}))
const csvPath = path.join(outputDir, "rating_decision_installation_rows.csv")
fs.writeFileSync(csvPath, `${Papa.unparse(csvRows, { newline: "\n" })}\n`, "utf8")

const evidenceRows = decisionRows.map((row) => {
  const evidenceId = uuidFromText(`phase132-rating-approval-evidence:${sourceBatchSha}:${row.snapshot_id}`)
  const decisionId = uuidFromText(`phase132-rating-approval-decision:${sourceBatchSha}:${row.snapshot_id}`)
  return {
    ...row,
    evidence_id: evidenceId,
    decision_id: decisionId,
    subject_kind: "SOURCE_RECORD",
    subject_key: row.snapshot_id,
    decision: "ACCEPT",
    source_ref: `phase132/rating-approval/${sourceBatchSha}/${row.snapshot_id}`,
  }
})

const snapshotIdsSql = evidenceRows.map((row) => sqlString(row.snapshot_id)).join(", ")
const evidenceValues = evidenceRows.map((row) => {
  const payload = {
    kind: "OWNER_APPROVED_COURSE_RATING",
    source_batch_sha256: sourceBatchSha,
    phase130_checkpoint: phase130Checkpoint,
    phase125_checkpoint: phase125Checkpoint,
    snapshot_id: row.snapshot_id,
    calculation_run_id: row.calculation_run_id,
    course_id: row.course_id,
    difficulty: row.difficulty,
    course_rating: row.course_rating,
    slope: row.slope,
    sample_size: row.sample_size,
    distinct_players: row.distinct_players,
    source_scope: row.source_scope,
    weekly_rows_used_for_rating_only: row.weekly_rows_used,
    referenced_index_candidates: row.referenced_index_candidates,
    owner: "Krys",
    decision_basis: "Explicit Phase132 owner instruction",
    publication_status_remains: "UNPUBLISHED",
  }
  return `(${sqlString(row.evidence_id)}, 'SOURCE_RECORD', ${sqlString(row.snapshot_id)}, ${sqlString(row.source_ref)}, ${sqlString(JSON.stringify(payload))}::jsonb)`
}).join(",\n")
const decisionValues = evidenceRows.map((row) => `(${sqlString(row.decision_id)}, ${sqlString(row.evidence_id)}, 'SOURCE_RECORD', ${sqlString(row.snapshot_id)}, 'ACCEPT', ${sqlString("Krys approved this exact Phase132 row for formal rating-decision installation; publication remains separately gated and the snapshot remains UNPUBLISHED.")}, null, 1)`).join(",\n")
const preflight = `-- PHASE132 PROPOSAL ONLY — READ-ONLY PREFLIGHT; DO NOT EXECUTE AS A WRITE.\n-- Target Supabase project: ${productionProject}\n-- Source batch SHA-256: ${sourceBatchSha}\n-- This file does not insert or modify data.\nbegin;\nset transaction read only;\nselect current_database(), current_setting('server_version');\ndo $$ begin\n  if to_regclass('public.handicap_review_evidence') is null or to_regclass('public.handicap_review_decisions') is null then raise exception 'review tables missing'; end if;\n  if (select count(*) from public.handicap_calculation_runs) <> 4 then raise exception 'unexpected calculation-run count'; end if;\n  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'unexpected provenance count'; end if;\n  if (select count(*) from public.handicap_rating_snapshots) <> 410 then raise exception 'unexpected rating count'; end if;\n  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'unexpected index count'; end if;\n  if (select count(*) from public.handicap_review_evidence) <> 1 or (select count(*) from public.handicap_review_decisions) <> 1 then raise exception 'unexpected review-history baseline'; end if;\n  if (select count(*) from public.handicap_rating_snapshots where id in (${snapshotIdsSql})) <> 73 then raise exception 'one or more approved rating snapshots are missing'; end if;\n  if exists (select 1 from public.handicap_rating_snapshots where id in (${snapshotIdsSql}) and (publication_status <> 'UNPUBLISHED' or review_scope <> 'KWT_ONLY' or slope is null or slope <= 0.01)) then raise exception 'rating snapshot publication/scope/slope guard failed'; end if;\n  if exists (select 1 from public.handicap_review_evidence where id in (${evidenceRows.map((row) => sqlString(row.evidence_id)).join(", ")})) then raise exception 'Phase132 evidence IDs already exist'; end if;\n  if exists (select 1 from public.handicap_review_decisions where id in (${evidenceRows.map((row) => sqlString(row.decision_id)).join(", ")})) then raise exception 'Phase132 decision IDs already exist'; end if;\n  if exists (select 1 from (values ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_review_evidence'),('public.handicap_review_decisions'),('public.handicap_source_provenance')) as p(table_name) where has_table_privilege('anon', p.table_name, 'select') or has_table_privilege('authenticated', p.table_name, 'select')) then raise exception 'client SELECT unexpectedly granted'; end if;\nend $$;\nselect 'phase132_preflight_passed' as status;\nrollback;\n`
const install = `-- PHASE132 PROPOSAL ONLY — APPEND-ONLY RATING DECISIONS; DO NOT EXECUTE WITHOUT SEPARATE AUTHORIZATION.\n-- Target Supabase project: ${productionProject}\n-- Source batch SHA-256: ${sourceBatchSha}\n-- Scope: 73 review evidence rows and 73 ACCEPT decisions only.\n-- No snapshots, indexes, calculation runs, provenance, approvals, or publications are inserted here.\nbegin;\nselect pg_advisory_xact_lock(hashtextextended('phase132-rating-decision-installation', 0));\ndo $$ begin\n  if (select count(*) from public.handicap_calculation_runs) <> 4 then raise exception 'unexpected calculation-run count'; end if;\n  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'unexpected provenance count'; end if;\n  if (select count(*) from public.handicap_rating_snapshots) <> 410 then raise exception 'unexpected rating count'; end if;\n  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'unexpected index count'; end if;\n  if (select count(*) from public.handicap_review_evidence) <> 1 or (select count(*) from public.handicap_review_decisions) <> 1 then raise exception 'unexpected review-history baseline'; end if;\n  if (select count(*) from public.handicap_rating_snapshots where id in (${snapshotIdsSql})) <> 73 then raise exception 'approved rating snapshot dependency check failed'; end if;\n  if exists (select 1 from public.handicap_rating_snapshots where id in (${snapshotIdsSql}) and (publication_status <> 'UNPUBLISHED' or review_scope <> 'KWT_ONLY' or slope is null or slope <= 0.01)) then raise exception 'approved rating snapshot guard failed'; end if;\n  if exists (select 1 from public.handicap_review_evidence where id in (${evidenceRows.map((row) => sqlString(row.evidence_id)).join(", ")})) then raise exception 'duplicate Phase132 evidence'; end if;\n  if exists (select 1 from public.handicap_review_decisions where id in (${evidenceRows.map((row) => sqlString(row.decision_id)).join(", ")})) then raise exception 'duplicate Phase132 decision'; end if;\nend $$;\ninsert into public.handicap_review_evidence (id, subject_kind, subject_key, source_ref, evidence_payload) values\n${evidenceValues};\ninsert into public.handicap_review_decisions (id, evidence_id, subject_kind, subject_key, decision, rationale, reviewer_id, decision_sequence) values\n${decisionValues};\ndo $$ begin\n  if (select count(*) from public.handicap_review_evidence where id in (${evidenceRows.map((row) => sqlString(row.evidence_id)).join(", ")})) <> 73 then raise exception 'Phase132 evidence insert count mismatch'; end if;\n  if (select count(*) from public.handicap_review_decisions where id in (${evidenceRows.map((row) => sqlString(row.decision_id)).join(", ")})) <> 73 then raise exception 'Phase132 decision insert count mismatch'; end if;\nend $$;\ncommit;\n`
const postflight = `-- PHASE132 PROPOSAL ONLY — READ-ONLY POSTFLIGHT; DO NOT EXECUTE AS A WRITE.\n-- Target Supabase project: ${productionProject}\n-- Expected after a separately authorized install: 74 evidence rows and 74 decisions.\nbegin;\nset transaction read only;\ndo $$ begin\n  if (select count(*) from public.handicap_calculation_runs) <> 4 then raise exception 'calculation-run count changed'; end if;\n  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'provenance count changed'; end if;\n  if (select count(*) from public.handicap_rating_snapshots) <> 410 then raise exception 'rating count changed'; end if;\n  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'index count changed'; end if;\n  if (select count(*) from public.handicap_review_evidence) <> 74 or (select count(*) from public.handicap_review_decisions) <> 74 then raise exception 'rating decision counts incorrect'; end if;\n  if (select count(*) from public.handicap_review_decisions where subject_kind = 'SOURCE_RECORD' and decision = 'ACCEPT' and subject_key in (${snapshotIdsSql})) <> 73 then raise exception 'Phase132 decisions incomplete'; end if;\n  if exists (select 1 from public.handicap_rating_snapshots where id in (${snapshotIdsSql}) and publication_status <> 'UNPUBLISHED') then raise exception 'rating publication status changed'; end if;\n  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publishable views are not empty'; end if;\n  if exists (select 1 from (values ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_review_evidence'),('public.handicap_review_decisions'),('public.handicap_source_provenance')) as p(table_name) where has_table_privilege('anon', p.table_name, 'select') or has_table_privilege('authenticated', p.table_name, 'select')) then raise exception 'client SELECT unexpectedly granted'; end if;\nend $$;\nselect 'phase132_postflight_passed' as status;\nrollback;\n`
const preflightPath = path.join(outputDir, "production_rating_decision_preflight.sql")
const installPath = path.join(outputDir, "production_rating_decision_installation.sql")
const postflightPath = path.join(outputDir, "production_rating_decision_postflight.sql")
fs.writeFileSync(preflightPath, preflight, "utf8")
fs.writeFileSync(installPath, install, "utf8")
fs.writeFileSync(postflightPath, postflight, "utf8")

const plan = `# Phase 132 rating-decision installation package\n\nStatus: **LOCAL PREPARATION ONLY — NOT RECORDED IN PRODUCTION**.\n\n## Verified source\n\n- Target project: \`${productionProject}\`\n- Phase130 checkpoint: \`${phase130Checkpoint}\`\n- Phase125 checkpoint: \`${phase125Checkpoint}\`\n- Phase130 batch SHA-256: \`${sourceBatchSha}\`\n- Phase125 reference SHA-256: \`${phase125Sha}\`\n- Exact batch comparison: 73/73 rows, identifiers, values, difficulty, source scope, and dependencies match; no missing, added, altered, or duplicate rows.\n\n## Decision boundary\n\nKrys explicitly approved all 73 enumerated rows for formal rating-decision installation. The local owner artifact records the decision without inventing a signature, reviewer UUID, or timestamp. It does not approve indexes, publish ratings, or write Production.\n\nThe five prior approvals remain unchanged in the source package. Hollywood Easy/Hard remain \`HOLD_PROVISIONAL\`; Gloop Lair Easy/Hard remain \`HOLD_UNRATED\`.\n\n## Exact Production write scope for separate authorization\n\nThe installation SQL inserts exactly 73 rows into \`handicap_review_evidence\` and 73 matching \`ACCEPT\` rows into \`handicap_review_decisions\`, protected by the existing append-only contract and a transaction advisory lock. It does not insert or modify ratings, indexes, calculation runs, provenance, player identities, or publication state. Existing decision rows are preserved.\n\nThe SQL deliberately uses \`SOURCE_RECORD\` because that is the installed subject-kind contract; it does not invent a new \`COURSE_RATING\` subject type. The evidence payload carries the exact snapshot ID and rating details for audit.\n\n## Required separate authorization and execution order\n\n1. Review the local owner artifact and approve the 73-row rating-decision installation only.\n2. Execute \`production_rating_decision_preflight.sql\` read-only against the named project.\n3. Verify the installation SQL checksum and preflight output.\n4. Execute only \`production_rating_decision_installation.sql\` in one session/transaction. Any conflict must abort the transaction.\n5. Execute \`production_rating_decision_postflight.sql\` read-only.\n6. Keep ratings and indexes unpublished; rating/index publication and website release require separate authorization.\n\n## Expected postflight\n\n- Calculation runs: 4 (unchanged)\n- Provenance rows: 28,672 (unchanged)\n- Rating snapshots: 410 (unchanged, all unpublished)\n- Index snapshots: 157 (unchanged, all unpublished)\n- Review evidence: 74 total (1 existing + 73 new)\n- Review decisions: 74 total (1 existing + 73 new)\n- Publishable ratings/indexes: 0/0\n- Weekly personal-index inputs: 0\n\nNo Production decision has been recorded by this package yet.\n`
const planPath = path.join(outputDir, "rating_decision_installation_plan.md")
fs.writeFileSync(planPath, plan, "utf8")

const reviewLines = [
  "# Phase 132 — Owner-approved 73-rating decision review",
  "",
  `Batch SHA-256: \`${sourceBatchSha}\``,
  "",
  "Krys explicitly approved every enumerated row below for formal rating-decision installation. This local record is not a Production record and does not publish ratings or indexes.",
  "",
  "| # | Course | Difficulty | Rating | Slope | Rounds | Players | Max concentration | Confidence | Weekly rating-only rows | Index dependencies | Best-five dependencies | Decision |",
  "|---:|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---|",
  ...decisionRows.map((row, index) => `| ${index + 1} | ${row.course_id.replaceAll("|", "\\|")} | ${row.difficulty} | ${row.course_rating} | ${row.slope} | ${row.sample_size} | ${row.distinct_players} | ${row.maximum_player_concentration} | ${row.rating_confidence} | ${row.weekly_rows_used} | ${row.referenced_index_candidates} | ${row.referenced_best_five_candidates} | APPROVED_FOR_FORMAL_RATING_DECISION |`),
  "",
  "## Preserved boundaries",
  "",
  "- Five prior Krys approvals are preserved unchanged.",
  "- Hollywood Easy/Hard remain HOLD_PROVISIONAL.",
  "- Gloop Lair Easy/Hard remain HOLD_UNRATED.",
  "- THE_WEEKLY contributes zero personal-index rounds.",
  "- All rating and index snapshots remain UNPUBLISHED.",
]
const reviewReportPath = path.join(outputDir, "rating_owner_decision_report.md")
fs.writeFileSync(reviewReportPath, `${reviewLines.join("\n")}\n`, "utf8")

const checksums = Object.fromEntries([
  ["rating_owner_decision_manifest.json", ownerManifestPath],
  ["rating_decision_installation_rows.csv", csvPath],
  ["production_rating_decision_preflight.sql", preflightPath],
  ["production_rating_decision_installation.sql", installPath],
  ["production_rating_decision_postflight.sql", postflightPath],
  ["rating_decision_installation_plan.md", planPath],
  ["rating_owner_decision_report.md", reviewReportPath],
].map(([name, file]) => [name, sha256(file)]))
writeJson(path.join(outputDir, "checksums.json"), {
  schema_version: "phase132-rating-decision-package-checksums-v1",
  production_project: productionProject,
  source_batch_sha256: sourceBatchSha,
  files: checksums,
})
writeJson(path.join(outputDir, "comparison_report.json"), comparison)

console.log(JSON.stringify({ source_batch_sha256: sourceBatchSha, phase125_sha256: phase125Sha, exact_match: comparison.exact_match, rows: decisionRows.length, checksums }, null, 2))
