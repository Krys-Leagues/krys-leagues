import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const out = path.join(root, "docs", "handicap", "phase136")
const p68 = path.join(root, "docs", "handicap", "phase68")
const p121 = path.join(root, "docs", "handicap", "phase121")
const p126 = path.join(root, "docs", "handicap", "phase126")
const p135 = path.join(root, "docs", "handicap", "phase135")
const runId = "8f136000-0000-5000-8000-000000000136"
const localVeniceId = "96bdf7e8-1b97-51c8-83c7-3a03c3413f4e"
const modelVersion = "krys-course-rating-elite-lowest-12-v1"
const sourcePackageVersion = "phase68-provenance-recovery-v1"

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
const stableHash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").toUpperCase()
const deterministicUuid = (value) => {
  const hex = crypto.createHash("sha256").update(value).digest("hex")
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-5" + hex.slice(13, 16) + "-" + ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + hex.slice(18, 20) + "-" + hex.slice(20, 32)
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const readCsv = (file) => {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(file + ": " + JSON.stringify(parsed.errors))
  return parsed.data
}
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8")
const writeCsv = (file, rows) => fs.writeFileSync(file, Papa.unparse(rows, { newline: "\n" }) + "\n", "utf8")
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'"
const meta = (row) => JSON.parse(row.metadata || "{}")
const courseId = (row) => meta(row).course_id
const pairKey = (row) => row.source_season + "|" + row.source_week + "|" + row.canonical_player_id

fs.mkdirSync(out, { recursive: true })
const packageManifest = readJson(path.join(p68, "recovery_manifest.json"))
if (packageManifest.packageVersion !== sourcePackageVersion) throw new Error("Unexpected Phase68 package version")
const provenance = readCsv(path.join(p68, "handicap_source_provenance_import.csv"))
const kwt = provenance.filter((row) => row.source_type === "KWT")
const venice = kwt.filter((row) => courseId(row) === "Venice_easy" || courseId(row) === "Venice_hard")
const easy = venice.filter((row) => courseId(row) === "Venice_easy")
const hard = venice.filter((row) => courseId(row) === "Venice_hard")
if (easy.length !== 217 || hard.length !== 215) throw new Error("Unexpected Venice source counts")

const pairs = new Map()
for (const row of venice) {
  const rows = pairs.get(pairKey(row)) || []
  rows.push(row)
  pairs.set(pairKey(row), rows)
}
const completeKeys = new Set([...pairs.entries()]
  .filter((entry) => entry[1].length === 2 && new Set(entry[1].map(courseId)).size === 2)
  .map((entry) => entry[0]))
const excluded = easy.filter((row) => !completeKeys.has(pairKey(row)))
if (completeKeys.size !== 215 || excluded.length !== 2) throw new Error("Venice complete-pair reconciliation failed")
const fingerprints = new Set(venice.map((row) => row.source_fingerprint))
const logical = new Set(venice.map((row) => [row.source_season, row.source_week, row.canonical_player_id, courseId(row), meta(row).score].join("|")))
if (fingerprints.size !== venice.length || logical.size !== venice.length) throw new Error("Duplicate Venice evidence detected")

const comparison = excluded.map((row) => {
  const m = meta(row)
  return {
    source_fingerprint: row.source_fingerprint,
    source_record_id: row.id,
    source_ref: row.source_ref,
    canonical_player_id: row.canonical_player_id,
    original_player_name: row.original_player_name,
    course_id: m.course_id,
    difficulty: m.difficulty,
    score: m.score,
    source_season: row.source_season,
    source_week: row.source_week,
    event_id: m.event_id,
    source_player_id: m.source_player_id,
    round_id: m.round_id,
    division: m.division,
    source_package_version: sourcePackageVersion,
    duplicate_status: "UNIQUE_FINGERPRINT_AND_LOGICAL_OBSERVATION",
    revision_status: "NO_CONFLICTING_REVISION_OBSERVED",
    eligibility: "EXCLUDED_FROM_VENICE_RATING_INCOMPLETE_OFFICIAL_PAIR",
    evidence_classification: "VERIFIED_KWT_PROVENANCE_PRESERVED",
    missing_counterpart: "Venice_hard",
  }
})
writeCsv(path.join(out, "venice_easy_lineage_comparison.csv"), comparison)

const candidates = readCsv(path.join(p121, "rating_snapshot_candidates.csv"))
const veniceCandidate = candidates.find((row) => row.snapshot_id === localVeniceId)
if (!veniceCandidate || veniceCandidate.course_id !== "Venice_easy" || Number(veniceCandidate.sample_size) !== 215) throw new Error("Venice candidate contract mismatch")
const veniceRefs = easy.filter((row) => completeKeys.has(pairKey(row))).sort((a, b) => a.source_fingerprint.localeCompare(b.source_fingerprint)).map((row) => row.source_fingerprint)
if (veniceRefs.length !== 215) throw new Error("Venice source reference set is not 215")

const prior = readCsv(path.join(p135, "successor_rating_snapshots.csv"))
if (prior.length !== 16 || prior.some((row) => row.course_id === "Venice_easy")) throw new Error("Phase135 successor baseline mismatch")
const successors = prior.map((row) => {
  const id = deterministicUuid("phase136-successor-rating:" + runId + ":" + row.local_snapshot_id + ":" + row.course_id + ":" + row.difficulty + ":" + row.course_rating + ":" + row.slope + ":" + row.source_refs_sha256)
  return { ...row, successor_snapshot_id: id, calculation_run_id: runId }
})
const veniceSnapshotId = deterministicUuid("phase136-successor-rating:" + runId + ":" + localVeniceId + ":Venice_easy:easy:" + veniceCandidate.course_rating + ":" + veniceCandidate.slope + ":" + stableHash(veniceRefs))
successors.push({
  local_snapshot_id: localVeniceId,
  successor_snapshot_id: veniceSnapshotId,
  calculation_run_id: runId,
  course_id: "Venice_easy",
  difficulty: "easy",
  course_rating: veniceCandidate.course_rating,
  slope: veniceCandidate.slope,
  sample_size: veniceCandidate.sample_size,
  distinct_canonical_player_count: veniceCandidate.distinct_players,
  rating_confidence: "ready",
  model_version: modelVersion,
  effective_from: "",
  effective_period: "KWT S4W07 through S11W04; observed S4W07, S6W06, S8W12, S11W04; OFFICIAL_KWT_SEQUENCE; calendar date unavailable",
  source_evidence_refs: JSON.stringify(veniceRefs),
  source_ref_count: veniceRefs.length,
  source_refs_sha256: stableHash(veniceRefs),
  review_scope: "KWT_ONLY",
  publication_status: "UNPUBLISHED",
  lineage_status: "VERIFIED_COMPLETE_KWT_PAIR_PROVENANCE",
  predecessor_production_value: "-19.519",
  predecessor_production_slope: "6.265",
})
if (successors.length !== 17) throw new Error("Expected 17 successor snapshots")

const priorMapping = readCsv(path.join(p135, "owner_rating_snapshot_mapping.csv"))
const successorsByLocal = new Map(successors.map((row) => [row.local_snapshot_id, row]))
const mapping = priorMapping.map((row) => {
  const replacement = successorsByLocal.get(row.approved_local_snapshot_id)
  return replacement ? { ...row, target_snapshot_id: replacement.successor_snapshot_id, target_kind: "PHASE136_SUCCESSOR", source_status: "VERIFIED_SUCCESSOR_LINEAGE" } : row
})
if (mapping.length !== 78 || new Set(mapping.map((row) => row.approved_local_snapshot_id)).size !== 78 || !mapping.some((row) => row.approved_local_snapshot_id === localVeniceId && row.target_snapshot_id === veniceSnapshotId)) throw new Error("Complete rating mapping failed")

const targetByLocal = new Map()
for (const row of mapping) targetByLocal.set(row.approved_local_snapshot_id, row.target_snapshot_id)
if (targetByLocal.size !== 78) throw new Error("Expected 78 rating mappings")
const oldIndexes = readCsv(path.join(p126, "player_index_candidates.csv"))
const indexes = oldIndexes.map((row) => {
  const oldIds = JSON.parse(row.rating_snapshot_ids)
  const nextIds = oldIds.map((id) => targetByLocal.get(id) || "")
  if (nextIds.some((id) => !id)) throw new Error("Missing rating dependency for " + row.canonical_player_id)
  if (Number(row.weekly_rows_used) !== 0 || row.source_scope !== "KWT_ONLY") throw new Error("Invalid personal-index source scope")
  return {
    snapshot_id: row.snapshot_id,
    canonical_player_id: row.canonical_player_id,
    canonical_screen_name: row.canonical_screen_name,
    resulting_index: row.resulting_index,
    golf_display_index: row.golf_display_index,
    handicap_status: row.handicap_status,
    qualifying_scorecard_count: row.qualifying_scorecard_count,
    active_round_count: row.active_round_count,
    chronology_confidence: row.chronology_confidence,
    source_scope: row.source_scope,
    weekly_rows_used: row.weekly_rows_used,
    old_rating_snapshot_ids: JSON.stringify(oldIds),
    revalidated_rating_snapshot_ids: JSON.stringify(nextIds),
    validation_status: "REVALIDATED",
    dependency_mapping_changed: nextIds.some((id, index) => id !== oldIds[index]) ? "SUCCESSOR_OR_PRODUCTION_ID_REMAP" : "UNCHANGED_PRODUCTION_ID",
    calculation_value_changed: "NO",
    publication_status: "UNPUBLISHED",
    publication_decision: "PENDING_EXPLICIT_APPROVAL",
  }
})
if (indexes.length !== 166) throw new Error("Expected 166 index candidates")

const snapshotIds = successors.map((row) => sql(row.successor_snapshot_id) + "::uuid").join(",")
const allSourceRefs = [...new Set(successors.flatMap((row) => JSON.parse(row.source_evidence_refs)))]
const sourceAssertions = "  IF (SELECT count(*) FROM unnest(ARRAY[" + allSourceRefs.map((ref) => sql(ref)).join(",") + "]::text[]) AS expected(source_fingerprint) WHERE NOT EXISTS (SELECT 1 FROM public.handicap_source_provenance actual WHERE actual.source_fingerprint = expected.source_fingerprint)) <> 0 THEN RAISE EXCEPTION 'Phase136 source provenance reference mismatch'; END IF;"
const runMetadata = {
  phase: "136",
  source_package: "phase136-venice-complete-pair-lineage-recovery",
  predecessor_phase135_run_id: "8f135000-0000-5000-8000-000000000135",
  phase68_package_version: sourcePackageVersion,
  phase68_provenance_sha256: sha256(path.join(p68, "handicap_source_provenance_import.csv")),
  venice_lineage_rule: "official_complete_easy_hard_pair_only",
  venice_easy_ledger_rows: 217,
  venice_easy_qualifying_rows: 215,
  venice_easy_excluded_incomplete_pair_rows: 2,
  policy_version: "krys-handicap-approved-policy-v1",
  model_version: "krys-handicap-candidate-a-v1",
  rating_model_version: modelVersion,
  reference_slope: 8.515,
  source_scope: "KWT_ONLY",
  chronology_policy: "OFFICIAL_KWT_SEQUENCE",
  publication_opt_in: false,
  publication_eligibility: "QUARANTINED",
  successor_snapshot_count: 17,
  player_index_candidates: 166,
  blocked_player_index_candidates: 0,
  weekly_personal_inputs: 0,
}
const runInsert = "INSERT INTO public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, metadata, publication_eligibility) VALUES (" + sql(runId) + "::uuid, 'krys-handicap-approved-policy-v1', 'krys-handicap-candidate-a-v1', " + sql("phase136/" + sha256(path.join(p68, "handicap_source_provenance_import.csv")) + "/venice-lineage-recovery") + ", 'OFFICIAL_KWT_SEQUENCE', 'DRAFT', " + sql(JSON.stringify(runMetadata)) + "::jsonb, 'QUARANTINED');"
const snapshotInserts = successors.map((row) => {
  const refs = JSON.parse(row.source_evidence_refs)
  const refsSql = "ARRAY[" + refs.map((ref) => sql(ref)).join(",") + "]::text[]"
  return "INSERT INTO public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) VALUES (" + sql(row.successor_snapshot_id) + "::uuid, " + sql(runId) + "::uuid, " + sql(row.course_id) + ", " + sql(row.difficulty) + ", " + row.course_rating + ", " + row.slope + ", " + row.sample_size + ", " + row.distinct_canonical_player_count + ", 'ready', " + sql(modelVersion) + ", NULL, " + sql(row.effective_period) + ", " + refsSql + ", 'UNPUBLISHED', 'KWT_ONLY');"
}).join("\n")
const guard = "  IF (SELECT count(*) FROM public.handicap_calculation_runs) <> 4 OR (SELECT count(*) FROM public.handicap_source_provenance) <> 28672 OR (SELECT count(*) FROM public.handicap_rating_snapshots) <> 410 OR (SELECT count(*) FROM public.handicap_index_snapshots) <> 157 THEN RAISE EXCEPTION 'Phase136 baseline changed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_calculation_runs WHERE id = " + sql(runId) + "::uuid) <> 0 THEN RAISE EXCEPTION 'Phase136 run already exists'; END IF;\n  IF (SELECT count(*) FROM public.handicap_rating_snapshots WHERE id = ANY(ARRAY[" + snapshotIds + "]::uuid[])) <> 0 THEN RAISE EXCEPTION 'Phase136 successor snapshot already exists'; END IF;"
const preflight = "-- PHASE136 READ-ONLY PREFLIGHT; DO NOT EXECUTE AS A WRITE.\nBEGIN; SET TRANSACTION READ ONLY;\nDO $$ BEGIN\n" + guard + "\n" + sourceAssertions + "\nEND $$;\nSELECT 'phase136_preflight_passed' AS status; ROLLBACK;\n"
const installation = "-- PHASE136 APPEND-ONLY SUCCESSOR PACKAGE; NOT AUTHORIZED FOR PRODUCTION EXECUTION.\n-- Target project: jfbndcwdsvsjgnzwvexp\n-- One DRAFT / QUARANTINED run and 17 UNPUBLISHED KWT_ONLY rating snapshots.\nBEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('phase136-rating-lineage-recovery', 0));\nDO $$ BEGIN\n" + guard + "END $$;\n" + runInsert + "\n" + snapshotInserts + "\nDO $$ BEGIN\n  IF (SELECT count(*) FROM public.handicap_calculation_runs WHERE id = " + sql(runId) + "::uuid AND status = 'DRAFT' AND publication_eligibility = 'QUARANTINED') <> 1 THEN RAISE EXCEPTION 'Phase136 run insert verification failed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_rating_snapshots WHERE id = ANY(ARRAY[" + snapshotIds + "]::uuid[]) AND publication_status = 'UNPUBLISHED' AND review_scope = 'KWT_ONLY') <> 17 THEN RAISE EXCEPTION 'Phase136 successor insert verification failed'; END IF;\n  IF EXISTS (SELECT 1 FROM public.handicap_rating_snapshots s CROSS JOIN LATERAL unnest(s.source_evidence_refs) ref WHERE s.calculation_run_id = " + sql(runId) + "::uuid AND NOT EXISTS (SELECT 1 FROM public.handicap_source_provenance p WHERE p.source_fingerprint = ref)) THEN RAISE EXCEPTION 'Phase136 source provenance reference mismatch'; END IF;\nEND $$;\nCOMMIT;\n"
const postflight = "-- PHASE136 READ-ONLY POSTFLIGHT TEMPLATE; execute only after separately authorized installation.\nBEGIN; SET TRANSACTION READ ONLY;\nDO $$ BEGIN\n  IF (SELECT count(*) FROM public.handicap_calculation_runs) <> 5 THEN RAISE EXCEPTION 'run count mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_source_provenance) <> 28672 THEN RAISE EXCEPTION 'provenance changed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_rating_snapshots) <> 427 THEN RAISE EXCEPTION 'rating count mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_index_snapshots) <> 157 THEN RAISE EXCEPTION 'index count changed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_publishable_rating_snapshots) <> 0 OR (SELECT count(*) FROM public.handicap_publishable_index_snapshots) <> 0 THEN RAISE EXCEPTION 'publication gate opened'; END IF;\nEND $$;\nSELECT 'phase136_postflight_passed' AS status; ROLLBACK;\n"
fs.writeFileSync(path.join(out, "production_preflight.sql"), preflight, "utf8")
fs.writeFileSync(path.join(out, "production_installation.sql"), installation, "utf8")
fs.writeFileSync(path.join(out, "production_postflight.sql"), postflight, "utf8")
writeCsv(path.join(out, "successor_rating_snapshots.csv"), successors)
writeCsv(path.join(out, "rating_lineage_recovery.csv"), successors)
writeCsv(path.join(out, "owner_rating_snapshot_mapping.csv"), mapping)
writeCsv(path.join(out, "player_index_revalidation.csv"), indexes)
writeCsv(path.join(out, "lineage_exceptions.csv"), [])

const report = [
  "# Phase 136 Venice Easy lineage recovery",
  "",
  "Status: **READY FOR LOCAL DATABASE VALIDATION; PRODUCTION BLOCKED**",
  "",
  "## Exact discrepancy",
  "",
  "The corrected Phase 68 ledger contains 217 Venice Easy rows and 215 Venice Hard rows. Comparing official player-week keys (Season|Week|canonical_player_id) across both difficulties yields 215 complete Easy/Hard pairs and exactly 2 Easy-only rows. Both rows are listed in venice_easy_lineage_comparison.csv.",
  "",
  "The two rows remain preserved in the source provenance ledger. They are unique, have canonical UUIDs and source-player/round metadata, and have no observed duplicate fingerprint or conflicting revision. They are excluded only from the Venice Easy rating population because their official pair is incomplete; this is the complete-pair eligibility rule that produces the candidate sample size of 215. No score, identity, source record, or date was invented or removed.",
  "",
  "## Excluded rows",
  "",
  comparison.map((row) => "- " + row.source_fingerprint + " — " + row.original_player_name + " (" + row.canonical_player_id + "), score " + row.score + ", " + row.source_ref + "; missing paired Venice_hard for S" + row.source_season + "W" + String(row.source_week).padStart(2, "0") + ".").join("\n"),
  "",
  "## Successor package",
  "",
  "- The 16 Phase135 verified successor lineages are carried forward with Phase136 deterministic snapshot IDs.",
  "- Venice Easy is added as successor snapshot " + veniceSnapshotId + ", with 215 exact complete-pair source references, rating " + veniceCandidate.course_rating + ", slope " + veniceCandidate.slope + ", and official Season/Week effective-period metadata.",
  "- Total successor snapshots: 17.",
  "- Complete owner-rating mapping: 78/78.",
  "- All 166 rolling-20 candidates revalidated; 0 remain blocked by Venice lineage. Numeric values are unchanged.",
  "- Candidate status distribution: 120 OFFICIAL_ELIGIBLE, 46 PROVISIONAL; all remain UNPUBLISHED and pending explicit approval.",
  "- Weekly personal-index inputs: 0.",
  "",
  "## Production boundary",
  "",
  "The package is local-only. It proposes one DRAFT / QUARANTINED calculation run and 17 UNPUBLISHED KWT-only rating snapshots. It does not insert provenance, indexes, decisions, approvals, or publication state.",
  "",
].join("\n")
fs.writeFileSync(path.join(out, "recovery_report.md"), report, "utf8")

const files = ["venice_easy_lineage_comparison.csv", "successor_rating_snapshots.csv", "rating_lineage_recovery.csv", "owner_rating_snapshot_mapping.csv", "player_index_revalidation.csv", "lineage_exceptions.csv", "production_preflight.sql", "production_installation.sql", "production_postflight.sql", "recovery_report.md"]
writeJson(path.join(out, "checksums.json"), {
  schema_version: "phase136-venice-complete-pair-lineage-v1",
  status: "PRODUCTION_BLOCKED_LOCAL_PACKAGE_ONLY",
  production_project: "jfbndcwdsvsjgnzwvexp",
  phase135_checkpoint: "41922fc849a0b177f3366f09bc3ec716d811b43a",
  source_package_version: sourcePackageVersion,
  phase68_provenance_sha256: sha256(path.join(p68, "handicap_source_provenance_import.csv")),
  phase135_successor_sha256: sha256(path.join(p135, "successor_rating_snapshots.csv")),
  calculation_run_id: runId,
  counts: { venice_easy_ledger_rows: 217, venice_easy_qualifying_rows: 215, venice_easy_excluded_incomplete_pair_rows: 2, venice_hard_ledger_rows: 215, successor_snapshots: 17, complete_rating_mappings: 78, index_candidates: 166, blocked_index_candidates: 0, official_eligible: indexes.filter((row) => row.handicap_status === "OFFICIAL_ELIGIBLE").length, provisional: indexes.filter((row) => row.handicap_status === "PROVISIONAL").length, weekly_personal_inputs: 0 },
  generated_files: Object.fromEntries(files.map((name) => [name, sha256(path.join(out, name))])),
})
console.log(JSON.stringify({ veniceEasyLedgerRows: 217, veniceHardLedgerRows: 215, veniceQualifyingRows: 215, excludedIncompletePairRows: 2, successorSnapshots: 17, completeRatingMappings: 78, indexCandidates: 166, blockedIndexCandidates: 0, officialEligible: indexes.filter((row) => row.handicap_status === "OFFICIAL_ELIGIBLE").length, provisional: indexes.filter((row) => row.handicap_status === "PROVISIONAL").length, veniceSnapshotId }, null, 2))
