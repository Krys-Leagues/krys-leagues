import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "docs", "handicap", "phase63");
const correctedDir = path.join(root, "docs", "handicap", "phase68");
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin";
const initdb = path.join(runtimeBin, "initdb.exe");
const postgres = path.join(runtimeBin, "postgres.exe");
const psql = path.join(runtimeBin, "psql.exe");
const workDir = path.join(root, `.phase68-local-recovery-${Date.now()}`);
const dataDir = path.join(workDir, "data");
const generatedDir = path.join(workDir, "generated");
const port = 55468;
const oldRun = "5a57560c-3548-54a8-879c-8fc516a85f26";
const correctedRun = "fb606c55-e2f6-5d01-b79d-bfcc129a7cc6";

function fail(message) { throw new Error(message); }
function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  return result.stdout ?? "";
}
function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csvLine(values) { return values.map(csvEscape).join(","); }
function pgArray(values) { return `{${values.map((value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`; }
function uuidFromText(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); }
  const header = rows[0] ?? [];
  return rows.slice(1).filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])));
}
function readCsv(file) { return parseCsv(fs.readFileSync(file, "utf8")); }
function writeCsv(file, header, rows) { fs.writeFileSync(file, [header.join(","), ...rows.map(csvLine)].join("\n") + "\n"); }
function snapshotFields(snapshot, runId, fingerprintMap) {
  return [snapshot.id, runId, snapshot.course_id, snapshot.difficulty, snapshot.course_rating, snapshot.slope, snapshot.sample_size, snapshot.distinct_canonical_player_count, snapshot.rating_confidence, snapshot.model_version, "", snapshot.effective_period, pgArray(snapshot.source_evidence_refs.map((ref) => fingerprintMap.get(ref) ?? ref)), "UNPUBLISHED", snapshot.review_scope];
}
function schemaSql() {
  return `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create table public.players (id uuid primary key);
create table public.handicap_calculation_runs (id uuid primary key, policy_version text not null, model_version text not null, source_package_ref text not null, chronology_policy text not null, status text not null check(status in ('DRAFT','COMPLETED','FAILED')), metadata jsonb not null default '{}', created_at timestamptz not null default now(), completed_at timestamptz);
create table public.handicap_source_provenance (id uuid primary key, source_fingerprint text not null unique, source_type text not null check(source_type in ('KWT','THE_WEEKLY')), source_ref text not null, source_date date, source_season integer, source_week integer, original_player_name text, canonical_player_id uuid references public.players(id), original_course_label text, original_course_code text, metadata jsonb not null default '{}', created_at timestamptz not null default now(), check(source_type <> 'THE_WEEKLY' or (canonical_player_id is null and metadata->>'personal_handicap_eligible'='false')));
create table public.handicap_rating_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id), course_id text not null, difficulty text not null check(difficulty in ('easy','hard')), course_rating numeric, slope numeric check(slope is null or slope > 0.01), sample_size integer not null check(sample_size >= 0), distinct_canonical_player_count integer not null check(distinct_canonical_player_count >= 0), rating_confidence text not null check(rating_confidence in ('ready','provisional','needs_data','needs_review')), model_version text not null, effective_from date, effective_period text, source_evidence_refs text[] not null default '{}', publication_status text not null check(publication_status in ('DRAFT','PROVISIONAL','UNPUBLISHED')), created_at timestamptz not null default now(), constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key unique(calculation_run_id, course_id, difficulty, model_version));
create table public.handicap_index_snapshots (id uuid primary key, calculation_run_id uuid not null, canonical_player_id uuid not null references public.players(id), publication_status text not null);
create table public.handicap_review_evidence (id uuid primary key, subject_kind text not null check(subject_kind in ('PLAYER_IDENTITY','COURSE_ALIAS','DUPLICATE_CANDIDATE','SOURCE_RECORD')), subject_key text not null, source_ref text not null, evidence_payload jsonb not null default '{}', unique(subject_kind, subject_key, source_ref));
create table public.handicap_review_decisions (id uuid primary key, evidence_id uuid references public.handicap_review_evidence(id), subject_kind text not null, subject_key text not null, decision text not null check(decision in ('ACCEPT','QUARANTINE','REJECT_WITH_EVIDENCE','NEEDS_MORE_INFORMATION')), rationale text not null, reviewer_id uuid references public.players(id), decision_sequence integer not null check(decision_sequence > 0), unique(subject_kind, subject_key, decision_sequence));
create schema handicap_private;
create or replace function handicap_private.reject_history_mutation() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin raise exception 'Handicap history is append-only' using errcode='55000'; end; $$;
do $$ declare t text; begin foreach t in array array['handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance'] loop execute format('create trigger %I before update or delete on public.%I for each row execute function handicap_private.reject_history_mutation()', 'handicap_'||t||'_append_only', t); end loop; end $$;
do $$ declare t text; begin foreach t in array array['handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance'] loop execute format('alter table public.%I enable row level security', t); execute format('revoke all on table public.%I from public,anon,authenticated', t); end loop; end $$;
grant select,insert,update on public.handicap_calculation_runs to service_role;
grant select,insert on public.handicap_rating_snapshots,public.handicap_index_snapshots,public.handicap_review_evidence,public.handicap_review_decisions,public.handicap_source_provenance to service_role;
revoke update,delete,truncate on public.handicap_rating_snapshots,public.handicap_index_snapshots,public.handicap_review_evidence,public.handicap_review_decisions,public.handicap_source_provenance from service_role;
`;
}
function psqlArgs(file) { return ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", file]; }
function query(sql) { return run(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-At", "-F", "\t", "-c", sql]).trim(); }
function assertQuery(sql, expected, label) { const actual = query(sql); if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function waitForReady(child, logs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000;
    let lastProbe = "";
    const timer = setInterval(() => {
      if (child.exitCode !== null) { clearInterval(timer); reject(new Error(`postgres exited: ${logs.join("")}`)); return; }
      const probe = spawnSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-At", "-c", "select 1"], { encoding: "utf8", windowsHide: true });
      lastProbe = `status=${probe.status} stdout=${probe.stdout ?? ""} stderr=${probe.stderr ?? ""} error=${probe.error?.message ?? ""}`;
      if (probe.status === 0 && probe.stdout.trim() === "1") { clearInterval(timer); resolve(); return; }
      if (Date.now() > deadline) { clearInterval(timer); reject(new Error(`postgres readiness timeout: ${logs.join("")} probe=${lastProbe}`)); }
    }, 250);
  });
}

const sourceRows = readCsv(path.join(sourceDir, "handicap_source_provenance_import.csv"));
const sourceManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "rating_snapshot_import_manifest.json"), "utf8"));
const correctedManifest = JSON.parse(fs.readFileSync(path.join(correctedDir, "rating_snapshot_import_manifest.json"), "utf8"));
const malformedByGood = new Map();
const correctedRows = sourceRows.map((row) => ({ ...row, metadata: JSON.parse(row.metadata) }));
const invalidRows = correctedRows.map((row) => {
  if (row.source_type !== "KWT") return row;
  const parts = row.source_fingerprint.split("|");
  const malformedFingerprint = [parts[0], parts[1], "", parts[3], parts[4]].join("|");
  malformedByGood.set(row.source_fingerprint, malformedFingerprint);
  const metadata = { ...row.metadata, source_player_id: null };
  return { ...row, id: uuidFromText(`handicap-source-provenance:${malformedFingerprint}`), source_fingerprint: malformedFingerprint, canonical_player_id: "", metadata };
});

fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(generatedDir, { recursive: true });
const provenanceHeader = ["id", "source_fingerprint", "source_type", "source_ref", "source_date", "source_season", "source_week", "original_player_name", "canonical_player_id", "original_course_label", "original_course_code", "metadata"];
writeCsv(path.join(generatedDir, "invalid_provenance.csv"), provenanceHeader, invalidRows.map((row) => provenanceHeader.map((key) => key === "metadata" ? JSON.stringify(row.metadata) : row[key])));
writeCsv(path.join(generatedDir, "corrected_provenance.csv"), provenanceHeader, correctedRows.map((row) => provenanceHeader.map((key) => key === "metadata" ? JSON.stringify(row.metadata) : row[key])));
const playerIds = [...new Set(correctedRows.filter((row) => row.source_type === "KWT").map((row) => row.canonical_player_id))].sort();
writeCsv(path.join(generatedDir, "players.csv"), ["id"], playerIds.map((id) => [id]));
const oldSnapshots = sourceManifest.ratingSnapshots.map((snapshot) => ({ ...snapshot, source_evidence_refs: snapshot.source_evidence_refs.map((ref) => malformedByGood.get(ref) ?? ref) }));
const snapshotHeader = ["id", "calculation_run_id", "course_id", "difficulty", "course_rating", "slope", "sample_size", "distinct_canonical_player_count", "rating_confidence", "model_version", "effective_from", "effective_period", "source_evidence_refs", "publication_status", "review_scope"];
writeCsv(path.join(generatedDir, "old_snapshots.csv"), snapshotHeader, oldSnapshots.map((s) => snapshotFields(s, oldRun, new Map())));
writeCsv(path.join(generatedDir, "corrected_snapshots.csv"), snapshotHeader, correctedManifest.ratingSnapshots.map((s) => snapshotFields(s, correctedRun, new Map())));

const schemaFile = path.join(generatedDir, "schema.sql");
const correctionFile = path.join(generatedDir, "review_scope.sql");
const importFile = path.join(generatedDir, "recovery.sql");
fs.writeFileSync(schemaFile, schemaSql());
fs.writeFileSync(correctionFile, fs.readFileSync(path.join(root, "supabase", "proposals", "20261019_handicap_rating_snapshot_review_scope.proposed.sql"), "utf8"));
const playersPath = path.join(generatedDir, "players.csv").replaceAll("\\", "/");
const invalidPath = path.join(generatedDir, "invalid_provenance.csv").replaceAll("\\", "/");
const correctedPath = path.join(generatedDir, "corrected_provenance.csv").replaceAll("\\", "/");
const oldSnapshotsPath = path.join(generatedDir, "old_snapshots.csv").replaceAll("\\", "/");
const correctedSnapshotsPath = path.join(generatedDir, "corrected_snapshots.csv").replaceAll("\\", "/");
const copy = (table, columns, file) => `\\copy ${table} (${columns}) from '${file.replaceAll("'", "''")}' with (format csv, header true, null '');`;
const runInsert = (id, label, packageRef) => `insert into public.handicap_calculation_runs (id,policy_version,model_version,source_package_ref,chronology_policy,status) values (${sqlLiteral(id)},'krys-handicap-approved-policy-v1','krys-course-rating-elite-lowest-12-v1',${sqlLiteral(packageRef)},'course-rating evidence only; no player-index snapshots','DRAFT');`;
fs.writeFileSync(importFile, `begin;\n${runInsert(oldRun, "invalid", "phase67-invalid-import")}\n${copy("players_import", "id", playersPath)}\n`);

const setupFile = path.join(generatedDir, "setup.sql");
fs.writeFileSync(setupFile, `${fs.readFileSync(schemaFile, "utf8")}\n${fs.readFileSync(correctionFile, "utf8")}`);
const invalidImportFile = path.join(generatedDir, "invalid_import.sql");
fs.writeFileSync(invalidImportFile, `begin;\n${runInsert(oldRun, "invalid", "phase67-invalid-import")}\ncreate temp table players_import(id uuid primary key);\n${copy("players_import", "id", playersPath)}\ninsert into public.players(id) select id from players_import;\n${copy("public.handicap_source_provenance", provenanceHeader.join(","), invalidPath)}\ncreate temp table snapshots_import (like public.handicap_rating_snapshots including defaults);\n${copy("snapshots_import", snapshotHeader.join(","), oldSnapshotsPath)}\ninsert into public.handicap_rating_snapshots (id,calculation_run_id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,source_evidence_refs,publication_status,review_scope) select id,calculation_run_id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,source_evidence_refs,publication_status,review_scope from snapshots_import;\ncommit;\n`);
const recoveryFile = path.join(generatedDir, "corrected_recovery.sql");
fs.writeFileSync(recoveryFile, `begin;\n${runInsert(correctedRun, "corrected", "phase68-provenance-recovery-v1")}\ncreate temp table corrected_provenance (like public.handicap_source_provenance including defaults);\n${copy("corrected_provenance", provenanceHeader.join(","), correctedPath)}\ninsert into public.handicap_source_provenance (id,source_fingerprint,source_type,source_ref,source_date,source_season,source_week,original_player_name,canonical_player_id,original_course_label,original_course_code,metadata) select id,source_fingerprint,source_type,source_ref,source_date,source_season,source_week,original_player_name,canonical_player_id,original_course_label,original_course_code,metadata::jsonb from corrected_provenance;\ninsert into public.handicap_review_evidence (id,subject_kind,subject_key,source_ref,evidence_payload) values ('${uuidFromText("phase68-review-evidence:" + oldRun)}','SOURCE_RECORD','${oldRun}','phase67-invalid-batch',jsonb_build_object('reason','malformed KWT compact dictionary indexes','provenance_rows',13550,'snapshot_rows',169));\ninsert into public.handicap_review_decisions (id,evidence_id,subject_kind,subject_key,decision,rationale,decision_sequence) values ('${uuidFromText("phase68-review-decision:" + oldRun)}','${uuidFromText("phase68-review-evidence:" + oldRun)}','SOURCE_RECORD','${oldRun}','QUARANTINE','Retain the Phase 67 batch for audit; its KWT identity indexes were malformed and must not be consumed.',1);\ncreate temp table corrected_snapshots (like public.handicap_rating_snapshots including defaults);\n${copy("corrected_snapshots", snapshotHeader.join(","), correctedSnapshotsPath)}\ndo $$ begin if exists (select 1 from corrected_snapshots s where exists (select 1 from unnest(s.source_evidence_refs) ref where not exists (select 1 from public.handicap_source_provenance p where p.source_fingerprint=ref))) then raise exception 'corrected snapshot provenance missing'; end if; end $$;\ninsert into public.handicap_rating_snapshots (id,calculation_run_id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,source_evidence_refs,publication_status,review_scope) select id,calculation_run_id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,source_evidence_refs,publication_status,review_scope from corrected_snapshots;\ncommit;\n`);
const correctedRecoverySql = fs.readFileSync(recoveryFile, "utf8")
  .replaceAll("nullif(canonical_player_id,'')", "canonical_player_id")
  .replace("from corrected_provenance;", "from corrected_provenance cp where not exists (select 1 from public.handicap_source_provenance existing where existing.source_fingerprint=cp.source_fingerprint);");
fs.writeFileSync(recoveryFile, correctedRecoverySql);

let child;
async function main() {
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 });
  const logs = [];
  child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  await waitForReady(child, logs);
  run(psql, psqlArgs(setupFile), { timeout: 60000 });
  run(psql, psqlArgs(invalidImportFile), { timeout: 180000 });
  assertQuery("select count(*) from public.handicap_calculation_runs", "1", "invalid batch run count");
  assertQuery("select count(*) from public.handicap_source_provenance", "14394", "invalid batch provenance count");
  assertQuery("select count(*) from public.handicap_rating_snapshots", "169", "invalid batch snapshot count");
  assertQuery("select count(*) from public.handicap_source_provenance where source_type='KWT' and canonical_player_id is null", "13550", "invalid KWT identity count");

  run(psql, psqlArgs(recoveryFile), { timeout: 180000 });
  assertQuery("select count(*) from public.handicap_calculation_runs", "2", "recovery run count");
  assertQuery("select count(*) from public.handicap_source_provenance", "27944", "append-only provenance count");
  assertQuery("select count(*) from public.handicap_rating_snapshots", "338", "append-only snapshot count");
  assertQuery("select count(*) from public.handicap_source_provenance where source_type='KWT' and canonical_player_id is not null", "13550", "corrected KWT identity count");
  assertQuery("select count(*) from public.handicap_source_provenance where source_type='KWT' and metadata->>'source_player_id' is not null", "13550", "corrected KWT source-player metadata count");
  assertQuery("select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY' and (canonical_player_id is not null or metadata->>'personal_handicap_eligible' <> 'false')", "0", "Weekly personal boundary");
  assertQuery(`select count(*) from public.handicap_rating_snapshots where calculation_run_id='${correctedRun}' and publication_status <> 'UNPUBLISHED'`, "0", "corrected publication boundary");
  assertQuery(`select count(*) from public.handicap_rating_snapshots s cross join lateral unnest(s.source_evidence_refs) ref left join public.handicap_source_provenance p on p.source_fingerprint=ref where s.calculation_run_id='${correctedRun}' and (p.id is null or (p.source_type='KWT' and p.canonical_player_id is null) or (p.source_type='THE_WEEKLY' and (p.canonical_player_id is not null or p.metadata->>'personal_handicap_eligible' <> 'false')))`, "0", "corrected snapshot references");
  assertQuery("select count(*) from public.handicap_review_decisions where decision='QUARANTINE'", "1", "invalid batch quarantine decision");
  assertQuery("select count(*) from pg_class where relname in ('handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and relrowsecurity", "6", "RLS tables");
  assertQuery("select has_table_privilege('anon','public.handicap_rating_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_source_provenance','select')::int::text", "00", "client access");
  assertQuery("select count(*) from public.handicap_index_snapshots", "0", "player index snapshots");

  const before = query("select (select count(*)::text from public.handicap_calculation_runs) || ':' || (select count(*)::text from public.handicap_source_provenance) || ':' || (select count(*)::text from public.handicap_rating_snapshots)");
  const idempotent = path.join(generatedDir, "idempotent.sql");
  fs.writeFileSync(idempotent, fs.readFileSync(recoveryFile, "utf8"));
  const repeat = spawnSync(psql, psqlArgs(idempotent), { encoding: "utf8", windowsHide: true });
  if (repeat.status === 0) fail("repeat recovery unexpectedly committed");
  assertQuery("select (select count(*)::text from public.handicap_calculation_runs) || ':' || (select count(*)::text from public.handicap_source_provenance) || ':' || (select count(*)::text from public.handicap_rating_snapshots)", before, "repeat recovery rollback");

  const bad = path.join(generatedDir, "bad_recovery.sql");
  fs.writeFileSync(bad, `begin; insert into public.handicap_calculation_runs (id,policy_version,model_version,source_package_ref,chronology_policy,status) values ('00000000-0000-4000-8000-000000000068','bad','bad','bad','bad','DRAFT'); insert into public.handicap_source_provenance (id,source_fingerprint,source_type,source_ref,metadata) values ('00000000-0000-4000-8000-000000000069','KWT|bad','KWT','bad','{}'); insert into public.handicap_rating_snapshots (id,calculation_run_id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,publication_status,review_scope) values ('00000000-0000-4000-8000-000000000070','00000000-0000-4000-8000-000000000068','bad','easy',0,0.01,1,1,'ready','bad','UNPUBLISHED','KWT_ONLY'); commit;`);
  const failed = spawnSync(psql, psqlArgs(bad), { encoding: "utf8", windowsHide: true });
  if (failed.status === 0) fail("invalid recovery unexpectedly committed");
  assertQuery("select count(*) from public.handicap_calculation_runs", "2", "failed transaction run rollback");
  assertQuery("select count(*) from public.handicap_source_provenance", "27944", "failed transaction provenance rollback");
  assertQuery("select count(*) from public.handicap_rating_snapshots", "338", "failed transaction snapshot rollback");

  const mutation = path.join(generatedDir, "mutation.sql");
  fs.writeFileSync(mutation, "update public.handicap_source_provenance set original_player_name='MUTATION' where source_type='KWT';");
  const mutationResult = spawnSync(psql, psqlArgs(mutation), { encoding: "utf8", windowsHide: true });
  if (mutationResult.status === 0) fail("append-only mutation unexpectedly succeeded");
  console.log(JSON.stringify({
    invalidBatch: { calculationRuns: 1, provenance: 14394, snapshots: 169, malformedKwtIdentity: 13550 },
    correctedAppendOnlyBatch: { calculationRuns: 1, newProvenance: 13550, existingWeeklyReused: 844, snapshots: 169, correctedKwtIdentity: 13550, weeklyExternal: 844, indexSnapshots: 0 },
    finalLocalCounts: { calculationRuns: 2, provenance: 27944, snapshots: 338, reviewEvidence: 1, reviewDecisions: 1 },
    safeguards: ["quarantine decision appended", "repeat recovery rejected atomically", "invalid recovery rejected atomically", "append-only mutation rejected", "RLS enabled on six tables", "client direct table access denied"],
  }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  fs.rmSync(workDir, { recursive: true, force: true });
});
