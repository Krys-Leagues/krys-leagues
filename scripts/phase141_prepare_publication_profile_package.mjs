import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const out = path.join(root, "docs", "handicap", "phase141")
const phase140 = path.join(root, "docs", "handicap", "phase140")
const effectiveFrom = "2026-10-22"
const project = "jfbndcwdsvsjgnzwvexp"
const runId = "5db94324-3789-559c-865c-35ed9c2081dd"
const sourceRunId = "8f136000-0000-5000-8000-000000000136"
const policyVersion = "krys-handicap-approved-policy-v1"
const modelVersion = "krys-handicap-candidate-a-v1"
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
const readCsv = (file) => {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${file}: ${JSON.stringify(parsed.errors)}`)
  return parsed.data
}
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8")
const writeCsv = (file, rows) => fs.writeFileSync(file, Papa.unparse(rows, { newline: "\n" }) + "\n", "utf8")
const readArray = (value, label) => {
  const parsed = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error(`${label} is not an array`)
  return parsed
}
const sqlArray = (values, type) => values.length
  ? `ARRAY[${values.map(sql).join(",")}]::${type}[]`
  : `ARRAY[]::${type}[]`
const generatedFiles = []
const writeText = (file, value) => { fs.writeFileSync(file, value, "utf8"); generatedFiles.push(file) }

fs.mkdirSync(out, { recursive: true })
const sourceRows = readCsv(path.join(phase140, "index_snapshot_import_rows.csv"))
if (sourceRows.length !== 166) throw new Error(`Expected 166 Phase 140 candidates, got ${sourceRows.length}`)
const rows = sourceRows.map((row) => ({ ...row, effective_from: effectiveFrom }))
const official = rows.filter((row) => row.handicap_status === "OFFICIAL_ELIGIBLE")
const provisional = rows.filter((row) => row.handicap_status === "PROVISIONAL")
if (official.length !== 120 || provisional.length !== 46) throw new Error("Phase 141 status counts changed")
if (rows.some((row) => row.source_scope !== "KWT_ONLY" || Number(row.weekly_rows_used) !== 0 || row.publication_status !== "UNPUBLISHED")) throw new Error("Unsafe personal-source boundary")
if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("Duplicate candidate snapshot IDs")

const ratingIds = [...new Set(rows.flatMap((row) => readArray(row.rating_snapshot_ids, `${row.canonical_player_id}.rating_snapshot_ids`)))]
const sourceRefs = [...new Set(rows.flatMap((row) => readArray(row.source_round_ids, `${row.canonical_player_id}.source_round_ids`)))]
const playerIds = [...new Set(rows.map((row) => row.canonical_player_id))]
if (ratingIds.length !== 78 || playerIds.length !== 166 || sourceRefs.length !== 14076) throw new Error("Phase 141 dependency counts changed")

const manifestRows = rows.map((row) => ({
  snapshot_id: row.id,
  canonical_player_id: row.canonical_player_id,
  canonical_screen_name: row.canonical_screen_name,
  resulting_index: Number(row.resulting_index),
  golf_display_index: row.golf_display_index,
  handicap_status: row.handicap_status,
  active_qualifying_card_count: Number(row.active_round_count),
  contributing_scorecard_ids: readArray(row.active_twenty_source_round_ids, `${row.canonical_player_id}.active_twenty_source_round_ids`),
  rating_snapshot_ids: readArray(row.rating_snapshot_ids, `${row.canonical_player_id}.rating_snapshot_ids`),
  model_version: modelVersion,
  chronology_confidence: row.chronology_confidence,
  source_scope: row.source_scope,
  weekly_personal_inputs: Number(row.weekly_rows_used),
  effective_from: effectiveFrom,
  publication_status: "UNPUBLISHED",
  approval_status: "PENDING_EXPLICIT_APPROVAL",
}))

const sourceChecksums = {
  phase140_rows: sha256(path.join(phase140, "index_snapshot_import_rows.csv")),
  phase140_manifest: sha256(path.join(phase140, "calculation_run_manifest.json")),
  phase140_package_checksums: sha256(path.join(phase140, "checksums.json")),
}
const approvalManifest = {
  schema_version: "phase141-rolling20-index-approval-v1",
  status: "LOCAL_PREPARATION_ONLY",
  production_project: project,
  calculation_run_id: runId,
  source_calculation_run_id: sourceRunId,
  effective_from: effectiveFrom,
  approval_status: "PENDING_EXPLICIT_APPROVAL",
  owner_numeric_fairness_acceptance: {
    accepted_by: ["Krys", "Tricky"],
    scope: "numeric fairness review of revised candidates only",
    not_publication_authorization: true,
    no_reviewer_signatures_or_timestamps_invented: true,
  },
  policy_version: policyVersion,
  model_version: modelVersion,
  differential_formula: "(score - course rating) * 8.515 / course slope",
  reference_slope: 8.515,
  rolling_window: 20,
  average_all_active_differentials: true,
  chronology_policy: "OFFICIAL_KWT_SEQUENCE",
  weekly_personal_inputs: 0,
  counts: { total: rows.length, official_eligible: official.length, provisional: provisional.length, blocked: 0, rating_dependencies: ratingIds.length },
  source_checksums: sourceChecksums,
  rows: manifestRows,
}
writeJson(path.join(out, "player_index_approval_manifest.json"), approvalManifest)
const approvalManifestSha256 = sha256(path.join(out, "player_index_approval_manifest.json"))
writeCsv(path.join(out, "player_index_approval_manifest.csv"), manifestRows)

const runManifest = {
  schema_version: "phase141-rolling20-publication-v1",
  status: "LOCAL_DRAFT_QUARANTINED_UNPUBLISHED",
  production_project: project,
  calculation_run_id: runId,
  predecessor_run_id: sourceRunId,
  policy_version: policyVersion,
  model_version: modelVersion,
  differential_formula: "(score - course rating) * 8.515 / course slope",
  reference_slope: 8.515,
  chronology_policy: "OFFICIAL_KWT_SEQUENCE",
  chronology_confidence: "OFFICIAL_KWT_SEQUENCE",
  allow_official_kwt_sequence_publication: true,
  rolling_window: 20,
  average_all_active_differentials: true,
  best_five_selection: false,
  effective_from: effectiveFrom,
  effective_period_is_metadata_only: true,
  publication_opt_in: false,
  publication_eligibility: "QUARANTINED",
  index_approval_required: true,
  candidate_counts: { total: rows.length, official_eligible: official.length, provisional: provisional.length, blocked: 0 },
  referenced_rating_snapshots: ratingIds.length,
  source_round_references: sourceRefs.length,
  weekly_personal_inputs: 0,
  input_checksums: sourceChecksums,
  approval_manifest_sha256: approvalManifestSha256,
}
writeJson(path.join(out, "calculation_run_manifest.json"), runManifest)
writeCsv(path.join(out, "index_snapshot_import_rows.csv"), rows)

const expectedRatingIds = ratingIds.map((id) => `${sql(id)}::uuid`).join(",")
const expectedPlayerIds = playerIds.map((id) => `${sql(id)}::uuid`).join(",")
const expectedSourceRefs = sourceRefs.map(sql).join(",")
const guard = `do $$
begin
  if (select count(*) from public.handicap_calculation_runs) <> 5 then raise exception 'Phase 141 baseline run count changed'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'Phase 141 baseline provenance count changed'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 427 then raise exception 'Phase 141 baseline rating count changed'; end if;
  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'Phase 141 baseline index count changed'; end if;
  if (select count(*) from public.handicap_review_evidence) <> 74 or (select count(*) from public.handicap_review_decisions) <> 74 then raise exception 'Phase 141 review counts changed'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'Phase 141 publication views are not empty'; end if;
  if exists (select 1 from public.handicap_calculation_runs where id = ${sql(runId)}::uuid) then raise exception 'Phase 141 run already exists'; end if;
  if exists (select 1 from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid) then raise exception 'Phase 141 index rows already exist'; end if;
  if (select count(*) from public.handicap_rating_snapshots where id = any(array[${expectedRatingIds}]::uuid[])) <> 78 then raise exception 'Phase 141 rating dependencies are incomplete'; end if;
  if (select count(*) from public.players where id = any(array[${expectedPlayerIds}]::uuid[])) <> 166 then raise exception 'Phase 141 canonical player dependencies are incomplete'; end if;
  if (select count(*) from public.handicap_source_provenance where source_fingerprint = any(array[${expectedSourceRefs}]::text[])) <> ${sourceRefs.length} then raise exception 'Phase 141 source dependencies are incomplete'; end if;
  if exists (select 1 from public.handicap_source_provenance where source_fingerprint = any(array[${expectedSourceRefs}]::text[]) and source_type <> 'KWT') then raise exception 'Phase 141 personal source boundary failed'; end if;
end $$;`

const metadata = JSON.stringify({ phase: 141, source_calculation_run_id: sourceRunId, source_scope: "KWT_ONLY", policy_version: policyVersion, model_version: modelVersion, differential_formula: "(score - course rating) * 8.515 / course slope", reference_slope: 8.515, rolling_window: 20, average_all_active_differentials: true, chronology_policy: "OFFICIAL_KWT_SEQUENCE", chronology_confidence: "OFFICIAL_KWT_SEQUENCE", allow_official_kwt_sequence_publication: true, effective_from: effectiveFrom, effective_period_is_metadata_only: true, publication_opt_in: false, approval_manifest_sha256: approvalManifestSha256, owner_numeric_fairness_acceptance: ["Krys", "Tricky"], weekly_personal_inputs: 0 })
const runInsert = `insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, metadata, publication_eligibility) values (${sql(runId)}::uuid, ${sql(policyVersion)}, ${sql(modelVersion)}, ${sql(`phase141-rolling20-publication:${sourceChecksums.phase140_rows}`)}, 'OFFICIAL_KWT_SEQUENCE', 'DRAFT', ${sql(metadata)}::jsonb, 'QUARANTINED');`
const insertRows = rows.map((row) => `insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status, active_twenty_source_round_ids, active_round_count, handicap_status, effective_from) values (${sql(row.id)}::uuid, ${sql(runId)}::uuid, ${sql(row.canonical_player_id)}::uuid, ${sqlArray(readArray(row.source_round_ids, row.canonical_player_id), "text")}, ${sqlArray(readArray(row.rating_snapshot_ids, row.canonical_player_id), "uuid")}, ${sqlArray(readArray(row.rating_version_ids, row.canonical_player_id), "text")}, ${sql(row.differential_model_version)}, ${sqlArray([], "text")}, ${sqlArray([], "text")}, ${row.resulting_index}, ${sql(row.chronology_confidence)}, 'UNPUBLISHED', ${sqlArray(readArray(row.active_twenty_source_round_ids, row.canonical_player_id), "text")}, ${row.active_round_count}, ${sql(row.handicap_status)}, ${sql(effectiveFrom)}::date);`).join("\n")
const verification = `do $$ begin
  if (select count(*) from public.handicap_calculation_runs where id = ${sql(runId)}::uuid and status = 'DRAFT' and publication_eligibility = 'QUARANTINED') <> 1 then raise exception 'Phase 141 run verification failed'; end if;
  if (select count(*) from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and publication_status = 'UNPUBLISHED' and effective_from = ${sql(effectiveFrom)}::date) <> 166 then raise exception 'Phase 141 index count/date verification failed'; end if;
  if (select count(*) from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and exists (select 1 from unnest(source_round_ids) ref where ref like 'THE_WEEKLY%')) <> 0 then raise exception 'Phase 141 Weekly personal input detected'; end if;
end $$;`
const preflight = `-- PHASE 141 READ-ONLY PREFLIGHT; DO NOT EXECUTE AS A WRITE.\nbegin; set transaction read only;\n${guard}\nselect 'phase141_preflight_passed' as status; rollback;\n`
const installation = `-- PHASE 141 APPEND-ONLY DRAFT/QUARANTINED PACKAGE; NOT AUTHORIZED FOR PRODUCTION EXECUTION.\n-- Effective date metadata: ${effectiveFrom}; publication_opt_in=false.\n-- Target project: ${project}\nbegin;\nselect pg_advisory_xact_lock(hashtextextended('phase141-rolling20-publication', 0));\n${guard}\n${runInsert}\n${insertRows}\n${verification}\ncommit;\n`
const postflight = `-- PHASE 141 READ-ONLY POSTFLIGHT TEMPLATE; execute only after separately authorized installation.\nbegin; set transaction read only;\ndo $$ begin\n  if (select count(*) from public.handicap_calculation_runs) <> 6 then raise exception 'Phase 141 run count mismatch'; end if;\n  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'Phase 141 provenance count changed'; end if;\n  if (select count(*) from public.handicap_rating_snapshots) <> 427 then raise exception 'Phase 141 rating count changed'; end if;\n  if (select count(*) from public.handicap_index_snapshots) <> 323 then raise exception 'Phase 141 index count mismatch'; end if;\n  if (select count(*) from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and publication_status = 'UNPUBLISHED' and effective_from = ${sql(effectiveFrom)}::date) <> 166 then raise exception 'Phase 141 unpublished index/date mismatch'; end if;\n  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'Phase 141 publication gate opened'; end if;\nend $$;\nselect 'phase141_postflight_passed' as status; rollback;\n`
writeText(path.join(out, "production_preflight.sql"), preflight)
writeText(path.join(out, "production_installation.sql"), installation)
writeText(path.join(out, "production_postflight.sql"), postflight)
writeText(path.join(out, "public_profile_read_preflight.sql"), `-- PHASE 141 PUBLIC PROFILE RPC READ-ONLY PREFLIGHT; DO NOT EXECUTE AS A WRITE.\nbegin; set transaction read only;\ndo $$ begin
  if to_regnamespace('handicap_private') is null then raise exception 'handicap_private schema missing'; end if;
  if to_regclass('public.players') is null or to_regclass('public.handicap_publishable_index_snapshots') is null then raise exception 'public profile dependencies missing'; end if;
  if to_regprocedure('public.get_published_handicap_for_player(uuid)') is null then raise exception 'identity-bound self-read RPC missing'; end if;
  if to_regprocedure('public.get_public_published_handicap_for_player(uuid)') is not null or to_regprocedure('handicap_private.get_public_published_handicap_for_player(uuid)') is not null then raise exception 'public profile RPC already exists'; end if;
  if has_table_privilege('anon', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') then raise exception 'direct client snapshot access is not denied'; end if;
  if (select count(*) from public.handicap_calculation_runs) <> 5 or (select count(*) from public.handicap_source_provenance) <> 28672 or (select count(*) from public.handicap_rating_snapshots) <> 427 or (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'Phase 141 baseline counts changed'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publishable data is not empty'; end if;
end $$;\nselect 'phase141_public_profile_read_preflight_passed' as status; rollback;\n`)
writeText(path.join(out, "public_profile_read_postflight.sql"), `-- PHASE 141 PUBLIC PROFILE RPC READ-ONLY POSTFLIGHT; execute only after separately authorized RPC installation.\nbegin; set transaction read only;\ndo $$ begin
  if to_regprocedure('public.get_public_published_handicap_for_player(uuid)') is null or to_regprocedure('handicap_private.get_public_published_handicap_for_player(uuid)') is null then raise exception 'public profile RPC is missing'; end if;
  if not has_function_privilege('anon', 'public.get_public_published_handicap_for_player(uuid)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.get_public_published_handicap_for_player(uuid)', 'EXECUTE') then raise exception 'public wrapper execute grants missing'; end if;
  if has_table_privilege('anon', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_index_snapshots', 'SELECT') or has_table_privilege('anon', 'public.handicap_publishable_index_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.handicap_publishable_index_snapshots', 'SELECT') then raise exception 'direct client snapshot access was broadened'; end if;
  if (select count(*) from public.handicap_calculation_runs) <> 5 or (select count(*) from public.handicap_source_provenance) <> 28672 or (select count(*) from public.handicap_rating_snapshots) <> 427 or (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'Phase 141 counts changed'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publication state changed'; end if;
end $$;\nselect 'phase141_public_profile_read_postflight_passed' as status; rollback;\n`)

writeText(path.join(out, "approval_report.md"), `# Phase 141 rolling-20 index approval package\n\nStatus: **LOCAL PREPARATION ONLY — UNPUBLISHED**\n\n- Candidates: 166 (120 OFFICIAL-ELIGIBLE, 46 PROVISIONAL)\n- Calculation run: \`${runId}\`, DRAFT / QUARANTINED\n- Effective date metadata approved by Krys: **${effectiveFrom}**\n- Publication authorization: **pending separate explicit approval**\n- Rating dependencies: 78 approved KWT-only snapshot targets\n- Weekly personal-round inputs: 0\n- Formula: \`(score - course rating) * 8.515 / course slope\`\n- Chronology: OFFICIAL_KWT_SEQUENCE\n\nNumeric fairness acceptance by Krys and Tricky is preserved as review context only. No player index or rating is auto-approved by this package.\n`)
writeText(path.join(out, "rating_publication_prerequisites.md"), `# Rating publication prerequisites\n\nThe 73 rating ACCEPT decisions already recorded in Production are review decisions, not publication. Hollywood Easy/Hard remain PROVISIONAL; Gloop Lair Easy/Hard remain UNRATED. A later rating publication package must use a new immutable successor run with explicit completion/eligibility metadata, effective date or approved period evidence, publication opt-in, and the existing provenance, chronology, slope, RLS and append-only gates.\n`)
writeText(path.join(out, "profile_read_contract.md"), `# Public Handicap profile read contract\n\nProposed RPC: \`public.get_public_published_handicap_for_player(uuid)\`.\n\nThe wrapper is callable by anonymous and authenticated clients, but returns only rows admitted by the existing publishable-index view. It returns canonical player ID, current screen name, signed numeric index, golf display notation, status, card count, model version, effective date, published timestamp, and safe publication history. It never returns source-round IDs, rating IDs, provenance, review evidence, or private fields. The existing identity-bound \`public.get_published_handicap_for_player(uuid)\` remains unchanged for self-only reads. No direct table or view SELECT grants are added. Installation is a separate authorization.\n`)

const allFiles = ["player_index_approval_manifest.json", "player_index_approval_manifest.csv", "calculation_run_manifest.json", "index_snapshot_import_rows.csv", "production_preflight.sql", "production_installation.sql", "production_postflight.sql", "public_profile_read_preflight.sql", "public_profile_read_postflight.sql", "approval_report.md", "rating_publication_prerequisites.md", "profile_read_contract.md"]
writeJson(path.join(out, "checksums.json"), { schema_version: "phase141-rolling20-publication-v1", status: "LOCAL_PREPARATION_ONLY", effective_from: effectiveFrom, generated_files: Object.fromEntries(allFiles.map((name) => [name, sha256(path.join(out, name))])), source_checksums: sourceChecksums, public_profile_rpc_proposal_sha256: sha256(path.join(root, "supabase", "proposals", "20261022_handicap_public_profile_read_rpc.proposed.sql")) })
console.log(JSON.stringify({ phase: 141, runId, candidates: rows.length, officialEligible: official.length, provisional: provisional.length, ratingDependencies: ratingIds.length, sourceRoundReferences: sourceRefs.length, effectiveFrom, publicationOptIn: false }, null, 2))
