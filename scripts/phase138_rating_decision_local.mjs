import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"

const root = process.cwd()
const runtimeBin = process.env.KRYS_PG_RUNTIME ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const psql = path.join(runtimeBin, "psql.exe")
const port = Number(process.env.KRYS_PG_PORT ?? "55438")
const packageDir = path.join(root, "docs", "handicap", "phase138")
const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "rating_owner_decision_manifest.json"), "utf8"))
const rows = manifest.rows
const successorRun = "8f136000-0000-5000-8000-000000000136"
const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "krys-phase138-"))
const dataDir = path.join(temporaryDir, "pgdata")
const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`)
  return result.stdout ?? ""
}
const psqlArgs = extra => ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra]
const query = sql => run(psql, psqlArgs(["-At", "-c", sql])).trim()
const execFile = file => run(psql, psqlArgs(["-f", file]))
const id = value => crypto.createHash("md5").update(value).digest("hex")
const uuid = value => `${id(value).slice(0, 8)}-${id(value).slice(8, 12)}-4${id(value).slice(13, 16)}-8${id(value).slice(17, 20)}-${id(value).slice(20, 32)}`
const q = value => `'${String(value).replaceAll("'", "''")}'`
const sqlNumber = value => Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")

function fixtureSql() {
  const targetRows = rows.map((row, index) => {
    const runId = row.target_kind === "PHASE136_SUCCESSOR" ? successorRun : uuid(`run-existing-${index % 4}`)
    const ref = `phase138-fixture-source:${row.target_snapshot_id}`
    return { ...row, runId, ref }
  })
  const runValues = [successorRun, ...[0, 1, 2, 3].map(index => uuid(`run-existing-${index}`))].map((runId, index) => `(${q(runId)}::uuid, 'policy', 'model', 'fixture-${index}', 'OFFICIAL_KWT_SEQUENCE', 'DRAFT', 'QUARANTINED')`).join(",\n")
  const targetValues = targetRows.map(row => `(${q(row.target_snapshot_id)}::uuid, ${q(row.runId)}::uuid, ${q(row.course_id)}, ${q(row.difficulty)}, ${sqlNumber(row.course_rating)}, ${sqlNumber(row.slope)}, ${Number(row.sample_size)}, ${Number(row.distinct_players)}, 'ready', ${q(row.model_version)}, null, ${q("KWT fixture period")}, ARRAY[${q(row.ref)}]::text[], 'UNPUBLISHED', ${q(row.review_scope)})`).join(",\n")
  const provenanceValues = targetRows.map(row => `(${q(uuid(`prov-${row.ref}`))}::uuid, ${q(row.ref)}, 'KWT', ${q(row.ref)}, ${q(row.course_id)}, ${q(row.difficulty)})`).join(",\n")
  return `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists handicap_private;
create table public.handicap_calculation_runs (id uuid primary key, policy_version text not null, model_version text not null, source_package_ref text not null, chronology_policy text not null, status text not null, publication_eligibility text not null, metadata jsonb not null default '{}');
create table public.handicap_source_provenance (id uuid primary key, source_fingerprint text not null unique, source_type text not null, source_ref text not null, original_course_label text, original_course_code text, metadata jsonb not null default '{}');
create table public.handicap_rating_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id), course_id text not null, difficulty text not null, course_rating numeric, slope numeric, sample_size integer not null, distinct_canonical_player_count integer not null, rating_confidence text not null, model_version text not null, effective_from date, effective_period text, source_evidence_refs text[] not null, publication_status text not null, review_scope text not null);
create table public.handicap_index_snapshots (id uuid primary key, calculation_run_id uuid not null, canonical_player_id uuid not null, publication_status text not null);
create table public.handicap_review_evidence (id uuid primary key, subject_kind text not null, subject_key text not null, source_ref text not null, evidence_payload jsonb not null default '{}', unique(subject_kind, subject_key, source_ref));
create table public.handicap_review_decisions (id uuid primary key, evidence_id uuid references public.handicap_review_evidence(id), subject_kind text not null, subject_key text not null, decision text not null, rationale text not null, reviewer_id uuid, decision_sequence integer not null, unique(subject_kind, subject_key, decision_sequence));
create or replace function handicap_private.reject_history_mutation() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin raise exception 'Handicap history is append-only'; end $$;
do $$ declare t text; begin foreach t in array array['handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance'] loop execute format('create trigger %I before update or delete on public.%I for each row execute function handicap_private.reject_history_mutation()', t||'_append_only', t); end loop; end $$;
alter table public.handicap_calculation_runs enable row level security;
alter table public.handicap_source_provenance enable row level security;
alter table public.handicap_rating_snapshots enable row level security;
alter table public.handicap_index_snapshots enable row level security;
alter table public.handicap_review_evidence enable row level security;
alter table public.handicap_review_decisions enable row level security;
revoke all on public.handicap_calculation_runs, public.handicap_source_provenance, public.handicap_rating_snapshots, public.handicap_index_snapshots, public.handicap_review_evidence, public.handicap_review_decisions from public, anon, authenticated;
grant select, insert on public.handicap_review_evidence, public.handicap_review_decisions to service_role;
create or replace view public.handicap_publishable_rating_snapshots as select * from public.handicap_rating_snapshots where false;
create or replace view public.handicap_publishable_index_snapshots as select * from public.handicap_index_snapshots where false;
insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility) values
${runValues};
insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, original_course_label, original_course_code) values
${provenanceValues};
insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref)
select md5('filler-'||g::text)::uuid, 'fixture-fingerprint-'||g::text, 'KWT', 'fixture-filler-'||g::text from generate_series(1, 28599) g;
insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) values
${targetValues};
insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, source_evidence_refs, publication_status, review_scope)
select md5('rating-filler-'||g::text)::uuid, ${q(uuid('run-existing-0'))}::uuid, 'Fixture '||g::text, 'easy', 0, 8.515, 50, 20, 'ready', 'krys-course-rating-elite-lowest-12-v1', ARRAY['fixture-fingerprint-'||g::text], 'UNPUBLISHED', 'KWT_ONLY' from generate_series(1, 354) g;
insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, publication_status)
select md5('index-'||g::text)::uuid, ${q(uuid('run-existing-0'))}::uuid, md5('player-'||g::text)::uuid, 'UNPUBLISHED' from generate_series(1,157) g;
insert into public.handicap_review_evidence (id, subject_kind, subject_key, source_ref, evidence_payload) values (${q(uuid('existing-evidence'))}::uuid, 'SOURCE_RECORD', 'existing', 'fixture-existing', '{}');
insert into public.handicap_review_decisions (id, evidence_id, subject_kind, subject_key, decision, rationale, reviewer_id, decision_sequence) values (${q(uuid('existing-decision'))}::uuid, ${q(uuid('existing-evidence'))}::uuid, 'SOURCE_RECORD', 'existing', 'QUARANTINE', 'fixture baseline', null, 1);
`
}

async function main() {
  for (const executable of [initdb, postgres, psql]) if (!fs.existsSync(executable)) throw new Error(`Missing PostgreSQL executable: ${executable}`)
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"])
  const logs = []
  const child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  child.stdout.on("data", chunk => logs.push(String(chunk)))
  child.stderr.on("data", chunk => logs.push(String(chunk)))
  try {
    let ready = false
    for (let i = 0; i < 80; i++) {
      const probe = spawnSync(psql, psqlArgs(["-At", "-c", "select 1"]), { encoding: "utf8", windowsHide: true })
      if (probe.status === 0) { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!ready) throw new Error(`Disposable PostgreSQL did not start: ${logs.join("")}`)
    const fixture = path.join(temporaryDir, "fixture.sql")
    fs.writeFileSync(fixture, fixtureSql(), "utf8")
    execFile(fixture)
    execFile(path.join(packageDir, "production_rating_decision_preflight.sql"))
    execFile(path.join(packageDir, "production_rating_decision_installation.sql"))
    execFile(path.join(packageDir, "production_rating_decision_postflight.sql"))
    const beforeDuplicate = query("select count(*) from public.handicap_review_decisions")
    const duplicate = spawnSync(psql, psqlArgs(["-f", path.join(packageDir, "production_rating_decision_installation.sql")]), { encoding: "utf8", windowsHide: true })
    assert.notEqual(duplicate.status, 0, "repeat installation unexpectedly succeeded")
    assert.equal(query("select count(*) from public.handicap_review_decisions"), beforeDuplicate)
    const rollbackSql = path.join(temporaryDir, "rollback.sql")
    fs.writeFileSync(rollbackSql, `begin; insert into public.handicap_review_evidence(id,subject_kind,subject_key,source_ref) values (${q(uuid('rollback-evidence'))}::uuid,'SOURCE_RECORD','rollback','rollback'); do $$ begin raise exception 'intentional rollback'; end $$; commit;`, "utf8")
    const rollback = spawnSync(psql, psqlArgs(["-f", rollbackSql]), { encoding: "utf8", windowsHide: true })
    assert.notEqual(rollback.status, 0, "intentional rollback unexpectedly succeeded")
    assert.equal(query("select count(*) from public.handicap_review_evidence"), "74")
    const mutation = spawnSync(psql, psqlArgs(["-c", "update public.handicap_review_evidence set source_ref='MUTATION' where subject_key='existing';"]), { encoding: "utf8", windowsHide: true })
    assert.notEqual(mutation.status, 0, "append-only mutation unexpectedly succeeded")
    assert.equal(query("select count(*) from public.handicap_review_evidence where source_ref='MUTATION'"), "0")
    console.log(JSON.stringify({ runtime: "PostgreSQL 17.11", port, preflight: "PASS", installation: "PASS", postflight: "PASS", importedEvidence: 73, importedDecisions: 73, exactTargets: 73, duplicateInstallRejected: true, atomicRollback: true, appendOnlyMutationRejected: true, publishableRatings: query("select count(*) from public.handicap_publishable_rating_snapshots"), publishableIndexes: query("select count(*) from public.handicap_publishable_index_snapshots") }, null, 2))
  } finally {
    child.kill()
    await new Promise(resolve => setTimeout(resolve, 400))
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1 }).finally(() => { fs.rmSync(temporaryDir, { recursive: true, force: true }) })
