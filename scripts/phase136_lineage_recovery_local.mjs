import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import Papa from "papaparse"

const root = process.cwd()
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const postgres = path.join(runtimeBin, "postgres.exe")
const initdb = path.join(runtimeBin, "initdb.exe")
const pgCtl = path.join(runtimeBin, "pg_ctl.exe")
const psql = path.join(runtimeBin, "psql.exe")
const host = "127.0.0.1"
const port = process.env.PHASE136_PG_PORT ?? "55456"
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase136-pg-"))
const installSql = path.join(root, "docs", "handicap", "phase136", "production_installation.sql")
const successorCsv = path.join(root, "docs", "handicap", "phase136", "successor_rating_snapshots.csv")

for (const executable of [postgres, initdb, pgCtl, psql]) {
  if (!fs.existsSync(executable)) throw new Error(`PostgreSQL runtime missing: ${executable}`)
}

const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'"
const uuid = (seed) => {
  const hex = crypto.createHash("sha256").update(seed).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`)
  return result.stdout ?? ""
}
const psqlArgs = (extra = []) => ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra]
const query = (statement) => run(psql, psqlArgs(["-At", "-c", statement])).trim()
const rows = Papa.parse(fs.readFileSync(successorCsv, "utf8"), { header: true, skipEmptyLines: true }).data
if (rows.length !== 17) throw new Error(`expected 17 successor rows, got ${rows.length}`)

const sourceRefs = [...new Set(rows.flatMap((row) => JSON.parse(row.source_evidence_refs)))]
if (sourceRefs.length === 0) throw new Error("no source references in successor package")

const runs = Array.from({ length: 4 }, (_, index) => uuid(`phase136-baseline-run-${index}`))
const setup = [
  "create extension if not exists pgcrypto;",
  "create schema if not exists public;",
  "create table public.players (id uuid primary key);",
  "create table public.handicap_calculation_runs (id uuid primary key, policy_version text not null, model_version text not null, source_package_ref text not null, chronology_policy text not null, status text not null, metadata jsonb not null default '{}'::jsonb, publication_eligibility text not null default 'QUARANTINED');",
  "create table public.handicap_source_provenance (id uuid primary key default gen_random_uuid(), source_fingerprint text not null unique, source_type text not null, source_ref text not null, canonical_player_id uuid references public.players(id), metadata jsonb not null default '{}'::jsonb);",
  "create table public.handicap_rating_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id), course_id text not null, difficulty text not null, course_rating numeric not null, slope numeric not null, sample_size integer not null, distinct_canonical_player_count integer not null, rating_confidence text not null, model_version text not null, effective_from date, effective_period text, source_evidence_refs text[] not null, publication_status text not null, review_scope text not null, unique (calculation_run_id, course_id, difficulty, model_version, review_scope));",
  "create table public.handicap_index_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id));",
  "create view public.handicap_publishable_rating_snapshots as select * from public.handicap_rating_snapshots where false;",
  "create view public.handicap_publishable_index_snapshots as select * from public.handicap_index_snapshots where false;",
]
for (const id of runs) setup.push(`insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility) values (${quote(id)}, 'baseline', 'baseline', 'phase136-baseline', 'OFFICIAL_KWT_SEQUENCE', 'DRAFT', 'QUARANTINED');`)
const valuesSql = (values) => values.join(",\n")
setup.push(`insert into public.handicap_index_snapshots (id, calculation_run_id) values\n${valuesSql(Array.from({ length: 157 }, (_, index) => `(${quote(uuid(`phase136-baseline-index-${index}`))}, ${quote(runs[index % runs.length])})`))};`)
setup.push(`insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) values\n${valuesSql(Array.from({ length: 410 }, (_, index) => `(${quote(uuid(`phase136-baseline-rating-${index}`))}, ${quote(runs[index % runs.length])}, ${quote(`BASELINE_${index}`)}, 'easy', 0, 1, 50, 20, 'ready', 'baseline', null, null, '{}'::text[], 'UNPUBLISHED', 'KWT_ONLY')`))};`)
const sourceValues = []
for (let index = 0; index < sourceRefs.length; index += 1) sourceValues.push(`(${quote(uuid(`phase136-source-${index}`))}, ${quote(sourceRefs[index])}, 'KWT', ${quote(`phase136-source-${index}`)}, '{}'::jsonb)`)
for (let index = sourceRefs.length; index < 28672; index += 1) sourceValues.push(`(${quote(uuid(`phase136-filler-${index}`))}, ${quote(`PHASE136|FILLER|${index}`)}, 'KWT', ${quote(`phase136-filler-${index}`)}, '{}'::jsonb)`)
setup.push(`insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, metadata) values\n${valuesSql(sourceValues)};`)
setup.push("analyze public.handicap_source_provenance;")

let server
try {
  console.log(JSON.stringify({ phase: "initdb", dataDir, port }))
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  const logs = []
  server = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  server.stdout.on("data", (chunk) => logs.push(String(chunk)))
  server.stderr.on("data", (chunk) => logs.push(String(chunk)))
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`postgres exited before readiness\n${logs.join("")}`)
    const probe = spawnSync(psql, psqlArgs(["-At", "-c", "select 1"]), { encoding: "utf8", windowsHide: true })
    if (probe.status === 0 && probe.stdout.trim() === "1") break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (query("select 1") !== "1") throw new Error("postgres readiness probe failed")

  console.log(JSON.stringify({ phase: "setup", sourceReferences: sourceRefs.length, setupBytes: setup.join("\n").length }))
  const setupFile = path.join(dataDir, "setup.sql")
  fs.writeFileSync(setupFile, setup.join("\n") + "\n", "utf8")
  run(psql, psqlArgs(["-f", setupFile]), { timeout: 180000 })
  console.log(JSON.stringify({ phase: "baseline-verified" }))
  if (query("select count(*) from public.handicap_source_provenance") !== "28672") throw new Error("baseline provenance count mismatch")
  if (query("select count(*) from public.handicap_rating_snapshots") !== "410") throw new Error("baseline rating count mismatch")
  if (query("select count(*) from public.handicap_calculation_runs") !== "4") throw new Error("baseline run count mismatch")

  run(psql, psqlArgs(["-f", installSql]), { timeout: 180000 })
  console.log(JSON.stringify({ phase: "install-complete" }))
  const after = query("select (select count(*) from public.handicap_calculation_runs) || '|' || (select count(*) from public.handicap_source_provenance) || '|' || (select count(*) from public.handicap_rating_snapshots) || '|' || (select count(*) from public.handicap_index_snapshots)")
  if (after !== "5|28672|427|157") throw new Error(`post-install counts mismatch: ${after}`)
  if (query("select count(*) from public.handicap_calculation_runs where id='8f136000-0000-5000-8000-000000000136' and status='DRAFT' and publication_eligibility='QUARANTINED'") !== "1") throw new Error("run quarantine state mismatch")
  if (query("select count(*) from public.handicap_rating_snapshots where calculation_run_id='8f136000-0000-5000-8000-000000000136' and publication_status='UNPUBLISHED' and review_scope='KWT_ONLY'") !== "17") throw new Error("successor snapshot state mismatch")
  if (query("select count(*) from public.handicap_source_provenance where source_fingerprint like 'PHASE136|FILLER|%'") !== String(28672 - sourceRefs.length)) throw new Error("source reference seed mismatch")

  const duplicate = spawnSync(psql, psqlArgs(["-f", installSql]), { encoding: "utf8", windowsHide: true, timeout: 180000 })
  console.log(JSON.stringify({ phase: "duplicate-attempt", exitCode: duplicate.status }))
  if (duplicate.status === 0) throw new Error("duplicate install unexpectedly succeeded")
  if (query("select (select count(*) from public.handicap_calculation_runs) || '|' || (select count(*) from public.handicap_rating_snapshots)") !== "5|427") throw new Error("duplicate failure changed counts")

  console.log(JSON.stringify({ status: "PASS", runtime: "PostgreSQL 17 disposable", host, port, sourceReferences: sourceRefs.length, baseline: { runs: 4, provenance: 28672, ratings: 410, indexes: 157 }, afterInstall: { runs: 5, provenance: 28672, ratings: 427, indexes: 157 }, duplicateInstall: "rejected atomically" }))
} finally {
  if (server && server.exitCode === null) {
    try { run(pgCtl, ["-D", dataDir, "stop", "-m", "fast", "-w"], { timeout: 30000 }) } catch { server.kill() }
  }
  fs.rmSync(dataDir, { recursive: true, force: true })
}
