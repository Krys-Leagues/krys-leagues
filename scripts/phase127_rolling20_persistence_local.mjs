import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"

const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const postgres = path.join(runtimeBin, "postgres.exe")
const initdb = path.join(runtimeBin, "initdb.exe")
const pgCtl = path.join(runtimeBin, "pg_ctl.exe")
const psql = path.join(runtimeBin, "psql.exe")
const host = "127.0.0.1"
const port = process.env.PHASE127_PG_PORT ?? "55447"
const root = process.cwd()
const proposal = path.join(root, "supabase", "proposals", "20261022_handicap_rolling20_persistence.proposed.sql")
const rpcProposal = path.join(root, "supabase", "proposals", "20261022_handicap_rolling20_player_read_rpc.proposed.sql")

for (const executable of [postgres, initdb, pgCtl, psql]) {
  if (!fs.existsSync(executable)) throw new Error(`PostgreSQL runtime missing: ${executable}`)
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase127-pg-"))
let server

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`)
  }
  return result.stdout ?? ""
}

function psqlArgs(extra) {
  return ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port, "-U", "postgres", "-d", "postgres", ...extra]
}

function query(sql) {
  return run(psql, psqlArgs(["-At", "-c", sql])).trim()
}

function sqlFile(name, sql) {
  const filename = path.join(dataDir, name)
  fs.writeFileSync(filename, `${sql.trim()}\n`, "utf8")
  return filename
}

function expectFailure(name, sql) {
  const file = sqlFile(`${name}.sql`, sql)
  const result = spawnSync(psql, psqlArgs(["-f", file]), { encoding: "utf8", windowsHide: true })
  if (result.status === 0) throw new Error(`${name} unexpectedly succeeded`)
  return `${result.stdout ?? ""}${result.stderr ?? ""}`
}

async function waitForReady() {
  const logs = []
  server = spawn(postgres, ["-D", dataDir, "-p", port, "-F"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  server.stdout.on("data", (chunk) => logs.push(String(chunk)))
  server.stderr.on("data", (chunk) => logs.push(String(chunk)))
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`postgres exited before readiness\n${logs.join("")}`)
    const probe = spawnSync(psql, psqlArgs(["-At", "-c", "select 1"]), { encoding: "utf8", windowsHide: true })
    if (probe.status === 0 && probe.stdout.trim() === "1") return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`postgres readiness timeout\n${logs.join("")}`)
}

const setupSql = `
create extension if not exists pgcrypto;
create role anon;
create role authenticated;
create role service_role;
create table public.players (id uuid primary key, screen_name text not null);
create table public.handicap_calculation_runs (
  id uuid primary key,
  policy_version text not null,
  model_version text not null,
  source_package_ref text not null,
  chronology_policy text not null,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  publication_eligibility text not null default 'QUARANTINED'
);
create table public.handicap_source_provenance (
  id uuid primary key default gen_random_uuid(),
  source_fingerprint text not null unique,
  source_type text not null,
  source_ref text not null,
  original_player_name text,
  canonical_player_id uuid references public.players(id),
  metadata jsonb not null default '{}'::jsonb
);
create table public.handicap_index_snapshots (
  id uuid primary key,
  calculation_run_id uuid not null references public.handicap_calculation_runs(id),
  canonical_player_id uuid not null references public.players(id),
  source_round_ids text[] not null default '{}',
  rating_snapshot_ids uuid[] not null default '{}',
  rating_version_ids text[] not null default '{}',
  differential_model_version text not null,
  latest_ten_source_round_ids text[] not null default '{}',
  best_five_source_round_ids text[] not null default '{}',
  resulting_index numeric,
  chronology_confidence text not null check (chronology_confidence in ('EXACT', 'OFFICIAL_KWT_SEQUENCE', 'PERIOD_WINDOW', 'ORDERED_UNDATED', 'UNKNOWN', 'AMBIGUOUS')),
  publication_status text not null check (publication_status in ('DRAFT', 'PROVISIONAL', 'UNPUBLISHED', 'PUBLISHED')),
  created_at timestamptz not null default now(),
  unique (calculation_run_id, canonical_player_id, differential_model_version)
);
create schema handicap_private;
create function handicap_private.reject_history_mutation() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin raise exception 'Handicap history is append-only'; end;
$$;
create trigger handicap_handicap_index_snapshots_append_only
before update or delete on public.handicap_index_snapshots
for each row execute function handicap_private.reject_history_mutation();
alter table public.handicap_index_snapshots enable row level security;
revoke all on table public.handicap_index_snapshots from public, anon, authenticated;
revoke all on table public.handicap_calculation_runs from public, anon, authenticated;
revoke all on table public.handicap_source_provenance from public, anon, authenticated;
grant select on table public.handicap_index_snapshots to service_role;
create view public.handicap_publishable_index_snapshots with (security_invoker = true) as
select i.id, i.calculation_run_id, i.canonical_player_id, i.source_round_ids,
  i.rating_snapshot_ids, i.rating_version_ids, i.differential_model_version,
  i.latest_ten_source_round_ids, i.best_five_source_round_ids, i.resulting_index,
  i.chronology_confidence, i.publication_status, i.created_at
from public.handicap_index_snapshots i
join public.handicap_calculation_runs r on r.id = i.calculation_run_id
where r.status = 'COMPLETED' and r.publication_eligibility = 'ELIGIBLE'
  and i.publication_status = 'PUBLISHED'
  and i.chronology_confidence = 'EXACT'
  and i.resulting_index is not null
  and cardinality(i.latest_ten_source_round_ids) > 0
  and cardinality(i.best_five_source_round_ids) > 0;
revoke all on table public.handicap_publishable_index_snapshots from public, anon, authenticated;
grant select on table public.handicap_publishable_index_snapshots to service_role;
insert into public.players values ('11111111-1111-4111-8111-111111111111', 'Synthetic Player');
insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility)
values ('10000000-0000-5000-8000-000000000001', 'legacy', 'legacy-best-five-v1', 'legacy-fixture', 'EXACT_TIMESTAMP', 'DRAFT', 'QUARANTINED');
insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, latest_ten_source_round_ids, best_five_source_round_ids, differential_model_version, resulting_index, chronology_confidence, publication_status)
values ('20000000-0000-5000-8000-000000000001', '10000000-0000-5000-8000-000000000001', '11111111-1111-4111-8111-111111111111', ARRAY['KWT|legacy|1|BHE|old'], ARRAY['KWT|legacy|1|BHE|old'], ARRAY['KWT|legacy|1|BHE|old'], 'legacy-best-five-v1', 4.2, 'EXACT', 'UNPUBLISHED');
create function public.current_user_canonical_player_id() returns uuid
language sql stable security definer set search_path = public as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
`

const validDataSql = `
insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility, metadata)
values
  ('10000000-0000-5000-8000-000000000002', 'phase126', 'krys-handicap-candidate-a-v1', 'phase126-test', 'OFFICIAL_KWT_SEQUENCE', 'COMPLETED', 'ELIGIBLE', '{"allow_official_kwt_sequence_publication": true}'),
  ('10000000-0000-5000-8000-000000000003', 'phase126', 'krys-handicap-candidate-a-v1', 'phase126-test', 'OFFICIAL_KWT_SEQUENCE', 'COMPLETED', 'ELIGIBLE', '{"allow_official_kwt_sequence_publication": true}');
insert into public.handicap_source_provenance (source_fingerprint, source_type, source_ref, original_player_name, canonical_player_id, metadata)
select format('KWT|S14W%02s|synthetic|BHE|%s', n, n), 'KWT', format('phase127-test-%s', n), 'Synthetic Player', '11111111-1111-4111-8111-111111111111', jsonb_build_object('source_player_id', format('synthetic-%s', n))
from generate_series(1, 20) n;
insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, active_twenty_source_round_ids, active_round_count, handicap_status, effective_from, resulting_index, chronology_confidence, publication_status)
select '20000000-0000-5000-8000-000000000002', '10000000-0000-5000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
  array_agg(format('KWT|S14W%02s|synthetic|BHE|%s', n, n) order by n), '{}', ARRAY['krys-handicap-candidate-a-v1'],
  'krys-handicap-candidate-a-v1', array_agg(format('KWT|S14W%02s|synthetic|BHE|%s', n, n) order by n), 20, 'OFFICIAL_ELIGIBLE', date '2026-10-22', 4.25, 'OFFICIAL_KWT_SEQUENCE', 'PUBLISHED'
from generate_series(1, 20) n;
insert into public.handicap_source_provenance (source_fingerprint, source_type, source_ref, original_player_name, canonical_player_id, metadata)
values ('KWT|S14W01|synthetic|BHE|PROVISIONAL', 'KWT', 'phase127-test-provisional', 'Synthetic Player', '11111111-1111-4111-8111-111111111111', '{"source_player_id": "synthetic-provisional"}');
insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, rating_version_ids, differential_model_version, active_twenty_source_round_ids, active_round_count, handicap_status, effective_from, resulting_index, chronology_confidence, publication_status)
values ('20000000-0000-5000-8000-000000000003', '10000000-0000-5000-8000-000000000003', '11111111-1111-4111-8111-111111111111', ARRAY['KWT|S14W01|synthetic|BHE|PROVISIONAL'], ARRAY['krys-handicap-candidate-a-v1'], 'krys-handicap-candidate-a-v1', ARRAY['KWT|S14W01|synthetic|BHE|PROVISIONAL'], 1, 'PROVISIONAL', date '2026-10-21', 12.75, 'OFFICIAL_KWT_SEQUENCE', 'PUBLISHED');
`

async function main() {
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  await waitForReady()
  run(psql, psqlArgs(["-f", sqlFile("setup.sql", setupSql)]), { timeout: 120000 })
  run(psql, psqlArgs(["-f", proposal]), { timeout: 120000 })
  run(psql, psqlArgs(["-f", sqlFile("valid-data.sql", validDataSql)]), { timeout: 120000 })

  if (query("select handicap_status from public.handicap_index_snapshots where id='20000000-0000-5000-8000-000000000001'") !== "LEGACY_BEST_FIVE") throw new Error("legacy status was not preserved")
  if (query("select count(*) from public.handicap_publishable_index_snapshots") !== "2") throw new Error("publication view did not expose only the valid official and provisional rows")
  if (query("select count(*) from public.handicap_publishable_index_snapshots where handicap_status='PROVISIONAL'") !== "1") throw new Error("published provisional status was not preserved")
  if (query("select count(*) from public.handicap_index_snapshots where handicap_status='PROVISIONAL'") !== "1") throw new Error("provisional snapshot was not persisted")
  if (query("select reloptions @> array['security_invoker=true'] from pg_class where oid='public.handicap_publishable_index_snapshots'::regclass") !== "t") throw new Error("publication view lost security invoker")
  if (query("select has_table_privilege('anon','public.handicap_index_snapshots','SELECT') or has_table_privilege('authenticated','public.handicap_index_snapshots','SELECT')") !== "f") throw new Error("client table access was broadened")
  if (query("select has_table_privilege('anon','public.handicap_publishable_index_snapshots','SELECT') or has_table_privilege('authenticated','public.handicap_publishable_index_snapshots','SELECT')") !== "f") throw new Error("client view access was broadened")
  if (query("select to_regprocedure('public.get_published_handicap_for_player(uuid)') is null") !== "t") throw new Error("RPC unexpectedly existed before proposal installation")

  run(psql, psqlArgs(["-f", rpcProposal]), { timeout: 120000 })
  if (query("select has_function_privilege('authenticated','public.get_published_handicap_for_player(uuid)','EXECUTE')") !== "t") throw new Error("authenticated RPC grant missing")
  const read = query("select (public.get_published_handicap_for_player('11111111-1111-4111-8111-111111111111'::uuid)->>'qualifying_card_count') || ':' || (public.get_published_handicap_for_player('11111111-1111-4111-8111-111111111111'::uuid)->>'handicap_status')")
  if (read !== "20:OFFICIAL_ELIGIBLE") throw new Error(`identity-bound RPC returned unexpected result: ${read}`)
  if (query("select public.get_published_handicap_for_player('22222222-2222-4222-8222-222222222222'::uuid) is null") !== "t") throw new Error("cross-player RPC access was not denied")

  expectFailure("invalid-active-count", `begin; insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, active_twenty_source_round_ids, active_round_count, handicap_status, differential_model_version, chronology_confidence, publication_status) values ('20000000-0000-5000-8000-000000000004','10000000-0000-5000-8000-000000000002','11111111-1111-4111-8111-111111111111',ARRAY['KWT|bad|x|BHE|1'],ARRAY['KWT|bad|x|BHE|1'],2,'PROVISIONAL','krys-handicap-candidate-a-v1','OFFICIAL_KWT_SEQUENCE','UNPUBLISHED'); commit;`)
  expectFailure("append-only-update", "update public.handicap_index_snapshots set resulting_index=99 where id='20000000-0000-5000-8000-000000000002';")
  expectFailure("duplicate-index", "insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, differential_model_version, chronology_confidence, publication_status) values ('20000000-0000-5000-8000-000000000005','10000000-0000-5000-8000-000000000002','11111111-1111-4111-8111-111111111111','krys-handicap-candidate-a-v1','OFFICIAL_KWT_SEQUENCE','UNPUBLISHED');")
  expectFailure("atomic-rollback", `begin; insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility) values ('10000000-0000-5000-8000-000000000004','phase126','krys-handicap-candidate-a-v1','rollback-test','OFFICIAL_KWT_SEQUENCE','DRAFT','QUARANTINED'); insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, active_round_count, active_twenty_source_round_ids, differential_model_version, chronology_confidence, publication_status) values ('20000000-0000-5000-8000-000000000006','10000000-0000-5000-8000-000000000004','11111111-1111-4111-8111-111111111111',2,ARRAY['only-one'],'krys-handicap-candidate-a-v1','OFFICIAL_KWT_SEQUENCE','UNPUBLISHED'); commit;`)
  if (query("select count(*) from public.handicap_calculation_runs where id='10000000-0000-5000-8000-000000000004'") !== "0") throw new Error("atomic rollback left a calculation run")
  if (query("select count(*) from public.handicap_index_snapshots where id='20000000-0000-5000-8000-000000000006'") !== "0") throw new Error("atomic rollback left an index")
  if (query("select count(*) from public.handicap_publishable_index_snapshots") !== "2") throw new Error("failed transaction changed publication view")
  console.log(JSON.stringify({ status: "PASS", runtime: "PostgreSQL 17 disposable", port, legacy_rows: 1, rolling20_official_rows: 1, rolling20_provisional_rows: 1, published_view_rows: 2, rpc: "identity-bound" }))
}

async function stopServer() {
  if (!server) return
  try {
    run(pgCtl, ["-D", dataDir, "stop", "-m", "fast", "-w"], { timeout: 30000 })
  } catch {
    server.kill()
  }
  const deadline = Date.now() + 10000
  while (server.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (server.exitCode === null) server.kill()
}

try {
  await main()
} finally {
  await stopServer()
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
      break
    } catch (error) {
      if (attempt === 9) throw error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}
