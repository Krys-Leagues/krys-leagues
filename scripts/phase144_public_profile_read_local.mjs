import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"

const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const postgres = path.join(runtimeBin, "postgres.exe")
const initdb = path.join(runtimeBin, "initdb.exe")
const psql = path.join(runtimeBin, "psql.exe")
const port = process.env.PHASE144_PG_PORT ?? "55454"
const root = process.cwd()
const proposal = path.join(root, "supabase", "proposals", "20261022_handicap_public_profile_read_rpc_phase144.proposed.sql")
for (const file of [postgres, initdb, psql, proposal]) if (!fs.existsSync(file)) throw new Error(`Missing Phase 144 dependency: ${file}`)

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase144-pg-"))
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase144-fixture-"))
let server
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`)
  return result.stdout ?? ""
}
const args = (extra) => ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", ...extra]
const sqlFile = (name, sql) => { const file = path.join(fixtureDir, name); fs.writeFileSync(file, `${sql.trim()}\n`, "utf8"); return file }
const query = (sql) => run(psql, args(["-At", "-c", sql])).trim()
const queryLast = (sql) => query(sql).split(/\r?\n/).pop()
const waitForReady = async () => {
  server = spawn(postgres, ["-D", dataDir, "-p", port, "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  const logs = []
  server.stdout.on("data", (chunk) => logs.push(String(chunk)))
  server.stderr.on("data", (chunk) => logs.push(String(chunk)))
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`postgres exited before readiness\n${logs.join("")}`)
    const probe = spawnSync(psql, args(["-At", "-c", "select 1"]), { encoding: "utf8", windowsHide: true })
    if (probe.status === 0 && probe.stdout.trim() === "1") return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`postgres readiness timeout\n${logs.join("")}`)
}

const setup = `
create role anon;
create role authenticated;
create role service_role;
create schema handicap_private;
create table public.players (id uuid primary key, screen_name text not null);
create table public.handicap_calculation_runs (id uuid primary key, status text not null, publication_eligibility text not null, chronology_policy text not null, metadata jsonb not null default '{}');
create table public.handicap_source_provenance (id uuid primary key, source_fingerprint text not null, source_type text not null, canonical_player_id uuid, original_player_name text, metadata jsonb not null default '{}');
create table public.handicap_rating_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id), course_id text not null, difficulty text not null, course_rating numeric not null, slope numeric not null);
create table public.handicap_index_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id), canonical_player_id uuid not null references public.players(id), source_round_ids text[] not null, rating_snapshot_ids uuid[] not null, rating_version_ids text[] not null, differential_model_version text not null, latest_ten_source_round_ids text[] not null, best_five_source_round_ids text[] not null, resulting_index numeric, chronology_confidence text not null, publication_status text not null, created_at timestamptz not null default now(), active_twenty_source_round_ids text[] not null, active_round_count integer not null, handicap_status text not null, effective_from date);
alter table public.handicap_index_snapshots enable row level security;
create view public.handicap_publishable_index_snapshots with (security_invoker=true) as select i.id, i.calculation_run_id, i.canonical_player_id, i.source_round_ids, i.rating_snapshot_ids, i.rating_version_ids, i.differential_model_version, i.latest_ten_source_round_ids, i.best_five_source_round_ids, i.resulting_index, i.chronology_confidence, i.publication_status, i.created_at, i.active_twenty_source_round_ids, i.active_round_count, i.handicap_status, i.effective_from from public.handicap_index_snapshots i join public.handicap_calculation_runs r on r.id=i.calculation_run_id where r.status='COMPLETED' and r.publication_eligibility='ELIGIBLE' and i.publication_status='PUBLISHED';
revoke all on public.handicap_index_snapshots, public.handicap_publishable_index_snapshots from public, anon, authenticated;
grant select on public.handicap_publishable_index_snapshots to service_role;
create function public.get_published_handicap_for_player(uuid) returns jsonb language sql stable as $$ select null::jsonb $$;
insert into public.players values ('11111111-1111-4111-8111-111111111111','Published Player'), ('22222222-2222-4222-8222-222222222222','Hidden Player');
insert into public.handicap_calculation_runs values ('33333333-3333-4333-8333-333333333333','COMPLETED','ELIGIBLE','OFFICIAL_KWT_SEQUENCE','{}'), ('44444444-4444-4444-8444-444444444444','DRAFT','QUARANTINED','OFFICIAL_KWT_SEQUENCE','{}');
insert into public.handicap_index_snapshots (id,calculation_run_id,canonical_player_id,source_round_ids,rating_snapshot_ids,rating_version_ids,differential_model_version,latest_ten_source_round_ids,best_five_source_round_ids,resulting_index,chronology_confidence,publication_status,active_twenty_source_round_ids,active_round_count,handicap_status,effective_from) values ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',array['KWT|published']::text[],array['77777777-7777-4777-8777-777777777777']::uuid[],array['v1']::text[],'krys-handicap-candidate-a-v1',array['KWT|published']::text[],array['KWT|published']::text[],-2.15,'EXACT','PUBLISHED',array['KWT|published']::text[],1,'PROVISIONAL','2026-10-22'), ('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',array['KWT|hidden']::text[],array['88888888-8888-4888-8888-888888888888']::uuid[],array['v1']::text[],'krys-handicap-candidate-a-v1',array['KWT|hidden']::text[],array['KWT|hidden']::text[],4.27,'EXACT','UNPUBLISHED',array['KWT|hidden']::text[],1,'PROVISIONAL','2026-10-22');
`

try {
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres"])
  await waitForReady()
  run(psql, args(["-f", sqlFile("setup.sql", setup)]))
  const selfBefore = query("select pg_get_functiondef('public.get_published_handicap_for_player(uuid)'::regprocedure)")
  run(psql, args(["-f", proposal]))
  const selfAfter = query("select pg_get_functiondef('public.get_published_handicap_for_player(uuid)'::regprocedure)")
  if (selfBefore !== selfAfter) throw new Error("Existing self-read RPC changed")
  if (query("select to_regprocedure('handicap_private.get_public_published_handicap_for_player(uuid)') is null") !== "t") throw new Error("Private helper unexpectedly exists")
  if (query("select has_function_privilege('anon','public.get_public_published_handicap_for_player(uuid)','EXECUTE') and has_function_privilege('authenticated','public.get_public_published_handicap_for_player(uuid)','EXECUTE')") !== "t") throw new Error("Public wrapper grants missing")
  if (query("select has_function_privilege('public','public.get_public_published_handicap_for_player(uuid)','EXECUTE')") !== "f") throw new Error("PUBLIC execute grant was not revoked")
  const publicRead = queryLast("set role anon; select public.get_public_published_handicap_for_player('11111111-1111-4111-8111-111111111111'::uuid)->>'display_index'")
  if (publicRead !== "+2.15") throw new Error(`Anonymous published read mismatch: ${publicRead}`)
  const authenticatedRead = queryLast("set role authenticated; select public.get_public_published_handicap_for_player('11111111-1111-4111-8111-111111111111'::uuid)->>'screen_name'")
  if (authenticatedRead !== "Published Player") throw new Error(`Authenticated published read mismatch: ${authenticatedRead}`)
  if (queryLast("set role anon; select public.get_public_published_handicap_for_player('22222222-2222-4222-8222-222222222222'::uuid) is null") !== "t") throw new Error("Unpublished row was exposed")
  const privateDenied = spawnSync(psql, args(["-At", "-c", "set role anon; select handicap_private.get_public_published_handicap_for_player('11111111-1111-4111-8111-111111111111'::uuid)"]), { encoding: "utf8", windowsHide: true })
  if (privateDenied.status === 0) throw new Error("Private helper was directly callable")
  const directDenied = spawnSync(psql, args(["-At", "-c", "set role anon; select count(*) from public.handicap_index_snapshots"]), { encoding: "utf8", windowsHide: true })
  if (directDenied.status === 0) throw new Error("Anonymous direct table access unexpectedly succeeded")
  const payload = query("select public.get_public_published_handicap_for_player('11111111-1111-4111-8111-111111111111'::uuid)::text")
  if (/source_round_ids|rating_snapshot_ids|provenance|review_evidence|private/i.test(payload)) throw new Error("Private fields leaked from public payload")
  console.log(JSON.stringify({ status: "PASS", localPostgres: "17.11", selfReadUnchanged: true, anonymousPublishedRead: true, authenticatedPublishedRead: true, unpublishedHidden: true, privateHelperAbsentAndDenied: true, directTableDenied: true, privateFieldsHidden: true }, null, 2))
} finally {
  if (server && server.exitCode === null) server.kill()
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) } catch {}
  try { fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) } catch {}
}
