import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const packageDir = path.join(root, "docs", "handicap", "phase63");
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin";
const initdb = path.join(runtimeBin, "initdb.exe");
const postgres = path.join(runtimeBin, "postgres.exe");
const psql = path.join(runtimeBin, "psql.exe");
const workDir = path.join(root, `.phase65-local-import-${Date.now()}`);
const dataDir = path.join(workDir, "data");
const generatedDir = path.join(workDir, "generated");
const port = 55465;

const provenancePath = path.join(packageDir, "handicap_source_provenance_import.csv");
const snapshotManifestPath = path.join(packageDir, "rating_snapshot_import_manifest.json");
const calculationRunPath = path.join(packageDir, "calculation_run_import_manifest.json");

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.length === 0) {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.some((v) => v !== "")).map((r) => {
    const result = {};
    header.forEach((key, index) => { result[key] = r[index] ?? ""; });
    return result;
  });
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvLine(values) {
  return values.map(csvEscape).join(",");
}

function pgArray(values) {
  return `{${values.map((value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}

function uuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail(`${label} is not a UUID: ${value}`);
  }
  return value;
}

function loadPackage() {
  const rows = parseCsv(fs.readFileSync(provenancePath, "utf8"));
  const snapshotManifest = readJson(snapshotManifestPath);
  const calculationRun = readJson(calculationRunPath);
  const snapshots = snapshotManifest.ratingSnapshots;
  const run = calculationRun;

  if (rows.length !== 14394) fail(`expected 14394 provenance rows, found ${rows.length}`);
  if (snapshots.length !== 169) fail(`expected 169 snapshots, found ${snapshots.length}`);
  if (run.status !== "DRAFT") fail(`calculation run must be DRAFT, found ${run.status}`);

  const fingerprints = new Set();
  const canonicalIds = new Set();
  let kwt = 0;
  let weekly = 0;
  for (const row of rows) {
    uuid(row.id, "provenance id");
    if (fingerprints.has(row.source_fingerprint)) fail(`duplicate source fingerprint: ${row.source_fingerprint}`);
    fingerprints.add(row.source_fingerprint);
    if (!["KWT", "THE_WEEKLY"].includes(row.source_type)) fail(`invalid source type: ${row.source_type}`);
    if (row.source_type === "KWT") {
      kwt += 1;
      if (row.canonical_player_id) canonicalIds.add(uuid(row.canonical_player_id, "KWT canonical_player_id"));
    } else {
      weekly += 1;
      if (row.canonical_player_id) fail(`Weekly row has canonical player id: ${row.source_fingerprint}`);
      const metadata = JSON.parse(row.metadata);
      if (metadata.personal_handicap_eligible !== false) fail(`Weekly row is not marked personal-handicap-ineligible: ${row.source_fingerprint}`);
    }
  }

  const snapshotIds = new Set();
  const snapshotKeys = new Map();
  const referenced = new Set();
  for (const snapshot of snapshots) {
    uuid(snapshot.id, "snapshot id");
    uuid(snapshot.calculation_run_id, "snapshot calculation_run_id");
    if (snapshot.calculation_run_id !== run.id) fail(`snapshot references unexpected calculation run: ${snapshot.id}`);
    if (snapshot.difficulty !== "easy" && snapshot.difficulty !== "hard") fail(`invalid difficulty: ${snapshot.difficulty}`);
    if (snapshot.sample_size < 0 || snapshot.distinct_canonical_player_count < 0) fail(`invalid sample counts: ${snapshot.id}`);
    if (!["ready", "provisional", "needs_data", "needs_review"].includes(snapshot.rating_confidence)) fail(`invalid confidence: ${snapshot.id}`);
    if (snapshot.publication_status !== "UNPUBLISHED") fail(`snapshot is not UNPUBLISHED: ${snapshot.id}`);
    if (snapshot.effective_from !== null) fail(`snapshot has an effective date: ${snapshot.id}`);
    if (!(snapshot.slope > 0.01)) fail(`snapshot slope is not positive: ${snapshot.id}`);
    if (snapshotIds.has(snapshot.id)) fail(`duplicate snapshot id: ${snapshot.id}`);
    snapshotIds.add(snapshot.id);
    if (!["KWT_ONLY", "WEEKLY_ONLY", "KWT_PLUS_WEEKLY"].includes(snapshot.review_scope)) {
      fail(`invalid review scope: ${snapshot.review_scope}`);
    }
    const snapshotKey = [snapshot.calculation_run_id, snapshot.course_id, snapshot.difficulty, snapshot.model_version, snapshot.review_scope].join("|");
    snapshotKeys.set(snapshotKey, [...(snapshotKeys.get(snapshotKey) ?? []), snapshot.id]);
    for (const ref of snapshot.source_evidence_refs) {
      if (referenced.has(ref)) continue;
      referenced.add(ref);
      if (!fingerprints.has(ref)) fail(`snapshot references missing provenance: ${ref}`);
    }
  }
  if (kwt !== 13550 || weekly !== 844) fail(`unexpected source split KWT=${kwt}, THE_WEEKLY=${weekly}`);
  if (referenced.size !== 14394) fail(`expected 14394 referenced fingerprints, found ${referenced.size}`);
  if (snapshots.filter((s) => s.rating_confidence === "ready").length !== 158) fail("expected 158 ready/statistically eligible snapshots");
  if (snapshots.filter((s) => s.rating_confidence === "provisional").length !== 11) fail("expected 11 provisional snapshots");

  const uniqueKeyCollisions = [...snapshotKeys.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids }));
  const legacySnapshotKeys = new Set(snapshots.map((snapshot) => [snapshot.calculation_run_id, snapshot.course_id, snapshot.difficulty, snapshot.model_version].join("|")));
  return { rows, snapshots, run, canonicalIds, fingerprints, uniqueKeyCollisions, legacySnapshotKeyCount: legacySnapshotKeys.size };
}

function runCommand(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${path.basename(file)} failed with ${result.status}: ${details}`);
  }
  return result.stdout ?? "";
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function writeImportFiles(pkg) {
  fs.mkdirSync(generatedDir, { recursive: true });
  const playerIds = [...pkg.canonicalIds].sort();
  fs.writeFileSync(path.join(generatedDir, "players.csv"), `id\n${playerIds.map(csvEscape).join("\n")}\n`);
  const snapshotHeader = ["id", "calculation_run_id", "course_id", "difficulty", "course_rating", "slope", "sample_size", "distinct_canonical_player_count", "rating_confidence", "model_version", "effective_from", "effective_period", "source_evidence_refs", "publication_status", "review_scope"];
  const snapshotLines = [snapshotHeader.join(",")];
  for (const s of pkg.snapshots) {
    snapshotLines.push(csvLine([
      s.id, s.calculation_run_id, s.course_id, s.difficulty, s.course_rating, s.slope,
      s.sample_size, s.distinct_canonical_player_count, s.rating_confidence, s.model_version,
      s.effective_from ?? "", s.effective_period, pgArray(s.source_evidence_refs), "UNPUBLISHED", s.review_scope,
    ]));
  }
  fs.writeFileSync(path.join(generatedDir, "snapshots.csv"), `${snapshotLines.join("\n")}\n`);
}

function schemaSql() {
  return `
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists public;
create schema if not exists handicap_private;
create table public.players (id uuid primary key);
create table public.handicap_calculation_runs (
  id uuid primary key,
  policy_version text not null,
  model_version text not null,
  source_package_ref text not null,
  chronology_policy text not null,
  status text not null check (status in ('DRAFT','COMPLETED','FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.handicap_source_provenance (
  id uuid primary key,
  source_fingerprint text not null unique,
  source_type text not null check (source_type in ('KWT','THE_WEEKLY')),
  source_ref text not null,
  source_date date,
  source_season integer,
  source_week integer,
  original_player_name text,
  canonical_player_id uuid references public.players(id),
  original_course_label text,
  original_course_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source_type <> 'THE_WEEKLY' or (canonical_player_id is null and metadata->>'personal_handicap_eligible' = 'false'))
);
create table public.handicap_rating_snapshots (
  id uuid primary key,
  calculation_run_id uuid not null references public.handicap_calculation_runs(id),
  course_id text not null,
  difficulty text not null check (difficulty in ('easy','hard')),
  course_rating numeric,
  slope numeric check (slope is null or slope > 0.01),
  sample_size integer not null check (sample_size >= 0),
  distinct_canonical_player_count integer not null check (distinct_canonical_player_count >= 0),
  rating_confidence text not null check (rating_confidence in ('ready','provisional','needs_data','needs_review')),
  model_version text not null,
  effective_from date,
  effective_period text,
  source_evidence_refs text[] not null default '{}',
  publication_status text not null check (publication_status in ('DRAFT','PROVISIONAL','UNPUBLISHED')),
  created_at timestamptz not null default now(),
  unique (calculation_run_id, course_id, difficulty, model_version)
);
create table public.handicap_index_snapshots (id uuid primary key, calculation_run_id uuid not null, canonical_player_id uuid not null, publication_status text not null);
create table public.handicap_review_evidence (id uuid primary key, subject_kind text not null, subject_key text not null, source_ref text not null, evidence_payload jsonb not null default '{}', unique(subject_kind, subject_key, source_ref));
create table public.handicap_review_decisions (id uuid primary key, evidence_id uuid, subject_kind text not null, subject_key text not null, decision text not null, rationale text not null, reviewer_id uuid, decision_sequence integer not null, unique(subject_kind, subject_key, decision_sequence));

create or replace function handicap_private.reject_history_mutation() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin raise exception 'Handicap history is append-only' using errcode = '55000'; end;
$$;
do $$
declare table_name text;
begin
  foreach table_name in array array['handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function handicap_private.reject_history_mutation()', 'handicap_' || table_name || '_append_only', table_name);
  end loop;
end $$;
alter table public.handicap_calculation_runs enable row level security;
alter table public.handicap_rating_snapshots enable row level security;
alter table public.handicap_index_snapshots enable row level security;
alter table public.handicap_review_evidence enable row level security;
alter table public.handicap_review_decisions enable row level security;
alter table public.handicap_source_provenance enable row level security;
revoke all on table public.handicap_calculation_runs, public.handicap_rating_snapshots, public.handicap_index_snapshots, public.handicap_review_evidence, public.handicap_review_decisions, public.handicap_source_provenance from public, anon, authenticated;
grant select, insert, update on public.handicap_calculation_runs to service_role;
grant select, insert on public.handicap_rating_snapshots, public.handicap_index_snapshots, public.handicap_review_evidence, public.handicap_review_decisions, public.handicap_source_provenance to service_role;
revoke update, delete, truncate on public.handicap_rating_snapshots, public.handicap_index_snapshots, public.handicap_review_evidence, public.handicap_review_decisions, public.handicap_source_provenance from service_role;
`;
}

function psqlArgs(sqlFile) {
  return ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", sqlFile];
}

function reviewScopeCorrectionSql() {
  return `
alter table public.handicap_rating_snapshots
  add column review_scope text;
alter table public.handicap_rating_snapshots
  add constraint handicap_rating_snapshots_review_scope_check
  check (review_scope is not null and review_scope in ('KWT_ONLY','WEEKLY_ONLY','KWT_PLUS_WEEKLY'))
  not valid;
alter table public.handicap_rating_snapshots
  drop constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key;
alter table public.handicap_rating_snapshots
  add constraint handicap_rating_snapshots_calculation_run_scope_key
  unique (calculation_run_id, course_id, difficulty, model_version, review_scope);
`;
}

function waitForReady(child, outputChunks) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000;
    let lastProbe = "";
    child.once("error", (error) => {
      reject(new Error(`postgres process error: ${error.message}\n${outputChunks.join("")}`));
    });
    const timer = setInterval(() => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`postgres exited before accepting connections (code ${child.exitCode})\n${outputChunks.join("")}`));
        return;
      }
      const probe = spawnSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-At", "-c", "select 1"], { encoding: "utf8", windowsHide: true, timeout: 1000 });
      lastProbe = [probe.stdout, probe.stderr, probe.error?.message].filter(Boolean).join("\n");
      if (probe.status === 0 && probe.stdout.trim() === "1") { clearInterval(timer); resolve(); return; }
      if (Date.now() > deadline) { clearInterval(timer); reject(new Error(`timed out waiting for local PostgreSQL\nserver=${outputChunks.join("")}probe=${lastProbe}`)); }
    }, 250);
  });
}

function writeSqlFiles(pkg) {
  const schemaPath = path.join(generatedDir, "schema.sql");
  const correctionPath = path.join(generatedDir, "review-scope-correction.sql");
  const importPath = path.join(generatedDir, "import.sql");
  const players = path.join(generatedDir, "players.csv").replaceAll("\\", "/").replaceAll("'", "''");
  const provenance = provenancePath.replaceAll("\\", "/").replaceAll("'", "''");
  const snapshots = path.join(generatedDir, "snapshots.csv").replaceAll("\\", "/").replaceAll("'", "''");
  fs.writeFileSync(schemaPath, schemaSql());
  fs.writeFileSync(correctionPath, reviewScopeCorrectionSql());
  const r = pkg.run;
  const importSql = `begin;
insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status)
values (${sqlLiteral(r.id)}, ${sqlLiteral(r.policyVersion)}, ${sqlLiteral(r.modelVersion)}, ${sqlLiteral(r.sourcePackageRef)}, ${sqlLiteral(r.chronologyPolicy)}, ${sqlLiteral(r.status)});
create temporary table players_import (id uuid primary key);
\\copy players_import (id) from '${players}' with (format csv, header true);
insert into public.players (id) select id from players_import;
\\copy public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, source_date, source_season, source_week, original_player_name, canonical_player_id, original_course_label, original_course_code, metadata) from '${provenance}' with (format csv, header true);
create temporary table snapshots_import (like public.handicap_rating_snapshots including defaults);
\\copy snapshots_import (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) from '${snapshots}' with (format csv, header true);
do $$
declare missing_count integer;
begin
  select count(*) into missing_count
  from snapshots_import s
  where exists (select 1 from unnest(s.source_evidence_refs) ref where not exists (select 1 from public.handicap_source_provenance p where p.source_fingerprint = ref));
  if missing_count <> 0 then raise exception 'snapshot provenance preflight failed: % rows have missing provenance', missing_count; end if;
end $$;
insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope)
select id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, 'UNPUBLISHED', review_scope
from snapshots_import;
commit;
`;
  fs.writeFileSync(importPath, importSql);
  return { schemaPath, importPath };
}

function query(sql) {
  const result = runCommand(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-At", "-F", "\t", "-c", sql]);
  return result.trim();
}

function assertQuery(sql, expected, label) {
  const actual = query(sql);
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function writeFailureSql(kind) {
  const file = path.join(generatedDir, `${kind}.sql`);
  if (kind === "missing-provenance") {
    fs.writeFileSync(file, `begin;\ncreate temporary table bad_snapshot (source_evidence_refs text[]);\ninsert into bad_snapshot values (array['MISSING|PROVENANCE']);\ndo $$ begin if exists (select 1 from bad_snapshot s where not exists (select 1 from public.handicap_source_provenance p where p.source_fingerprint = any(s.source_evidence_refs))) then raise exception 'missing provenance'; end if; end $$;\ncommit;\n`);
  } else if (kind === "duplicate-fingerprint") {
    fs.writeFileSync(file, `begin; insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, metadata) values ('00000000-0000-4000-8000-000000000001','SYNTH|DUP','KWT','synthetic','{}'); insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, metadata) values ('00000000-0000-4000-8000-000000000002','SYNTH|DUP','KWT','synthetic','{}'); commit;\n`);
  } else if (kind === "invalid-uuid") {
    fs.writeFileSync(file, `begin; insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, metadata) values ('not-a-uuid','SYNTH|INVALID','KWT','synthetic','{}'); commit;\n`);
  } else if (kind === "repeat-import") {
    fs.writeFileSync(file, `begin; insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status) values ('00000000-0000-4000-8000-000000000003', 'duplicate', 'duplicate', 'duplicate', 'duplicate', 'DRAFT'); insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status) values ('00000000-0000-4000-8000-000000000003', 'duplicate', 'duplicate', 'duplicate', 'duplicate', 'DRAFT'); commit;\n`);
  } else if (kind === "invalid-review-scope") {
    fs.writeFileSync(file, `begin; insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_period, publication_status, review_scope) select '00000000-0000-4000-8000-000000000004', calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_period, 'UNPUBLISHED', 'INVALID' from public.handicap_rating_snapshots limit 1; commit;\n`);
  } else if (kind === "missing-review-scope") {
    fs.writeFileSync(file, `begin; insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_period, publication_status, review_scope) select '00000000-0000-4000-8000-000000000005', calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_period, 'UNPUBLISHED', null from public.handicap_rating_snapshots limit 1; commit;\n`);
  } else if (kind === "snapshot-identity-conflict") {
    fs.writeFileSync(file, `begin; insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) select '00000000-0000-4000-8000-000000000006', calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, 'UNPUBLISHED', review_scope from public.handicap_rating_snapshots limit 1; commit;\n`);
  } else if (kind === "invalid-rating") {
    fs.writeFileSync(file, `begin; insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_period, publication_status, review_scope) select '00000000-0000-4000-8000-000000000007', calculation_run_id, course_id, difficulty, course_rating, 0.01, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_period, 'UNPUBLISHED', review_scope from public.handicap_rating_snapshots limit 1; commit;\n`);
  } else if (kind === "append-only-update") {
    fs.writeFileSync(file, `begin; create temporary table append_test (id integer primary key, value text); create trigger append_test_guard before update or delete on append_test for each row execute function handicap_private.reject_history_mutation(); insert into append_test values (1,'before'); update append_test set value='after' where id=1; commit;\n`);
  } else if (kind === "append-only-delete") {
    fs.writeFileSync(file, `begin; create temporary table append_test (id integer primary key, value text); create trigger append_test_guard before update or delete on append_test for each row execute function handicap_private.reject_history_mutation(); insert into append_test values (1,'before'); delete from append_test where id=1; commit;\n`);
  }
  return file;
}

async function main() {
  const pkg = loadPackage();
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  writeImportFiles({ ...pkg, run: pkg.run });
  const sqlFiles = writeSqlFiles({ ...pkg, run: pkg.run });
  let child;
  try {
    runCommand(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 });
    const outputChunks = [];
    child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout.on("data", (chunk) => outputChunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => outputChunks.push(String(chunk)));
    await waitForReady(child, outputChunks);
    runCommand(psql, psqlArgs(sqlFiles.schemaPath), { timeout: 60000 });
    const correctionPath = path.join(root, "supabase", "proposals", "20261019_handicap_rating_snapshot_review_scope.proposed.sql");
    runCommand(psql, psqlArgs(correctionPath), { timeout: 60000 });
    const failureResults = [];
    for (const kind of ["missing-provenance", "duplicate-fingerprint", "invalid-uuid", "repeat-import", "append-only-update", "append-only-delete"]) {
      const file = writeFailureSql(kind);
      const result = spawnSync(psql, psqlArgs(file), { encoding: "utf8", windowsHide: true });
      if (result.status === 0) fail(`${kind} failure test unexpectedly committed`);
      failureResults.push(`${kind}: rejected`);
    }
    assertQuery("select count(*) from public.handicap_calculation_runs", "0", "negative tests left calculation runs");
    assertQuery("select count(*) from public.handicap_source_provenance", "0", "negative tests left provenance");
    assertQuery("select count(*) from public.handicap_rating_snapshots", "0", "negative tests left snapshots");
    assertQuery("select count(*) from pg_class where relname in ('handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and relrowsecurity", "6", "RLS table count before import");
    assertQuery("select has_table_privilege('anon','public.handicap_rating_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_source_provenance','select')::int::text", "00", "client direct grants before import");
    runCommand(psql, psqlArgs(sqlFiles.importPath), { timeout: 180000 });
    assertQuery("select count(*) from public.handicap_calculation_runs", "1", "calculation run count");
    assertQuery("select count(*) from public.handicap_source_provenance", "14394", "provenance count");
    assertQuery("select count(*) from public.handicap_rating_snapshots", "169", "rating snapshot count");
    assertQuery("select count(*) from (select calculation_run_id, course_id, difficulty, model_version, review_scope from public.handicap_rating_snapshots group by calculation_run_id, course_id, difficulty, model_version, review_scope) keys", "169", "scope-aware uniqueness");
    assertQuery("select count(*) from public.handicap_rating_snapshots where review_scope is null", "0", "missing review scopes");
    assertQuery("select count(*) from public.handicap_rating_snapshots where review_scope not in ('KWT_ONLY','WEEKLY_ONLY','KWT_PLUS_WEEKLY')", "0", "invalid review scopes");
    assertQuery("select count(*) from public.handicap_rating_snapshots where review_scope='KWT_ONLY'", "78", "KWT-only scopes");
    assertQuery("select count(*) from public.handicap_rating_snapshots where review_scope='WEEKLY_ONLY'", "10", "Weekly-only scopes");
    assertQuery("select count(*) from public.handicap_rating_snapshots where review_scope='KWT_PLUS_WEEKLY'", "81", "combined scopes");
    assertQuery("select count(*) from public.handicap_index_snapshots", "0", "index snapshot count");
    assertQuery("select count(*) from public.handicap_rating_snapshots where publication_status <> 'UNPUBLISHED'", "0", "publication status");
    assertQuery("select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY' and canonical_player_id is not null", "0", "Weekly canonical identity separation");
    assertQuery("select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY' and (metadata->>'personal_handicap_eligible') <> 'false'", "0", "Weekly personal eligibility separation");
    assertQuery("select count(*) from public.handicap_rating_snapshots where rating_confidence='ready'", "158", "ready snapshot count");
    assertQuery("select count(*) from public.handicap_rating_snapshots where rating_confidence='provisional'", "11", "provisional snapshot count");
    assertQuery("select count(*) from public.handicap_rating_snapshots where effective_from is not null", "0", "effective date count");
    assertQuery("select count(*) from public.handicap_source_provenance p where not exists (select 1 from public.handicap_rating_snapshots s where p.source_fingerprint = any(s.source_evidence_refs))", "0", "orphan provenance count");
    assertQuery("select count(*) from pg_trigger where tgname like 'handicap_%_append_only' and not tgisinternal", "5", "append-only trigger count");
    assertQuery("select count(*) from pg_class where relname in ('handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and relrowsecurity", "6", "RLS table count");
    assertQuery("select has_table_privilege('anon','public.handicap_rating_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_source_provenance','select')::int::text", "00", "client direct grants");
    assertQuery("select has_table_privilege('service_role','public.handicap_rating_snapshots','insert')::int::text || has_table_privilege('service_role','public.handicap_source_provenance','insert')::int::text", "11", "service role insert grants");

    for (const kind of ["missing-provenance", "duplicate-fingerprint", "invalid-uuid", "repeat-import", "invalid-review-scope", "missing-review-scope", "snapshot-identity-conflict", "invalid-rating"]) {
      const file = writeFailureSql(kind);
      const result = spawnSync(psql, psqlArgs(file), { encoding: "utf8", windowsHide: true });
      if (result.status === 0) fail(`${kind} failure test unexpectedly committed`);
      failureResults.push(`${kind}: rejected`);
    }
    assertQuery("select count(*) from public.handicap_source_provenance", "14394", "provenance count after failed transactions");
    assertQuery("select count(*) from public.handicap_rating_snapshots", "169", "snapshot count after failed transactions");
    const mutationFile = path.join(generatedDir, "append-only.sql");
    fs.writeFileSync(mutationFile, "update public.handicap_rating_snapshots set course_id='MUTATION' where id=(select id from public.handicap_rating_snapshots limit 1); delete from public.handicap_source_provenance where id=(select id from public.handicap_source_provenance limit 1);\n");
    const mutation = spawnSync(psql, psqlArgs(mutationFile), { encoding: "utf8", windowsHide: true });
    if (mutation.status === 0) fail("append-only mutation test unexpectedly succeeded");

    console.log(JSON.stringify({
      package: { provenance: pkg.rows.length, snapshots: pkg.snapshots.length, kwt: 13550, weekly: 844, referenced: pkg.fingerprints.size, legacyUniqueKeys: pkg.legacySnapshotKeyCount, scopeAwareUniqueKeys: pkg.snapshots.length },
      imported: { calculationRuns: 1, provenance: 14394, ratingSnapshots: 169, indexSnapshots: 0 },
      reviewScopes: { KWT_ONLY: 78, WEEKLY_ONLY: 10, KWT_PLUS_WEEKLY: 81 },
      classifications: { ready: 158, provisional: 11, effectiveDates: 0 },
      failureTests: [...failureResults, "append-only mutations: rejected"],
      security: { rlsTables: 6, clientDirectSelect: false, serviceRoleInsert: true },
    }, null, 2));
  } finally {
    if (child && child.exitCode === null) child.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
