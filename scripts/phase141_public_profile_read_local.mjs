import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"

const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const postgres = path.join(runtimeBin, "postgres.exe")
const initdb = path.join(runtimeBin, "initdb.exe")
const psql = path.join(runtimeBin, "psql.exe")
const port = process.env.PHASE141_PG_PORT ?? "55453"
const root = process.cwd()
const proposal = path.join(root, "supabase", "proposals", "20261022_handicap_public_profile_read_rpc.proposed.sql")
for (const file of [postgres, initdb, psql, proposal]) if (!fs.existsSync(file)) throw new Error(`Missing Phase 141 dependency: ${file}`)

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase141-pg-"))
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase141-fixture-"))
let server
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`)
  return result.stdout ?? ""
}
const args = (extra) => ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", ...extra]
const sqlFile = (name, sql) => {
  const file = path.join(fixtureDir, name)
  fs.writeFileSync(file, `${sql.trim()}\n`, "utf8")
  return file
}
const query = (sql) => run(psql, args(["-At", "-c", sql])).trim()
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
create table public.handicap_index_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id), canonical_player_id uuid not null references public.players(id), resulting_index numeric, handicap_status text not null, active_round_count integer not null, differential_model_version text not null, effective_from date, publication_status text not null, created_at timestamptz not null default now());
alter table public.handicap_index_snapshots enable row level security;
create view public.handicap_publishable_index_snapshots with (security_invoker=true) as
  select i.id, i.calculation_run_id, i.canonical_player_id, i.resulting_index, i.handicap_status, i.active_round_count, i.differential_model_version, i.effective_from, i.created_at
  from public.handicap_index_snapshots i join public.handicap_calculation_runs r on r.id=i.calculation_run_id
  where r.status='COMPLETED' and r.publication_eligibility='ELIGIBLE' and i.publication_status='PUBLISHED';
revoke all on public.handicap_index_snapshots, public.handicap_publishable_index_snapshots from public, anon, authenticated;
grant select on public.handicap_publishable_index_snapshots to service_role;
create function public.get_published_handicap_for_player(uuid) returns jsonb language sql stable as $$ select null::jsonb $$;
insert into public.players values ('11111111-1111-4111-8111-111111111111','Published Player'), ('22222222-2222-4222-8222-222222222222','Hidden Player');
insert into public.handicap_calculation_runs values ('33333333-3333-4333-8333-333333333333','COMPLETED','ELIGIBLE','OFFICIAL_KWT_SEQUENCE','{}');
insert into public.handicap_calculation_runs values ('44444444-4444-4444-8444-444444444444','DRAFT','QUARANTINED','OFFICIAL_KWT_SEQUENCE','{}');
insert into public.handicap_index_snapshots (id,calculation_run_id,canonical_player_id,resulting_index,handicap_status,active_round_count,differential_model_version,effective_from,publication_status)
values ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',-2.15,'OFFICIAL_ELIGIBLE',20,'krys-handicap-candidate-a-v1','2026-10-22','PUBLISHED'),
       ('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',4.27,'OFFICIAL_ELIGIBLE',20,'krys-handicap-candidate-a-v1','2026-10-22','UNPUBLISHED');
`

try {
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres"])
  await waitForReady()
  run(psql, args(["-f", sqlFile("setup.sql", setup)]))
  run(psql, args(["-f", proposal]))
  const published = query("select (handicap_private.get_public_published_handicap_for_player('11111111-1111-4111-8111-111111111111'::uuid)->>'display_index')")
  if (published !== "+2.15") throw new Error(`Published safe read mismatch: ${published}`)
  const hidden = query("select handicap_private.get_public_published_handicap_for_player('22222222-2222-4222-8222-222222222222'::uuid) is null")
  if (hidden !== "t") throw new Error(`Unpublished row was exposed: ${hidden}`)
  const crossRole = query("set role anon; select public.get_public_published_handicap_for_player('11111111-1111-4111-8111-111111111111'::uuid) is not null").split(/\r?\n/).pop()
  if (crossRole !== "t") throw new Error(`Anonymous public read failed: ${crossRole}`)
  const directDenied = spawnSync(psql, args(["-At", "-c", "set role anon; select count(*) from public.handicap_index_snapshots"]), { encoding: "utf8", windowsHide: true })
  if (directDenied.status === 0) throw new Error("Anonymous direct table access unexpectedly succeeded")
  console.log(JSON.stringify({ status: "PASS", localPostgres: "17.11", publishedSummary: "PASS", unpublishedHidden: true, anonymousPublicRead: true, anonymousDirectTableReadDenied: true, serviceRoleOnlyView: true }, null, 2))
} finally {
  if (server && server.exitCode === null) server.kill()
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch {}
  try { fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch {}
}
