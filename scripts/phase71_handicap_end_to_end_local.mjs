import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const psql = path.join(runtimeBin, "psql.exe")
const workDir = path.join(root, `.phase71-local-e2e-${Date.now()}`)
const dataDir = path.join(workDir, "data")
const port = 55471
const playerId = "11111111-1111-4111-8111-111111111111"
const invalidRun = "00000000-0000-4000-8000-000000000071"
const approvedRun = "00000000-0000-4000-8000-000000000072"
const ratingId = "00000000-0000-4000-8000-000000000073"
const indexId = "00000000-0000-4000-8000-000000000074"

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed\n${result.stdout}\n${result.stderr}`)
  return result.stdout ?? ""
}
function query(sql) {
  return run(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql]).trim()
}
function waitForReady(child, logs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000
    const timer = setInterval(() => {
      if (child.exitCode !== null) { clearInterval(timer); reject(new Error(`postgres exited: ${logs.join("")}`)); return }
      const probe = spawnSync(psql, ["-X", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-At", "-c", "select 1"], { encoding: "utf8", windowsHide: true })
      if (probe.status === 0 && probe.stdout.trim() === "1") { clearInterval(timer); resolve(); return }
      if (Date.now() > deadline) { clearInterval(timer); reject(new Error(`postgres readiness timeout: ${logs.join("")}`)) }
    }, 250)
  })
}

const schema = `
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.players (id uuid primary key);
create table public.handicap_calculation_runs (id uuid primary key, status text not null, quarantined boolean not null default false, superseded_by_run_id uuid);
create table public.handicap_source_provenance (id uuid primary key, source_fingerprint text not null unique, source_type text not null, source_ref text not null, canonical_player_id uuid references public.players(id), original_player_name text, personal_handicap_eligible boolean, metadata jsonb not null default '{}');
create table public.handicap_rating_snapshots (id uuid primary key, calculation_run_id uuid references public.handicap_calculation_runs(id), course_id text not null, difficulty text not null, course_rating numeric, slope numeric, publication_status text not null, effective_from date, source_evidence_refs text[] not null default '{}');
create table public.handicap_index_snapshots (id uuid primary key, calculation_run_id uuid references public.handicap_calculation_runs(id), canonical_player_id uuid references public.players(id), resulting_index numeric, publication_status text not null, chronology_confidence text not null);
create table public.handicap_review_evidence (id uuid primary key, subject_key text not null, evidence_payload jsonb not null default '{}');
create table public.handicap_review_decisions (id uuid primary key, evidence_id uuid references public.handicap_review_evidence(id), subject_key text not null, decision text not null, rationale text not null);
create schema handicap_private;
create or replace function handicap_private.reject_history_mutation() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin raise exception 'Handicap history is append-only'; end; $$;
create trigger rating_append_only before update or delete on public.handicap_rating_snapshots for each row execute function handicap_private.reject_history_mutation();
create trigger index_append_only before update or delete on public.handicap_index_snapshots for each row execute function handicap_private.reject_history_mutation();
do $$ declare t text; begin foreach t in array array['handicap_calculation_runs','handicap_source_provenance','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions'] loop execute format('alter table public.%I enable row level security', t); execute format('revoke all on public.%I from public, anon, authenticated', t); end loop; end $$;
grant select, insert, update on public.handicap_calculation_runs to service_role;
grant select, insert on public.handicap_source_provenance, public.handicap_rating_snapshots, public.handicap_index_snapshots, public.handicap_review_evidence, public.handicap_review_decisions to service_role;
revoke update, delete, truncate on public.handicap_source_provenance, public.handicap_rating_snapshots, public.handicap_index_snapshots, public.handicap_review_evidence, public.handicap_review_decisions from service_role;
insert into public.players(id) values ('${playerId}');
`

const invalidAndQuarantine = `
begin;
insert into public.handicap_calculation_runs(id,status,quarantined) values ('${invalidRun}','COMPLETED',true);
insert into public.handicap_source_provenance(id,source_fingerprint,source_type,source_ref,original_player_name,personal_handicap_eligible,metadata) values ('00000000-0000-4000-8000-000000000075','KWT|%||%','KWT','phase67-invalid','Player',true,'{}');
insert into public.handicap_rating_snapshots(id,calculation_run_id,course_id,difficulty,course_rating,slope,publication_status,source_evidence_refs) values ('00000000-0000-4000-8000-000000000076','${invalidRun}','BHE','easy',-20,8,'UNPUBLISHED',array['KWT|%||%']);
insert into public.handicap_review_evidence(id,subject_key,evidence_payload) values ('00000000-0000-4000-8000-000000000077','${invalidRun}','{"reason":"invalid Phase 67 KWT identity metadata"}');
insert into public.handicap_review_decisions(id,evidence_id,subject_key,decision,rationale) values ('00000000-0000-4000-8000-000000000078','00000000-0000-4000-8000-000000000077','${invalidRun}','QUARANTINE','Invalid provenance remains audit-only.');
commit;
`

const approvedFlow = `
begin;
insert into public.handicap_calculation_runs(id,status,quarantined) values ('${approvedRun}','COMPLETED',false);
insert into public.handicap_source_provenance(id,source_fingerprint,source_type,source_ref,canonical_player_id,original_player_name,personal_handicap_eligible,metadata) values ('00000000-0000-4000-8000-000000000079','KWT|event|101|BHE|1','KWT','event#1','${playerId}','Player',true,'{"source_player_id":"101"}');
insert into public.handicap_source_provenance(id,source_fingerprint,source_type,source_ref,original_player_name,personal_handicap_eligible,metadata) values ('00000000-0000-4000-8000-000000000080','THE_WEEKLY|event|External|BHE|1','THE_WEEKLY','weekly#1','External',false,'{"personal_handicap_eligible":false}');
insert into public.handicap_rating_snapshots(id,calculation_run_id,course_id,difficulty,course_rating,slope,publication_status,effective_from,source_evidence_refs) values ('${ratingId}','${approvedRun}','BHE','easy',-20,8,'PUBLISHED','2026-10-20',array['KWT|event|101|BHE|1']);
commit;
begin;
insert into public.handicap_index_snapshots(id,calculation_run_id,canonical_player_id,resulting_index,publication_status,chronology_confidence) values ('${indexId}','${approvedRun}','${playerId}',2.4,'PUBLISHED','EXACT');
commit;
`

let child
async function main() {
  fs.mkdirSync(workDir, { recursive: true })
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  const logs = []
  child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  child.stdout.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr.on("data", (chunk) => logs.push(String(chunk)))
  await waitForReady(child, logs)
  run(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", schema])
  run(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", invalidAndQuarantine])
  run(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", approvedFlow])
  if (query("select count(*) from public.handicap_review_decisions where decision='QUARANTINE'") !== "1") throw new Error("quarantine decision missing")
  if (query("select count(*) from public.handicap_source_provenance where source_type='THE_WEEKLY' and (canonical_player_id is not null or personal_handicap_eligible is distinct from false)") !== "0") throw new Error("Weekly crossed personal boundary")
  if (query("select count(*) from public.handicap_index_snapshots where publication_status='PUBLISHED' and chronology_confidence='EXACT'") !== "1") throw new Error("approved index missing")
  if (query("select has_table_privilege('anon','public.handicap_index_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_source_provenance','select')::int::text") !== "00") throw new Error("client table access was granted")
  const mutation = spawnSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", `update public.handicap_index_snapshots set resulting_index=9 where id='${indexId}'`], { encoding: "utf8", windowsHide: true })
  if (mutation.status === 0) throw new Error("append-only index mutation unexpectedly succeeded")
  const duplicate = spawnSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-c", "begin; insert into public.handicap_source_provenance(id,source_fingerprint,source_type,source_ref) values ('00000000-0000-4000-8000-000000000081','KWT|event|101|BHE|1','KWT','duplicate'); commit;"], { encoding: "utf8", windowsHide: true })
  if (duplicate.status === 0) throw new Error("duplicate provenance unexpectedly succeeded")
  if (query("select count(*) from public.handicap_source_provenance") !== "3") throw new Error("duplicate transaction left partial data")
  console.log(JSON.stringify({ invalidBatchQuarantined: true, correctedRun: approvedRun, publishedIndexSimulation: 1, weeklyPersonalRows: 0, appendOnlyMutationRejected: true, duplicateFingerprintRolledBack: true, clientDirectSelect: false }, null, 2))
}

main().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1 }).finally(async () => {
  if (child && child.exitCode === null) child.kill()
  await new Promise((resolve) => setTimeout(resolve, 300))
  fs.rmSync(workDir, { recursive: true, force: true })
})
