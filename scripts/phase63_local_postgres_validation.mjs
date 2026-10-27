import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const pgBin = process.argv[2]
if (!pgBin) throw new Error("usage: node scripts/phase63_local_postgres_validation.mjs <postgres-bin-directory>")

const tempRoot = path.join(process.cwd(), ".phase63-local")
fs.mkdirSync(tempRoot, { recursive: true })
const dataDir = fs.mkdtempSync(path.join(tempRoot, "pg-"))
const port = "55463"
const env = { ...process.env, PGCLIENTENCODING: "UTF8" }
const run = (binary, args, options = {}) => execFileSync(path.join(pgBin, binary), args, { cwd: process.cwd(), env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options })
const psql = (sql, expectFailure = false) => {
  try {
    const output = run("psql.exe", ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", "-c", sql])
    if (expectFailure) throw new Error("expected SQL failure but command succeeded")
    return output
  } catch (error) {
    if (expectFailure) return String(error.stderr ?? error.message)
    throw error
  }
}

const schemaSql = `
create role anon noinherit;
create role authenticated noinherit;
create role service_role noinherit;
create table public.players (id uuid primary key);
create table public.handicap_calculation_runs (id uuid primary key, status text not null check (status in ('DRAFT','COMPLETED','FAILED')));
create table public.handicap_source_provenance (
  id uuid primary key,
  source_fingerprint text not null unique,
  source_type text not null check (source_type in ('KWT','THE_WEEKLY')),
  source_ref text not null,
  canonical_player_id uuid references public.players(id),
  metadata jsonb not null default '{}'::jsonb
);
create table public.handicap_rating_snapshots (
  id uuid primary key,
  calculation_run_id uuid not null references public.handicap_calculation_runs(id),
  course_id text not null,
  difficulty text not null check (difficulty in ('easy','hard')),
  source_evidence_refs text[] not null,
  publication_status text not null check (publication_status in ('DRAFT','PROVISIONAL','UNPUBLISHED')),
  unique (calculation_run_id, course_id, difficulty)
);
create or replace function public.reject_handicap_mutation() returns trigger language plpgsql as $$
begin raise exception 'append-only'; end;
$$;
create trigger source_append_only before update or delete on public.handicap_source_provenance for each row execute function public.reject_handicap_mutation();
create trigger snapshot_append_only before update or delete on public.handicap_rating_snapshots for each row execute function public.reject_handicap_mutation();
alter table public.handicap_source_provenance enable row level security;
alter table public.handicap_rating_snapshots enable row level security;
revoke all on table public.handicap_source_provenance, public.handicap_rating_snapshots from public, anon, authenticated;
grant select, insert on table public.handicap_source_provenance, public.handicap_rating_snapshots to service_role;
insert into public.players values ('00000000-0000-4000-8000-000000000001');
`

const runSql = `
begin;
insert into public.handicap_calculation_runs values ('00000000-0000-5000-8000-000000000001','DRAFT');
insert into public.handicap_source_provenance (id,source_fingerprint,source_type,source_ref,canonical_player_id,metadata)
values ('00000000-0000-5000-8000-000000000002','KWT|KWT14W01|1|TTE|1','KWT','normalized/KWT14W01.csv#row=2','00000000-0000-4000-8000-000000000001','{"course_id":"Tourist Trap_easy","difficulty":"easy"}');
insert into public.handicap_rating_snapshots (id,calculation_run_id,course_id,difficulty,source_evidence_refs,publication_status)
values ('00000000-0000-5000-8000-000000000003','00000000-0000-5000-8000-000000000001','Tourist Trap_easy','easy',array['KWT|KWT14W01|1|TTE|1'],'UNPUBLISHED');
commit;
`

let result = { schema: false, transaction: false, duplicateProtection: false, invalidSourceType: false, appendOnly: false, rls: false, grants: false, rollback: false, idempotency: false }
try {
  run("initdb.exe", ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"])
  run("pg_ctl.exe", ["-D", dataDir, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"])
  psql(schemaSql)
  result.schema = true
  psql(runSql)
  result.transaction = true

  const counts = psql("select (select count(*) from public.handicap_calculation_runs) as runs, (select count(*) from public.handicap_source_provenance) as provenance, (select count(*) from public.handicap_rating_snapshots) as snapshots;")
  if (!counts.includes("1 |          1 |         1")) throw new Error(`unexpected post-transaction counts: ${counts}`)

  psql("begin; insert into public.handicap_source_provenance values ('00000000-0000-5000-8000-000000000004','KWT|KWT14W01|1|TTE|1','KWT','duplicate',null,'{}'); commit;", true)
  result.duplicateProtection = true
  psql("insert into public.handicap_source_provenance values ('00000000-0000-5000-8000-000000000005','bad','UNKNOWN','bad',null,'{}');", true)
  result.invalidSourceType = true
  psql("update public.handicap_source_provenance set source_ref='changed' where source_fingerprint='KWT|KWT14W01|1|TTE|1';", true)
  result.appendOnly = true
  const security = psql("select relrowsecurity::text as rls from pg_class where oid='public.handicap_source_provenance'::regclass; select has_table_privilege('anon','public.handicap_source_provenance','select')::text as anon_select, has_table_privilege('authenticated','public.handicap_source_provenance','select')::text as auth_select, has_table_privilege('service_role','public.handicap_source_provenance','insert')::text as service_insert;")
  result.rls = security.includes("t")
  result.grants = security.includes("f | f | t")
  psql("begin; insert into public.handicap_rating_snapshots values ('00000000-0000-5000-8000-000000000006','00000000-0000-5000-8000-000000000001','Tourist Trap_easy','easy',array['missing-fingerprint'],'UNPUBLISHED'); rollback;")
  result.rollback = true
  psql("insert into public.handicap_source_provenance values ('00000000-0000-5000-8000-000000000007','KWT|KWT14W01|1|TTE|1','KWT','duplicate-again',null,'{}');", true)
  result.idempotency = true
  console.log(JSON.stringify(result, null, 2))
} finally {
  try { run("pg_ctl.exe", ["-D", dataDir, "-w", "stop", "-m", "fast"]) } catch {}
  fs.rmSync(dataDir, { recursive: true, force: true })
}
