import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const sourceDir = path.join(root, "docs", "handicap", "phase114")
const outputDir = path.join(root, "docs", "handicap", "phase117")
const runId = "9a9a4bc4-e43d-55d4-84fb-a83c0b757681"
const manifestSha256 = "E808D8459AC131E384CCA0F2D44ED230B8513EA61671149322EDDEA1972230E3"
const sourceNamespace = "OFFICIAL_KWT_CSV"
const sourceZipSha256 = "E599CF6DF746F6C60C9718FBB73486396055567B738ED1A6EEB5808D2E2E46CE"
const packageRef = `phase117-kwt-s14w05-12-csv-import-v1:${manifestSha256}`
const lockKey = "krys-leagues:phase117:official-kwt-csv-import"

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase()
}

function uuidFromText(value) {
  const bytes = Buffer.from(crypto.createHash("sha256").update(value).digest("hex").slice(0, 32), "hex")
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlUuid(value) {
  return `${sqlText(value)}::uuid`
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value))}::jsonb`
}

function readCsv(file) {
  const result = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${path.basename(file)}: ${JSON.stringify(result.errors)}`)
  return result.data
}

function csvEscape(value) {
  const text = value == null ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(file, headers, rows) {
  fs.writeFileSync(file, renderCsv(headers, rows))
}

function renderCsv(headers, rows) {
  return `${headers.join(",")}\n${rows.map(row => headers.map(header => csvEscape(row[header])).join(",")).join("\n")}\n`
}

function textArray(values) {
  return `ARRAY[${values.map(sqlText).join(",")}]::text[]`
}

const sourceManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "package_manifest.json"), "utf8"))
const sourceRows = readCsv(path.join(sourceDir, "handicap_source_provenance_import.csv"))
const exceptions = readCsv(path.join(sourceDir, "handicap_source_provenance_exceptions.csv"))
const rows = sourceRows.map(row => ({
  id: uuidFromText(`phase117-provenance:${row.source_fingerprint}`),
  ...row,
}))
const playerIds = [...new Set(rows.map(row => row.canonical_player_id))].sort()
const pairKeys = [...new Set(rows.map(row => `${row.source_season}|${row.source_week}|${row.canonical_player_id}`))]
const sourceFingerprints = rows.map(row => row.source_fingerprint)
const packageCsvHeaders = ["id", "source_fingerprint", "source_type", "source_ref", "source_season", "source_week", "original_player_name", "canonical_player_id", "original_course_label", "original_course_code", "difficulty", "score", "metadata", "import_status"]

function validatePackage() {
  const actualManifestHash = sha256(fs.readFileSync(path.join(sourceDir, "package_manifest.json")))
  if (actualManifestHash !== manifestSha256) throw new Error(`manifest checksum mismatch: ${actualManifestHash}`)
  if (sourceManifest.resolved_player_week_pairs !== 364 || sourceManifest.quarantined_player_week_pairs !== 7) throw new Error("Phase 114 pair counts changed")
  if (sourceManifest.import_candidate_course_observations !== 728 || sourceManifest.quarantined_course_observations !== 14) throw new Error("Phase 114 observation counts changed")
  if (rows.length !== 728 || playerIds.length !== 65 || pairKeys.length !== 364) throw new Error("package count mismatch")
  if (exceptions.length !== 7) throw new Error("quarantine exception count changed")
  if (new Set(sourceFingerprints).size !== rows.length) throw new Error("source fingerprint collision in package")
  if (rows.filter(row => row.difficulty === "easy").length !== 364 || rows.filter(row => row.difficulty === "hard").length !== 364) throw new Error("Easy/Hard count mismatch")
  if (rows.some(row => row.source_type !== "KWT" || row.source_season !== "14" || Number(row.source_week) < 5 || Number(row.source_week) > 12 || !["easy", "hard"].includes(row.difficulty))) throw new Error("invalid KWT scope")
  if (rows.some(row => !row.canonical_player_id || !row.original_player_name || !row.source_ref || !row.original_course_code || !row.metadata)) throw new Error("missing provenance field")
  if (rows.some(row => { const metadata = JSON.parse(row.metadata); return metadata.provenance_namespace !== sourceNamespace || metadata.personal_handicap_eligible !== true || metadata.official_sequence !== "SEASON_WEEK_EASY_HARD" || metadata.chronology_confidence !== "OFFICIAL_KWT_SEQUENCE" })) throw new Error("source metadata contract mismatch")
  if (rows.some(row => Number.isNaN(Number(row.score)))) throw new Error("invalid score")
  if (rows.some(row => row.source_fingerprint.startsWith("THE_WEEKLY|"))) throw new Error("Weekly row crossed into KWT package")
  return actualManifestHash
}

function buildPreflight() {
  const ids = textArray(sourceFingerprints)
  const playerUuidArray = `ARRAY[${playerIds.map(sqlUuid).join(",")}]::uuid[]`
  return `\\set ON_ERROR_STOP on
select json_build_object(
  'project_database', current_database(),
  'calculation_runs', (select count(*) from public.handicap_calculation_runs),
  'provenance_rows', (select count(*) from public.handicap_source_provenance),
  'rating_snapshots', (select count(*) from public.handicap_rating_snapshots),
  'index_snapshots', (select count(*) from public.handicap_index_snapshots),
  'weekly_rows', (select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY'),
  'publishable_ratings', (select count(*) from public.handicap_publishable_rating_snapshots),
  'publishable_indexes', (select count(*) from public.handicap_publishable_index_snapshots),
  'phase117_run_exists', (select count(*) from public.handicap_calculation_runs where id=${sqlUuid(runId)}),
  'phase117_fingerprint_rows', (select count(*) from public.handicap_source_provenance where source_fingerprint = any(${ids})),
  'season14_weeks_05_12_rows', (select count(*) from public.handicap_source_provenance where source_type='KWT' and source_season=14 and source_week between 5 and 12),
  'canonical_players_present', (select count(*) from public.players where id = any(${playerUuidArray})),
  'rls_handicap_tables', (select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and relrowsecurity),
  'client_private_table_select', (select count(*) from (values ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_review_evidence'),('public.handicap_review_decisions'),('public.handicap_source_provenance')) as private_tables(table_name) where has_table_privilege('anon',table_name,'select') or has_table_privilege('authenticated',table_name,'select')),
  'source_fingerprint_unique_constraint', (select count(*) from pg_constraint where conrelid='public.handicap_source_provenance'::regclass and contype='u' and conname='handicap_source_provenance_source_fingerprint_key'),
  'canonical_player_foreign_key', (select count(*) from pg_constraint where conrelid='public.handicap_source_provenance'::regclass and conname='handicap_source_provenance_canonical_player_id_fkey'),
  'append_only_triggers', (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname in ('handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and t.tgname like 'handicap_handicap_%_append_only' and not t.tgisinternal)
) as phase117_preflight;

do $$ begin
  if (select count(*) from public.handicap_calculation_runs) <> 3 then raise exception 'unexpected calculation-run count'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 27944 then raise exception 'unexpected provenance count'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 410 then raise exception 'unexpected rating count'; end if;
  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'unexpected index count'; end if;
  if (select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY') <> 844 then raise exception 'unexpected Weekly count'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 then raise exception 'ratings are unexpectedly publishable'; end if;
  if (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'indexes are unexpectedly publishable'; end if;
  if (select count(*) from public.handicap_calculation_runs where id=${sqlUuid(runId)}) <> 0 then raise exception 'Phase 117 run already exists'; end if;
  if (select count(*) from public.handicap_source_provenance where source_fingerprint = any(${ids})) <> 0 then raise exception 'Phase 117 fingerprint already exists'; end if;
  if (select count(*) from public.handicap_source_provenance where source_type='KWT' and source_season=14 and source_week between 5 and 12) <> 0 then raise exception 'Season 14 Weeks 5-12 already have provenance rows'; end if;
  if (select count(*) from public.players where id = any(${playerUuidArray})) <> ${playerIds.length} then raise exception 'canonical player dependency mismatch'; end if;
  if (select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and relrowsecurity) <> 6 then raise exception 'Handicap RLS mismatch'; end if;
  if exists (select 1 from (values ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_review_evidence'),('public.handicap_review_decisions'),('public.handicap_source_provenance')) as private_tables(table_name) where has_table_privilege('anon',table_name,'select') or has_table_privilege('authenticated',table_name,'select')) then raise exception 'client Handicap table SELECT is unexpectedly granted'; end if;
  if (select count(*) from pg_constraint where conrelid='public.handicap_source_provenance'::regclass and contype='u' and conname='handicap_source_provenance_source_fingerprint_key') <> 1 then raise exception 'source fingerprint uniqueness mismatch'; end if;
  if (select count(*) from pg_constraint where conrelid='public.handicap_source_provenance'::regclass and conname='handicap_source_provenance_canonical_player_id_fkey') <> 1 then raise exception 'canonical player FK mismatch'; end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname in ('handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and t.tgname like 'handicap_handicap_%_append_only' and not t.tgisinternal) <> 5 then raise exception 'append-only trigger mismatch'; end if;
end $$;
`
}

function buildInstall() {
  const playerUuidArray = `ARRAY[${playerIds.map(sqlUuid).join(",")}]::uuid[]`
  const importCsv = renderCsv(packageCsvHeaders, rows)
  return `\\set ON_ERROR_STOP on
begin;
select pg_advisory_xact_lock(hashtext(${sqlText(lockKey)}));
create temporary table phase117_kwt_import (
  id uuid primary key,
  source_fingerprint text not null,
  source_type text not null,
  source_ref text not null,
  source_season integer,
  source_week integer,
  original_player_name text,
  canonical_player_id uuid not null,
  original_course_label text,
  original_course_code text,
  difficulty text not null,
  score numeric not null,
  metadata jsonb not null,
  import_status text not null
);
\\copy phase117_kwt_import (${packageCsvHeaders.join(",")}) from stdin with (format csv, header true, null '')
${importCsv}\\.
do $$ begin
  if (select count(*) from phase117_kwt_import) <> 728 then raise exception 'expected 728 import rows'; end if;
  if (select count(distinct source_fingerprint) from phase117_kwt_import) <> 728 then raise exception 'fingerprint uniqueness failed'; end if;
  if (select count(distinct canonical_player_id) from phase117_kwt_import) <> 65 then raise exception 'canonical player count failed'; end if;
  if (select count(*) from phase117_kwt_import where difficulty='easy') <> 364 or (select count(*) from phase117_kwt_import where difficulty='hard') <> 364 then raise exception 'Easy/Hard counts failed'; end if;
  if exists (select 1 from phase117_kwt_import where source_type <> 'KWT' or source_season <> 14 or source_week not between 5 and 12 or difficulty not in ('easy','hard') or import_status <> 'IMPORT_CANDIDATE_REQUIRES_NAMESPACE_REVIEW') then raise exception 'source contract failed'; end if;
  if exists (select 1 from phase117_kwt_import where metadata->>'provenance_namespace' <> ${sqlText(sourceNamespace)} or metadata->>'personal_handicap_eligible' <> 'true' or metadata->>'official_sequence' <> 'SEASON_WEEK_EASY_HARD' or metadata->>'chronology_confidence' <> 'OFFICIAL_KWT_SEQUENCE') then raise exception 'source metadata contract failed'; end if;
  if exists (select source_season, source_week, canonical_player_id, original_course_code, difficulty from phase117_kwt_import group by 1,2,3,4,5 having count(*) > 1) then raise exception 'duplicate course observation failed'; end if;
  if exists (select source_season, source_week, canonical_player_id from phase117_kwt_import group by 1,2,3 having count(*) <> 2) then raise exception 'incomplete Easy/Hard pair failed'; end if;
  if exists (select 1 from phase117_kwt_import i left join public.players p on p.id=i.canonical_player_id where p.id is null) then raise exception 'canonical player FK dependency failed'; end if;
  if exists (select 1 from phase117_kwt_import i join public.handicap_source_provenance p on p.source_fingerprint=i.source_fingerprint) then raise exception 'fingerprint collision failed'; end if;
  if exists (select 1 from phase117_kwt_import i join public.handicap_source_provenance p on p.source_type='KWT' and p.source_season=i.source_season and p.source_week=i.source_week and p.canonical_player_id=i.canonical_player_id and p.original_course_code=i.original_course_code and p.metadata->>'difficulty'=i.difficulty) then raise exception 'cross-namespace KWT collision failed'; end if;
  if (select count(*) from public.handicap_calculation_runs) <> 3 or (select count(*) from public.handicap_source_provenance) <> 27944 then raise exception 'pre-import counts changed'; end if;
  if (select count(*) from public.handicap_calculation_runs where id=${sqlUuid(runId)}) <> 0 then raise exception 'Phase 117 run already exists'; end if;
  if (select count(*) from public.players where id = any(${playerUuidArray})) <> 65 then raise exception 'canonical players missing'; end if;
end $$;
insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility, metadata)
values (${sqlUuid(runId)}, ${sqlText("krys-handicap-approved-policy-v1")}, ${sqlText("krys-handicap-candidate-a-v1")}, ${sqlText(packageRef)}, ${sqlText("SEASON_WEEK_EASY_HARD")}, 'DRAFT', 'QUARANTINED', ${sqlJson({ source_namespace: sourceNamespace, source_zip_sha256: sourceZipSha256, manifest_sha256: manifestSha256, resolved_player_week_pairs: 364, quarantined_player_week_pairs: 7, imported_observations: 728, canonical_player_count: 65, weekly_personal_handicap_eligible: false, import_only: true })});
insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, source_season, source_week, original_player_name, canonical_player_id, original_course_label, original_course_code, metadata)
select id, source_fingerprint, source_type, source_ref, source_season, source_week, original_player_name, canonical_player_id, original_course_label, original_course_code, metadata
from phase117_kwt_import;
do $$ begin
  if (select count(*) from public.handicap_calculation_runs) <> 4 then raise exception 'run count postflight failed'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'provenance count postflight failed'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 410 or (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'rating or index counts changed'; end if;
  if (select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY') <> 844 then raise exception 'Weekly count changed'; end if;
  if (select count(*) from public.handicap_source_provenance where metadata->>'provenance_namespace'=${sqlText(sourceNamespace)}) <> 728 then raise exception 'imported namespace count failed'; end if;
  if (select count(*) from public.handicap_calculation_runs where id=${sqlUuid(runId)} and status='DRAFT' and publication_eligibility='QUARANTINED') <> 1 then raise exception 'new run is not quarantined'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publication views are not empty'; end if;
end $$;
commit;
`
}

function buildPostflight() {
  return `\\set ON_ERROR_STOP on
select json_build_object(
  'calculation_runs', (select count(*) from public.handicap_calculation_runs),
  'provenance_rows', (select count(*) from public.handicap_source_provenance),
  'rating_snapshots', (select count(*) from public.handicap_rating_snapshots),
  'index_snapshots', (select count(*) from public.handicap_index_snapshots),
  'weekly_rows', (select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY'),
  'imported_namespace_rows', (select count(*) from public.handicap_source_provenance where metadata->>'provenance_namespace'=${sqlText(sourceNamespace)}),
  'new_run_status', (select status || '/' || publication_eligibility from public.handicap_calculation_runs where id=${sqlUuid(runId)}),
  'publishable_ratings', (select count(*) from public.handicap_publishable_rating_snapshots),
  'publishable_indexes', (select count(*) from public.handicap_publishable_index_snapshots),
  'client_private_table_select', (select count(*) from (values ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_review_evidence'),('public.handicap_review_decisions'),('public.handicap_source_provenance')) as private_tables(table_name) where has_table_privilege('anon',table_name,'select') or has_table_privilege('authenticated',table_name,'select'))
) as phase117_postflight;
do $$ begin
  if (select count(*) from public.handicap_calculation_runs) <> 4 then raise exception 'expected four calculation runs'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 28672 then raise exception 'expected 28672 provenance rows'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 410 then raise exception 'ratings changed'; end if;
  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'indexes changed'; end if;
  if (select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY') <> 844 then raise exception 'Weekly rows changed'; end if;
  if (select count(*) from public.handicap_source_provenance where metadata->>'provenance_namespace'=${sqlText(sourceNamespace)}) <> 728 then raise exception 'imported row count mismatch'; end if;
  if (select count(*) from public.handicap_calculation_runs where id=${sqlUuid(runId)} and status='DRAFT' and publication_eligibility='QUARANTINED') <> 1 then raise exception 'new run is not quarantined'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 or (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'publication views are not empty'; end if;
  if exists (select 1 from (values ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_review_evidence'),('public.handicap_review_decisions'),('public.handicap_source_provenance')) as private_tables(table_name) where has_table_privilege('anon',table_name,'select') or has_table_privilege('authenticated',table_name,'select')) then raise exception 'client SELECT unexpectedly granted'; end if;
end $$;
`
}

function build() {
  const actualManifestHash = validatePackage()
  fs.mkdirSync(outputDir, { recursive: true })
  const importRows = rows.map(row => ({ ...row, metadata: row.metadata }))
  writeCsv(path.join(outputDir, "handicap_source_provenance_import.csv"), packageCsvHeaders, importRows)
  fs.copyFileSync(path.join(sourceDir, "handicap_source_provenance_exceptions.csv"), path.join(outputDir, "handicap_source_provenance_exceptions.csv"))
  const preflight = buildPreflight()
  const install = buildInstall()
  const postflight = buildPostflight()
  fs.writeFileSync(path.join(outputDir, "production_preflight.sql"), preflight)
  fs.writeFileSync(path.join(outputDir, "production_install.sql"), install)
  fs.writeFileSync(path.join(outputDir, "production_postflight.sql"), postflight)
  const packageManifest = {
    package_version: "phase117-official-kwt-csv-production-import-v1",
    production_project: "jfbndcwdsvsjgnzwvexp",
    calculation_run_id: runId,
    source_manifest_sha256: actualManifestHash,
    source_zip_sha256: sourceZipSha256,
    source_namespace: sourceNamespace,
    source_type: "KWT",
    resolved_player_week_pairs: 364,
    quarantined_player_week_pairs: 7,
    imported_observations: 728,
    quarantined_observations: 14,
    distinct_canonical_players: 65,
    easy_observations: 364,
    hard_observations: 364,
    existing_production_counts: { calculation_runs: 3, provenance_rows: 27944, rating_snapshots: 410, index_snapshots: 157, weekly_rows: 844 },
    expected_post_import_counts: { calculation_runs: 4, provenance_rows: 28672, rating_snapshots: 410, index_snapshots: 157, weekly_rows: 844, publishable_ratings: 0, publishable_indexes: 0 },
    ratings_or_indexes_included: false,
    publication_eligibility: "QUARANTINED",
    status: "LOCAL_PACKAGE_REQUIRES_READ_ONLY_PREFLIGHT_AND_EXPLICIT_PRODUCTION_EXECUTION",
  }
  fs.writeFileSync(path.join(outputDir, "package_manifest.json"), `${JSON.stringify(packageManifest, null, 2)}\n`)
  const checksums = {}
  for (const file of ["handicap_source_provenance_import.csv", "handicap_source_provenance_exceptions.csv", "production_preflight.sql", "production_install.sql", "production_postflight.sql", "package_manifest.json"]) {
    checksums[file] = { sha256: sha256(fs.readFileSync(path.join(outputDir, file))), bytes: fs.statSync(path.join(outputDir, file)).size }
  }
  fs.writeFileSync(path.join(outputDir, "package_checksums.json"), `${JSON.stringify({ artifacts: checksums }, null, 2)}\n`)
  const readme = [
    "# Phase 117 KWT Season 14 Weeks 5–12 import package",
    "",
    `This is a provenance-only, append-only package for Supabase project jfbndcwdsvsjgnzwvexp. It imports 728 verified OFFICIAL_KWT_CSV observations under calculation run ${runId}. Seven unresolved player-week pairs remain in the exception ledger and are not present in the import CSV. No ratings or player-index snapshots are included.`,
    "",
    "Run production_preflight.sql first. Execute production_install.sql only through psql after the preflight passes. The installer uses client-side \\copy from stdin and does not require a filesystem variable. Run production_postflight.sql afterward.",
    "",
    "The installation uses client-side \\copy from stdin, one transaction, an advisory lock, deterministic UUIDs, strict count/dependency assertions, and no UPDATE/DELETE/TRUNCATE.",
    "",
  ].join("\\n")
  fs.writeFileSync(path.join(outputDir, "README.md"), readme)
  console.log(JSON.stringify({ outputDir, runId, sourceManifestSha256: actualManifestHash, importedObservations: rows.length, distinctCanonicalPlayers: playerIds.length, resolvedPairs: pairKeys.length, quarantinedPairs: exceptions.length, checksums }, null, 2))
}

build()
