import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const out = path.join(root, "docs", "handicap", "phase140")
const p126 = path.join(root, "docs", "handicap", "phase126")
const p136 = path.join(root, "docs", "handicap", "phase136")
const policyVersion = "krys-handicap-approved-policy-v1"
const modelVersion = "krys-handicap-candidate-a-v1"
const referenceSlope = 8.515
const sourceRunId = "8f136000-0000-5000-8000-000000000136"

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
const deterministicUuid = (value) => {
  const hex = crypto.createHash("sha256").update(value).digest("hex")
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-5" + hex.slice(13, 16) + "-" + ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + hex.slice(18, 20) + "-" + hex.slice(20, 32)
}
const readCsv = (file) => {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${file}: ${JSON.stringify(parsed.errors)}`)
  return parsed.data
}
const readArray = (value, label) => {
  const result = JSON.parse(value)
  if (!Array.isArray(result)) throw new Error(`${label} is not an array`)
  return result
}
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8")
const writeCsv = (file, rows) => fs.writeFileSync(file, Papa.unparse(rows, { newline: "\n" }) + "\n", "utf8")
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'"
const sqlArray = (values, type) => values.length ? `ARRAY[${values.map(sql).join(",")}]::${type}[]` : `ARRAY[]::${type}[]`

fs.mkdirSync(out, { recursive: true })

const phase126File = path.join(p126, "player_index_candidates.csv")
const phase136File = path.join(p136, "player_index_revalidation.csv")
const mappingFile = path.join(p136, "owner_rating_snapshot_mapping.csv")
const inputFiles = [phase126File, phase136File, mappingFile]
const inputChecksums = Object.fromEntries(inputFiles.map((file) => [path.relative(root, file).replaceAll("\\", "/"), sha256(file)]))
const inputSignature = sha256(phase126File) + ":" + sha256(phase136File) + ":" + sha256(mappingFile)
const packageRef = `phase140-rolling20-publication-v1:${inputSignature}`
const runId = deterministicUuid(packageRef)

const sourceRows = readCsv(phase126File)
const revalidatedRows = readCsv(phase136File)
const mappingRows = readCsv(mappingFile)
if (sourceRows.length !== 166 || revalidatedRows.length !== 166 || mappingRows.length !== 78) throw new Error("Phase 140 source counts are not 166/166/78")

const ratingMap = new Map(mappingRows.map((row) => [row.approved_local_snapshot_id, row.target_snapshot_id]))
if (ratingMap.size !== 78 || [...ratingMap.values()].some((value) => !/^[0-9a-f-]{36}$/i.test(value))) throw new Error("Rating mapping is not complete and UUID-shaped")

const revalidatedByPlayer = new Map(revalidatedRows.map((row) => [row.canonical_player_id, row]))
const indexRows = sourceRows.map((source) => {
  const validated = revalidatedByPlayer.get(source.canonical_player_id)
  if (!validated) throw new Error(`Missing Phase 136 revalidation for ${source.canonical_player_id}`)
  if (validated.validation_status !== "REVALIDATED") throw new Error(`Candidate is not revalidated: ${source.canonical_player_id}`)
  if (validated.resulting_index !== source.resulting_index || validated.handicap_status !== source.handicap_status || validated.active_round_count !== source.active_round_count) throw new Error(`Phase 136 changed a validated calculation: ${source.canonical_player_id}`)
  if (source.source_scope !== "KWT_ONLY" || Number(source.weekly_rows_used) !== 0 || source.chronology_confidence !== "OFFICIAL_KWT_SEQUENCE") throw new Error(`Invalid source boundary for ${source.canonical_player_id}`)

  const sourceRoundIds = readArray(source.source_round_ids, `${source.canonical_player_id}.source_round_ids`)
  const activeIds = readArray(source.active_twenty_source_round_ids, `${source.canonical_player_id}.active_twenty_source_round_ids`)
  const oldRatingIds = readArray(source.rating_snapshot_ids, `${source.canonical_player_id}.rating_snapshot_ids`)
  const mappedRatingIds = oldRatingIds.map((id) => ratingMap.get(id))
  if (mappedRatingIds.some((id) => !id)) throw new Error(`Missing rating dependency for ${source.canonical_player_id}`)
  if (activeIds.length !== Number(source.active_round_count)) throw new Error(`Active-window count mismatch for ${source.canonical_player_id}`)
  if (activeIds.length > 20 || activeIds.length < 1) throw new Error(`Invalid active-window size for ${source.canonical_player_id}`)
  if (new Set(sourceRoundIds).size !== sourceRoundIds.length || new Set(mappedRatingIds).size !== mappedRatingIds.length) throw new Error(`Duplicate source or rating dependency for ${source.canonical_player_id}`)

  return {
    id: deterministicUuid(`phase140-index:${runId}:${source.canonical_player_id}`),
    source_index_snapshot_id: source.snapshot_id,
    source_calculation_run_id: source.calculation_run_id,
    calculation_run_id: runId,
    canonical_player_id: source.canonical_player_id,
    canonical_screen_name: source.canonical_screen_name,
    source_round_ids: JSON.stringify(sourceRoundIds),
    rating_snapshot_ids: JSON.stringify(mappedRatingIds),
    rating_version_ids: JSON.stringify(mappedRatingIds),
    differential_model_version: modelVersion,
    latest_ten_source_round_ids: "[]",
    best_five_source_round_ids: "[]",
    active_twenty_source_round_ids: JSON.stringify(activeIds),
    resulting_index: validated.resulting_index,
    golf_display_index: validated.golf_display_index,
    handicap_status: validated.handicap_status,
    qualifying_scorecard_count: validated.qualifying_scorecard_count,
    active_round_count: validated.active_round_count,
    chronology_confidence: validated.chronology_confidence,
    source_scope: validated.source_scope,
    weekly_rows_used: validated.weekly_rows_used,
    publication_status: "UNPUBLISHED",
    publication_decision: "PENDING_SEPARATE_INDEX_APPROVAL",
    effective_from: "",
    validation_status: "PHASE136_REVALIDATED",
  }
})

const officialCount = indexRows.filter((row) => row.handicap_status === "OFFICIAL_ELIGIBLE").length
const provisionalCount = indexRows.filter((row) => row.handicap_status === "PROVISIONAL").length
if (officialCount !== 120 || provisionalCount !== 46) throw new Error(`Unexpected status counts ${officialCount}/${provisionalCount}`)
if (new Set(indexRows.map((row) => row.id)).size !== 166) throw new Error("Index IDs are not unique")

const allSourceRefs = [...new Set(indexRows.flatMap((row) => JSON.parse(row.source_round_ids)))]
const allRatingIds = [...new Set(indexRows.flatMap((row) => JSON.parse(row.rating_snapshot_ids)))]
if (allRatingIds.length !== 78) throw new Error(`Expected 78 referenced ratings, got ${allRatingIds.length}`)

const expectedRatings = mappingRows.map((row) => [row.target_snapshot_id, row.course_id, row.difficulty, row.approved_rating, row.approved_slope, row.source_status])
const expectedRatingValuesSql = expectedRatings.map(([id, course, difficulty, rating, slope, sourceStatus]) => `(${sql(id)}::uuid, ${sql(course)}, ${sql(difficulty)}, ${rating}, ${slope}, ${sql(sourceStatus)})`).join(",\n    ")
const expectedPlayerIdsSql = indexRows.map((row) => sql(row.canonical_player_id) + "::uuid").join(",")
const expectedSourceRefsSql = allSourceRefs.map(sql).join(",")
const expectedRatingIdsSql = allRatingIds.map((id) => sql(id) + "::uuid").join(",")
const insertRowsSql = indexRows.map((row) => `insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status, active_twenty_source_round_ids, active_round_count, handicap_status, effective_from) values (${sql(row.id)}::uuid, ${sql(runId)}::uuid, ${sql(row.canonical_player_id)}::uuid, ${sqlArray(JSON.parse(row.source_round_ids), "text")}, ${sqlArray(JSON.parse(row.rating_snapshot_ids), "uuid")}, ${sqlArray(JSON.parse(row.rating_version_ids), "text")}, ${sql(row.differential_model_version)}, ${sqlArray([], "text")}, ${sqlArray([], "text")}, ${row.resulting_index}, ${sql(row.chronology_confidence)}, 'UNPUBLISHED', ${sqlArray(JSON.parse(row.active_twenty_source_round_ids), "text")}, ${row.active_round_count}, ${sql(row.handicap_status)}, null);`).join("\n")

const guard = `do $$
declare
  expected_rating_count integer;
  expected_player_count integer;
  expected_source_count integer;
begin
  if (select count(*) from public.handicap_calculation_runs) <> 5 then raise exception 'Phase 140 baseline run count changed'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'Phase 140 baseline provenance count changed'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 427 then raise exception 'Phase 140 baseline rating count changed'; end if;
  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'Phase 140 baseline index count changed'; end if;
  if (select count(*) from public.handicap_review_evidence) <> 74 or (select count(*) from public.handicap_review_decisions) <> 74 then raise exception 'Phase 140 review counts changed'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'Phase 140 publication views are not empty'; end if;
  if exists (select 1 from public.handicap_calculation_runs where id = ${sql(runId)}::uuid) then raise exception 'Phase 140 run already exists'; end if;
  if exists (select 1 from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid) then raise exception 'Phase 140 index rows already exist'; end if;
  if (select count(*) from public.handicap_rating_snapshots where id = any(array[${expectedRatingIdsSql}]::uuid[])) <> 78 then raise exception 'Phase 140 rating dependencies are incomplete'; end if;
  select count(*) into expected_rating_count
    from (values
    ${expectedRatingValuesSql}
    ) as expected(id, course_id, difficulty, course_rating, slope, source_status)
    join public.handicap_rating_snapshots actual on actual.id = expected.id
    where actual.course_id = expected.course_id and actual.difficulty = expected.difficulty
      and actual.course_rating = expected.course_rating and actual.slope = expected.slope
      and actual.review_scope = 'KWT_ONLY' and actual.model_version = 'krys-course-rating-elite-lowest-12-v1'
      and actual.publication_status = 'UNPUBLISHED';
  if expected_rating_count <> 78 then raise exception 'Phase 140 rating values or approval scope mismatch'; end if;
  select count(*) into expected_player_count from public.players where id = any(array[${expectedPlayerIdsSql}]::uuid[]);
  if expected_player_count <> 166 then raise exception 'Phase 140 canonical player dependencies are incomplete'; end if;
  select count(*) into expected_source_count from public.handicap_source_provenance where source_fingerprint = any(array[${expectedSourceRefsSql}]::text[]);
  if expected_source_count <> ${allSourceRefs.length} then raise exception 'Phase 140 source provenance dependencies are incomplete'; end if;
  if exists (select 1 from public.handicap_source_provenance where source_fingerprint = any(array[${expectedSourceRefsSql}]::text[]) and (source_type <> 'KWT' or canonical_player_id is null or source_fingerprint like 'THE_WEEKLY%')) then raise exception 'Phase 140 personal source boundary failed'; end if;
  if (select count(*) from public.handicap_review_decisions where decision = 'ACCEPT' and subject_key in (select target_snapshot_id::text from (values ${expectedRatings.map(([id]) => `(${sql(id)}::uuid)`).join(",")}) as x(target_snapshot_id) where target_snapshot_id not in (select target_snapshot_id::uuid from (values ${mappingRows.filter((row) => row.approval_batch === "PRIOR_OWNER_APPROVAL_5").map((row) => `(${sql(row.target_snapshot_id)}::uuid)`).join(",")}) as prior(target_snapshot_id)))) <> 73 then raise exception 'Phase 140 pending rating approval coverage changed'; end if;
end $$;`

const runMetadata = {
  phase: 140,
  schema_version: "phase140-rolling20-publication-v1",
  source_package_ref: packageRef,
  source_run_id: sourceRunId,
  source_scope: "KWT_ONLY",
  policy_version: policyVersion,
  model_version: modelVersion,
  differential_formula: "(score - course rating) * 8.515 / course slope",
  reference_slope: referenceSlope,
  rolling_window: 20,
  average_all_active_differentials: true,
  best_five_selection: false,
  chronology_policy: "OFFICIAL_KWT_SEQUENCE",
  chronology_confidence: "OFFICIAL_KWT_SEQUENCE",
  allow_official_kwt_sequence_publication: true,
  publication_opt_in: false,
  publication_eligibility: "QUARANTINED",
  candidate_status_counts: { total: 166, official_eligible: officialCount, provisional: provisionalCount },
  weekly_personal_inputs: 0,
  referenced_rating_snapshots: 78,
  index_approval_required: true,
  effective_from: null,
  no_calendar_date_invented: true,
  phase136_player_index_revalidation_sha256: sha256(phase136File),
  phase126_round_window_sha256: sha256(phase126File),
  phase136_rating_mapping_sha256: sha256(mappingFile),
}
const runInsert = `insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, metadata, publication_eligibility) values (${sql(runId)}::uuid, ${sql(policyVersion)}, ${sql(modelVersion)}, ${sql(packageRef)}, 'OFFICIAL_KWT_SEQUENCE', 'DRAFT', ${sql(JSON.stringify(runMetadata))}::jsonb, 'QUARANTINED');`
const verification = `do $$ begin
  if (select count(*) from public.handicap_calculation_runs where id = ${sql(runId)}::uuid and status = 'DRAFT' and publication_eligibility = 'QUARANTINED') <> 1 then raise exception 'Phase 140 run verification failed'; end if;
  if (select count(*) from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and publication_status = 'UNPUBLISHED') <> 166 then raise exception 'Phase 140 index count verification failed'; end if;
  if (select count(*) from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and handicap_status = 'OFFICIAL_ELIGIBLE' and active_round_count = 20) <> 120 then raise exception 'Phase 140 official count verification failed'; end if;
  if (select count(*) from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and handicap_status = 'PROVISIONAL' and active_round_count between 1 and 19) <> 46 then raise exception 'Phase 140 provisional count verification failed'; end if;
  if exists (select 1 from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and exists (select 1 from unnest(source_round_ids) ref where ref like 'THE_WEEKLY%')) then raise exception 'Phase 140 Weekly personal input detected'; end if;
  if exists (select 1 from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and cardinality(active_twenty_source_round_ids) <> active_round_count) then raise exception 'Phase 140 active window mismatch'; end if;
end $$;`

const preflight = `-- PHASE 140 READ-ONLY PREFLIGHT; DO NOT EXECUTE AS A WRITE.\nbegin; set transaction read only;\n${guard}\nselect 'phase140_preflight_passed' as status; rollback;\n`
const installation = `-- PHASE 140 APPEND-ONLY UNPUBLISHED PACKAGE; NOT AUTHORIZED FOR PRODUCTION EXECUTION.\n-- Target project: jfbndcwdsvsjgnzwvexp\nbegin;\nselect pg_advisory_xact_lock(hashtextextended('phase140-rolling20-publication', 0));\n${guard}\n${runInsert}\n${insertRowsSql}\n${verification}\ncommit;\n`
const postflight = `-- PHASE 140 READ-ONLY POSTFLIGHT TEMPLATE; execute only after separately authorized installation.\nbegin; set transaction read only;\ndo $$ begin\n  if (select count(*) from public.handicap_calculation_runs) <> 6 then raise exception 'Phase 140 run count mismatch'; end if;\n  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'Phase 140 provenance changed'; end if;\n  if (select count(*) from public.handicap_rating_snapshots) <> 427 then raise exception 'Phase 140 rating count changed'; end if;\n  if (select count(*) from public.handicap_index_snapshots) <> 323 then raise exception 'Phase 140 index count mismatch'; end if;\n  if (select count(*) from public.handicap_index_snapshots where calculation_run_id = ${sql(runId)}::uuid and publication_status = 'UNPUBLISHED') <> 166 then raise exception 'Phase 140 unpublished index state mismatch'; end if;\n  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'Phase 140 publication gate opened'; end if;\nend $$;\nselect 'phase140_postflight_passed' as status; rollback;\n`

writeCsv(path.join(out, "index_snapshot_import_rows.csv"), indexRows)
writeJson(path.join(out, "calculation_run_manifest.json"), {
  schema_version: "phase140-rolling20-publication-v1",
  status: "LOCAL_DRAFT_QUARANTINED_UNPUBLISHED",
  production_project: "jfbndcwdsvsjgnzwvexp",
  calculation_run_id: runId,
  predecessor_run_id: sourceRunId,
  source_package_ref: packageRef,
  policy_version: policyVersion,
  model_version: modelVersion,
  chronology_policy: "OFFICIAL_KWT_SEQUENCE",
  reference_slope: referenceSlope,
  active_window: 20,
  candidate_counts: { total: 166, official_eligible: officialCount, provisional: provisionalCount, blocked: 0 },
  referenced_rating_snapshots: allRatingIds.length,
  source_round_references: allSourceRefs.length,
  weekly_personal_inputs: 0,
  effective_from: null,
  publication_opt_in: false,
  index_approval_required: true,
  input_checksums: inputChecksums,
})
fs.writeFileSync(path.join(out, "production_preflight.sql"), preflight, "utf8")
fs.writeFileSync(path.join(out, "production_installation.sql"), installation, "utf8")
fs.writeFileSync(path.join(out, "production_postflight.sql"), postflight, "utf8")
fs.writeFileSync(path.join(out, "package_report.md"), `# Phase 140 rolling-20 Handicap publication package\n\nStatus: **LOCAL PREPARATION ONLY — UNPUBLISHED**\n\n- Successor calculation run: \`${runId}\`\n- Predecessor validated run: \`${sourceRunId}\`\n- Candidates: 166 (120 OFFICIAL_ELIGIBLE, 46 PROVISIONAL)\n- Referenced approved KWT-only ratings: 78\n- Weekly personal-round inputs: 0\n- Active window: latest 20 qualifying cards, average of all active differentials\n- Chronology: OFFICIAL_KWT_SEQUENCE; no calendar date invented\n- Publication state: DRAFT / QUARANTINED run and UNPUBLISHED index snapshots\n- Existing historical index snapshots are preserved; new IDs are deterministic successors\n\nThe package deliberately leaves effective_from NULL. It is not publishable until a separately authorized release package supplies the required publication effective-period metadata and index approvals.\n`, "utf8")
const generated = ["index_snapshot_import_rows.csv", "calculation_run_manifest.json", "production_preflight.sql", "production_installation.sql", "production_postflight.sql", "package_report.md"]
writeJson(path.join(out, "checksums.json"), {
  schema_version: "phase140-rolling20-publication-v1",
  status: "LOCAL_PREPARATION_ONLY",
  production_project: "jfbndcwdsvsjgnzwvexp",
  calculation_run_id: runId,
  source_run_id: sourceRunId,
  counts: { candidates: 166, official_eligible: officialCount, provisional: provisionalCount, blocked: 0, rating_dependencies: 78, source_round_references: allSourceRefs.length, weekly_personal_inputs: 0 },
  input_checksums: inputChecksums,
  generated_files: Object.fromEntries(generated.map((name) => [name, sha256(path.join(out, name))])),
})
console.log(JSON.stringify({ calculationRunId: runId, candidates: 166, officialEligible: officialCount, provisional: provisionalCount, ratingDependencies: allRatingIds.length, sourceRoundReferences: allSourceRefs.length }, null, 2))
