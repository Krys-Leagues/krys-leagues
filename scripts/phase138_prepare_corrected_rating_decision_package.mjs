import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const outDir = path.join(root, "docs", "handicap", "phase138")
const phase130Dir = path.join(root, "docs", "handicap", "phase130")
const phase132Dir = path.join(root, "docs", "handicap", "phase132")
const phase136Dir = path.join(root, "docs", "handicap", "phase136")
const phase130Path = path.join(phase130Dir, "rating_approval_batch_manifest.json")
const phase125Path = path.join(root, "docs", "handicap", "phase121", "rating_approval_manifest.json")
const phase132Path = path.join(phase132Dir, "rating_owner_decision_manifest.json")
const mappingPath = path.join(phase136Dir, "owner_rating_snapshot_mapping.csv")
const project = "jfbndcwdsvsjgnzwvexp"
const phase130Checkpoint = "da2d139d63e96e79303da665449bb821a23398a7"
const phase125Checkpoint = "dfd3558109a6dcbd00703feadd52acb2276dc899"
const phase136Checkpoint = "5a780511c5730c239e82abd92da2c34cc008321f"
const successorRun = "8f136000-0000-5000-8000-000000000136"
const batchSha = "52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B"
const phase125Sha = "09382A8C7901F549377ADE119E3DF5068CD40A9C8FF9629F572DA5FE7EFB22A6"
const modelVersion = "krys-course-rating-elite-lowest-12-v1"
const scope = "KWT_ONLY"

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"))
const hashFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
const sql = value => `'${String(value).replaceAll("'", "''")}'`
const uuidFromText = value => {
  const chars = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  chars[12] = "5"
  chars[16] = ((Number.parseInt(chars[16], 16) & 3) | 8).toString(16)
  const hex = chars.join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
const write = (file, value) => fs.writeFileSync(file, value, "utf8")
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`)

const phase130 = readJson(phase130Path)
const phase125 = readJson(phase125Path)
const phase132 = readJson(phase132Path)
const mapping = Papa.parse(fs.readFileSync(mappingPath, "utf8"), { header: true, skipEmptyLines: true }).data

if (hashFile(phase130Path) !== batchSha) throw new Error(`Phase130 batch checksum mismatch: ${hashFile(phase130Path)}`)
if (hashFile(phase125Path) !== phase125Sha) throw new Error(`Phase125 manifest checksum mismatch: ${hashFile(phase125Path)}`)
if (phase130.pending_candidates?.length !== 73 || phase125.rows?.length !== 73 || phase132.rows?.length !== 73) throw new Error("Expected 73 owner-approved rows in all source packages")
if (phase132.source_batch?.sha256 !== batchSha) throw new Error("Phase132 owner artifact does not preserve the authorized batch hash")
if (mapping.filter(row => row.approval_batch === "PENDING_73").length !== 73) throw new Error("Phase136 mapping does not contain exactly 73 pending rows")

const byKey = new Map(mapping.filter(row => row.approval_batch === "PENDING_73").map(row => [`${row.course_id}\u0000${row.difficulty}\u0000${row.approved_rating}\u0000${row.approved_slope}`, row]))
const phase130ByKey = new Map(phase130.pending_candidates.map(row => [`${row.course_id}\u0000${row.difficulty}\u0000${row.course_rating}\u0000${row.slope}`, row]))
const sourceRows = phase125.rows.map(row => {
  const key = `${row.course_id}\u0000${row.difficulty}\u0000${row.course_rating}\u0000${row.slope}`
  const phase130Row = phase130ByKey.get(key)
  if (!phase130Row || phase130Row.snapshot_id !== row.snapshot_id) throw new Error(`Phase130/Phase125 exact row mismatch for ${key}`)
  const target = byKey.get(key)
  if (!target) throw new Error(`No exact Phase136 Production target for ${key}`)
  return {
    ...row,
    approved_local_snapshot_id: row.snapshot_id,
    target_snapshot_id: target.target_snapshot_id,
    target_kind: target.target_kind,
    source_status: target.source_status,
    target_calculation_run_id: target.target_kind === "PHASE136_SUCCESSOR" ? successorRun : "",
    model_version: modelVersion,
    review_scope: scope,
  }
})
if (new Set(sourceRows.map(row => row.target_snapshot_id)).size !== 73) throw new Error("Production target snapshot IDs are not unique")

const rows = sourceRows.map(row => ({
  ...row,
  evidence_id: uuidFromText(`phase138-rating-approval-evidence:${batchSha}:${row.target_snapshot_id}`),
  decision_id: uuidFromText(`phase138-rating-approval-decision:${batchSha}:${row.target_snapshot_id}`),
  subject_kind: "SOURCE_RECORD",
  decision: "ACCEPT",
  source_ref: `phase138/rating-approval/${batchSha}/${row.target_snapshot_id}`,
}))
const targetIds = rows.map(row => row.target_snapshot_id)
const evidenceIds = rows.map(row => row.evidence_id)
const decisionIds = rows.map(row => row.decision_id)
const list = values => values.map(sql).join(", ")
const expectedTargetValues = rows.map(row => `(${sql(row.target_snapshot_id)}::uuid, ${sql(row.course_id)}, ${sql(row.difficulty)}, ${Number(row.course_rating)}, ${Number(row.slope)}, ${Number(row.sample_size)}, ${Number(row.distinct_players)})`).join(",\n    ")
const evidenceValues = rows.map(row => {
  const payload = {
    kind: "OWNER_APPROVED_COURSE_RATING",
    phase: 138,
    source_batch_sha256: batchSha,
    phase130_checkpoint: phase130Checkpoint,
    phase125_checkpoint: phase125Checkpoint,
    phase136_checkpoint: phase136Checkpoint,
    local_snapshot_id: row.approved_local_snapshot_id,
    target_snapshot_id: row.target_snapshot_id,
    target_kind: row.target_kind,
    course_id: row.course_id,
    difficulty: row.difficulty,
    course_rating: Number(row.course_rating),
    slope: Number(row.slope),
    sample_size: Number(row.sample_size),
    distinct_players: Number(row.distinct_players),
    model_version: modelVersion,
    review_scope: scope,
    source_scope: scope,
    weekly_rows_used_for_rating_only: Number(row.weekly_rows_used ?? 0),
    owner: "Krys",
    decision_basis: "Explicit owner approval preserved from Phase 130; this package records review decisions only and does not publish snapshots.",
    publication_status_remains: "UNPUBLISHED",
  }
  return `(${sql(row.evidence_id)}, 'SOURCE_RECORD', ${sql(row.target_snapshot_id)}, ${sql(row.source_ref)}, ${sql(JSON.stringify(payload))}::jsonb)`
}).join(",\n")
const decisionValues = rows.map(row => `(${sql(row.decision_id)}, ${sql(row.evidence_id)}, 'SOURCE_RECORD', ${sql(row.target_snapshot_id)}, 'ACCEPT', ${sql("Owner-approved exact rating value; publication remains separately gated and the snapshot remains UNPUBLISHED.")}, null, 1)`).join(",\n")

const baselineChecks = `
  IF (SELECT count(*) FROM public.handicap_calculation_runs) <> 5 THEN RAISE EXCEPTION 'unexpected calculation-run count'; END IF;
  IF (SELECT count(*) FROM public.handicap_source_provenance) <> 28672 THEN RAISE EXCEPTION 'unexpected provenance count'; END IF;
  IF (SELECT count(*) FROM public.handicap_rating_snapshots) <> 427 THEN RAISE EXCEPTION 'unexpected rating count'; END IF;
  IF (SELECT count(*) FROM public.handicap_index_snapshots) <> 157 THEN RAISE EXCEPTION 'unexpected index count'; END IF;
  IF (SELECT count(*) FROM public.handicap_review_evidence) <> 1 OR (SELECT count(*) FROM public.handicap_review_decisions) <> 1 THEN RAISE EXCEPTION 'unexpected review baseline'; END IF;
  IF (SELECT count(*) FROM public.handicap_publishable_rating_snapshots) <> 0 OR (SELECT count(*) FROM public.handicap_publishable_index_snapshots) <> 0 THEN RAISE EXCEPTION 'publishable views are not empty'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('public.handicap_calculation_runs'::text), ('public.handicap_rating_snapshots'), ('public.handicap_index_snapshots'), ('public.handicap_review_evidence'), ('public.handicap_review_decisions'), ('public.handicap_source_provenance')) p(name) WHERE has_table_privilege('anon', p.name, 'select') OR has_table_privilege('authenticated', p.name, 'select')) THEN RAISE EXCEPTION 'client SELECT unexpectedly granted'; END IF;
  IF (SELECT status FROM public.handicap_calculation_runs WHERE id = ${sql(successorRun)}::uuid) <> 'DRAFT' OR (SELECT publication_eligibility FROM public.handicap_calculation_runs WHERE id = ${sql(successorRun)}::uuid) <> 'QUARANTINED' THEN RAISE EXCEPTION 'Phase136 run is not quarantined draft'; END IF;`
const targetChecks = `
  IF (SELECT count(*) FROM (VALUES ${expectedTargetValues}) e(id, course_id, difficulty, course_rating, slope, sample_size, distinct_players)) <> 73 THEN RAISE EXCEPTION 'expected target package is not exactly 73 unique rows'; END IF;
  IF (SELECT count(*) FROM public.handicap_rating_snapshots s JOIN (VALUES ${expectedTargetValues}) e(id, course_id, difficulty, course_rating, slope, sample_size, distinct_players) ON e.id=s.id WHERE s.course_id=e.course_id AND s.difficulty=e.difficulty AND s.course_rating=e.course_rating AND s.slope=e.slope AND s.sample_size=e.sample_size AND s.distinct_canonical_player_count=e.distinct_players AND s.review_scope='KWT_ONLY' AND s.model_version=${sql(modelVersion)} AND s.publication_status='UNPUBLISHED' AND s.slope > 0.01) <> 73 THEN RAISE EXCEPTION 'one or more exact Production snapshot targets failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.handicap_rating_snapshots s WHERE s.id = ANY(ARRAY[${list(targetIds)}]::uuid[]) AND NOT EXISTS (SELECT 1 FROM unnest(s.source_evidence_refs) ref JOIN public.handicap_source_provenance p ON p.source_fingerprint=ref)) THEN RAISE EXCEPTION 'one or more target snapshots lack complete provenance'; END IF;
  IF EXISTS (SELECT 1 FROM public.handicap_review_evidence WHERE id = ANY(ARRAY[${list(evidenceIds)}]::uuid[])) OR EXISTS (SELECT 1 FROM public.handicap_review_decisions WHERE id = ANY(ARRAY[${list(decisionIds)}]::uuid[])) THEN RAISE EXCEPTION 'Phase138 deterministic IDs already exist'; END IF;
  IF EXISTS (SELECT 1 FROM public.handicap_review_decisions WHERE subject_kind='SOURCE_RECORD' AND subject_key = ANY(ARRAY[${list(targetIds)}])) THEN RAISE EXCEPTION 'a target already has a review decision'; END IF;`

const preflight = `-- PHASE 138 READ-ONLY PREFLIGHT; no writes.\nBEGIN;\nSET TRANSACTION READ ONLY;\nDO $$\nBEGIN\n${baselineChecks}\n${targetChecks}\nEND $$;\nSELECT 'phase138_preflight_passed' AS status;\nROLLBACK;\n`
const install = `-- PHASE 138 PREPARED INSTALLER; DO NOT EXECUTE WITHOUT SEPARATE PRODUCTION AUTHORIZATION.\n-- Target project: ${project}\n-- Exact owner-approved batch SHA-256: ${batchSha}\nBEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('phase138-rating-decision-installation', 0));\nDO $$\nBEGIN\n${baselineChecks}\n${targetChecks}\nEND $$;\nINSERT INTO public.handicap_review_evidence (id, subject_kind, subject_key, source_ref, evidence_payload) VALUES\n${evidenceValues};\nINSERT INTO public.handicap_review_decisions (id, evidence_id, subject_kind, subject_key, decision, rationale, reviewer_id, decision_sequence) VALUES\n${decisionValues};\nDO $$\nBEGIN\n  IF (SELECT count(*) FROM public.handicap_review_evidence WHERE id=ANY(ARRAY[${list(evidenceIds)}]::uuid[])) <> 73 THEN RAISE EXCEPTION 'Phase138 evidence count mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_review_decisions WHERE id=ANY(ARRAY[${list(decisionIds)}]::uuid[])) <> 73 THEN RAISE EXCEPTION 'Phase138 decision count mismatch'; END IF;\nEND $$;\nCOMMIT;\n`
const postflight = `-- PHASE 138 READ-ONLY POSTFLIGHT; run only after separately authorized installation.\nBEGIN;\nSET TRANSACTION READ ONLY;\nDO $$\nBEGIN\n  IF (SELECT count(*) FROM public.handicap_calculation_runs) <> 5 OR (SELECT count(*) FROM public.handicap_source_provenance) <> 28672 OR (SELECT count(*) FROM public.handicap_rating_snapshots) <> 427 OR (SELECT count(*) FROM public.handicap_index_snapshots) <> 157 THEN RAISE EXCEPTION 'historical counts changed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_review_evidence) <> 74 OR (SELECT count(*) FROM public.handicap_review_decisions) <> 74 THEN RAISE EXCEPTION 'review counts are not 74'; END IF;\n  IF (SELECT count(*) FROM public.handicap_review_evidence WHERE id=ANY(ARRAY[${list(evidenceIds)}]::uuid[])) <> 73 OR (SELECT count(*) FROM public.handicap_review_decisions WHERE id=ANY(ARRAY[${list(decisionIds)}]::uuid[]) AND decision='ACCEPT') <> 73 THEN RAISE EXCEPTION 'Phase138 decisions incomplete'; END IF;\n  IF EXISTS (SELECT 1 FROM public.handicap_rating_snapshots WHERE publication_status <> 'UNPUBLISHED') THEN RAISE EXCEPTION 'a rating snapshot is published'; END IF;\n  IF (SELECT count(*) FROM public.handicap_publishable_rating_snapshots) <> 0 OR (SELECT count(*) FROM public.handicap_publishable_index_snapshots) <> 0 THEN RAISE EXCEPTION 'publishable views are not empty'; END IF;\n  IF EXISTS (SELECT 1 FROM (VALUES ('public.handicap_calculation_runs'::text), ('public.handicap_rating_snapshots'), ('public.handicap_index_snapshots'), ('public.handicap_review_evidence'), ('public.handicap_review_decisions'), ('public.handicap_source_provenance')) p(name) WHERE has_table_privilege('anon', p.name, 'select') OR has_table_privilege('authenticated', p.name, 'select')) THEN RAISE EXCEPTION 'client SELECT unexpectedly granted'; END IF;\nEND $$;\nSELECT 'phase138_postflight_passed' AS status;\nROLLBACK;\n`

fs.mkdirSync(outDir, { recursive: true })
write(path.join(outDir, "owner_rating_snapshot_mapping.csv"), `${Papa.unparse(rows.map(row => ({ approval_batch: "OWNER_APPROVED_73", approved_local_snapshot_id: row.approved_local_snapshot_id, target_snapshot_id: row.target_snapshot_id, target_kind: row.target_kind, source_status: row.source_status, course_id: row.course_id, difficulty: row.difficulty, approved_rating: row.course_rating, approved_slope: row.slope, sample_size: row.sample_size, distinct_players: row.distinct_players, model_version: row.model_version, review_scope: row.review_scope })), { newline: "\n" })}\n`)
writeJson(path.join(outDir, "rating_owner_decision_manifest.json"), {
  schema_version: "phase138-corrected-owner-approved-rating-decisions-v1",
  status: "LOCAL_OWNER_APPROVED_NOT_PRODUCTION",
  production_project: project,
  phase130_checkpoint: phase130Checkpoint,
  phase125_checkpoint: phase125Checkpoint,
  phase136_checkpoint: phase136Checkpoint,
  source_batch: { sha256: batchSha, phase130_manifest: "docs/handicap/phase130/rating_approval_batch_manifest.json", phase125_manifest: "docs/handicap/phase121/rating_approval_manifest.json", phase125_manifest_sha256: phase125Sha },
  owner_decision: { owner: "Krys", decision: "APPROVE_ALL_73_FOR_FORMAL_RATING_DECISION_INSTALLATION", recorded_at: null, reviewer_uuid: null, signature: null, basis: "Explicit owner approval; local artifact only; no Production decision or publication." },
  policy: { model_version: modelVersion, review_scope: scope, weekly_personal_inputs: 0, publication_status: "UNPUBLISHED" },
  counts: { rows: 73, target_snapshot_ids: 73, evidence_rows: 73, decision_rows: 73 },
  prior_approvals_preserved: phase130.owner_approved_ratings,
  explicit_holds: ["Hollywood Easy", "Hollywood Hard", "Gloop Lair Easy", "Gloop Lair Hard"],
  rows,
})
write(path.join(outDir, "rating_decision_installation_rows.csv"), `${Papa.unparse(rows.map(row => ({ target_snapshot_id: row.target_snapshot_id, target_kind: row.target_kind, course_id: row.course_id, difficulty: row.difficulty, course_rating: row.course_rating, slope: row.slope, sample_size: row.sample_size, distinct_players: row.distinct_players, model_version: row.model_version, review_scope: row.review_scope, evidence_id: row.evidence_id, decision_id: row.decision_id, decision: row.decision, source_ref: row.source_ref })), { newline: "\n" })}\n`)
write(path.join(outDir, "production_rating_decision_preflight.sql"), preflight)
write(path.join(outDir, "production_rating_decision_installation.sql"), install)
write(path.join(outDir, "production_rating_decision_postflight.sql"), postflight)
write(path.join(outDir, "rating_decision_installation_plan.md"), `# Phase 138 corrected rating-decision package\n\nStatus: **PREPARED LOCALLY; NOT EXECUTED IN PRODUCTION**.\n\nThe Phase 132 owner-approved rows were reconciled by exact course, difficulty, rating and slope to the current Production snapshot IDs recorded by the Phase 136 lineage package. The installer inserts only 73 evidence rows and 73 ACCEPT decisions. It does not insert or modify runs, provenance, ratings, indexes, identities, or publication state.\n\n- Production project: ${project}\n- Owner-approved batch SHA-256: ${batchSha}\n- Phase 130 checkpoint: ${phase130Checkpoint}\n- Phase 125 checkpoint: ${phase125Checkpoint}\n- Phase 136 checkpoint: ${phase136Checkpoint}\n- Expected existing counts: 5 runs, 28,672 provenance, 427 ratings, 157 indexes, 1 evidence, 1 decision\n- Expected after installation: 5 runs, 28,672 provenance, 427 ratings, 157 indexes, 74 evidence, 74 decisions\n- Publishable ratings/indexes remain 0/0.\n\nRun the preflight read-only. Only after a separate authorization may the exact checksummed installer run in one transaction. Then run the postflight read-only. Rating publication, index approval/publication, RPC changes and website deployment are separate actions.\n`)
const report = `# Phase 138 corrected Production snapshot mapping\n\n- Exact mappings: **73/73**\n- Unique target snapshot IDs: **73**\n- Target kinds: ${JSON.stringify(Object.fromEntries([...new Set(rows.map(row => row.target_kind))].map(kind => [kind, rows.filter(row => row.target_kind === kind).length])))}\n- Target scope: ${scope}\n- Model: ${modelVersion}\n- Target snapshots remain UNPUBLISHED; this package records no Production decision yet.\n- Five prior owner approvals are preserved separately. Hollywood Easy/Hard and Gloop Lair Easy/Hard remain explicit holds.\n- No reviewer UUID, signature or timestamp was invented.\n\nThe mapping was prepared from the committed Phase 136 lineage mapping and the Phase 132 owner-approved values. The Production preflight independently rechecks exact IDs, values, course/difficulty, model, scope, slope, sample size, distinct-player count, complete provenance references, quarantine state, client grants and empty publication views.\n`
write(path.join(outDir, "rating_owner_decision_report.md"), report)
const generatedFiles = ["owner_rating_snapshot_mapping.csv", "rating_owner_decision_manifest.json", "rating_decision_installation_rows.csv", "production_rating_decision_preflight.sql", "production_rating_decision_installation.sql", "production_rating_decision_postflight.sql", "rating_decision_installation_plan.md", "rating_owner_decision_report.md"]
const checksums = Object.fromEntries(generatedFiles.map(file => [file, hashFile(path.join(outDir, file))]))
writeJson(path.join(outDir, "checksums.json"), { phase: 138, production_project: project, owner_batch_sha256: batchSha, files: checksums })
console.log(JSON.stringify({ phase: 138, rows: rows.length, uniqueTargets: new Set(targetIds).size, targetKinds: Object.fromEntries([...new Set(rows.map(row => row.target_kind))].map(kind => [kind, rows.filter(row => row.target_kind === kind).length])), checksums }, null, 2))
