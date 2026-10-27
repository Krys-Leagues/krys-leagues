import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import Papa from "papaparse"

const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const postgres = path.join(runtimeBin, "postgres.exe")
const initdb = path.join(runtimeBin, "initdb.exe")
const psql = path.join(runtimeBin, "psql.exe")
const port = process.env.PHASE140_PG_PORT ?? "55449"
const root = process.cwd()
const out = path.join(root, "docs", "handicap", "phase140")
const packageRows = Papa.parse(fs.readFileSync(path.join(out, "index_snapshot_import_rows.csv"), "utf8"), { header: true, skipEmptyLines: true }).data
const mappingRows = Papa.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase136", "owner_rating_snapshot_mapping.csv"), "utf8"), { header: true, skipEmptyLines: true }).data
const runManifest = JSON.parse(fs.readFileSync(path.join(out, "calculation_run_manifest.json"), "utf8"))
const runId = runManifest.calculation_run_id
const targetRatingIds = [...new Set(mappingRows.map((row) => row.target_snapshot_id))]
const sourceRefs = [...new Set(packageRows.flatMap((row) => JSON.parse(row.source_round_ids)))]
const playerIds = [...new Set(packageRows.map((row) => row.canonical_player_id))]
const q = (value) => "'" + String(value).replaceAll("'", "''") + "'"
const arr = (values, type) => values.length ? `ARRAY[${values.map(q).join(",")}]::${type}[]` : `ARRAY[]::${type}[]`
const uuidFor = (value) => {
  const h = crypto.createHash("sha256").update(value).digest("hex")
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-5" + h.slice(13, 16) + "-" + ((parseInt(h.slice(16, 18), 16) & 63) | 128).toString(16).padStart(2, "0") + h.slice(18, 20) + "-" + h.slice(20, 32)
}
for (const file of [postgres, initdb, psql, path.join(out, "production_preflight.sql"), path.join(out, "production_installation.sql")]) if (!fs.existsSync(file)) throw new Error(`Missing Phase 140 test dependency: ${file}`)

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase140-pg-"))
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase140-fixture-"))
let server
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`)
  return result.stdout ?? ""
}
const psqlArgs = (extra) => ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", ...extra]
const query = (sql) => run(psql, psqlArgs(["-At", "-c", sql])).trim()
const sqlFile = (name, sql) => {
  const file = path.join(fixtureDir, name)
  fs.writeFileSync(file, `${sql.trim()}\n`, "utf8")
  return file
}
const waitForReady = async () => {
  const logs = []
  server = spawn(postgres, ["-D", dataDir, "-p", port, "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
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

const setup = `
create role anon;
create role authenticated;
create role service_role;
create schema handicap_private;
create function handicap_private.reject_history_mutation() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin raise exception 'Handicap history is append-only'; end; $$;
create table public.players (id uuid primary key, screen_name text not null);
create table public.handicap_calculation_runs (id uuid primary key, policy_version text not null, model_version text not null, source_package_ref text not null, chronology_policy text not null, status text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now(), completed_at timestamptz, publication_eligibility text not null default 'QUARANTINED');
create table public.handicap_source_provenance (id uuid primary key default gen_random_uuid(), source_fingerprint text not null unique, source_type text not null, source_ref text not null, original_player_name text, canonical_player_id uuid references public.players(id), metadata jsonb not null default '{}');
create table public.handicap_rating_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id), course_id text not null, difficulty text not null, course_rating numeric not null, slope numeric not null, sample_size integer not null, distinct_canonical_player_count integer not null, rating_confidence text not null, model_version text not null, effective_from date, effective_period text, source_evidence_refs text[] not null default '{}', publication_status text not null, review_scope text not null);
create table public.handicap_index_snapshots (id uuid primary key, calculation_run_id uuid not null references public.handicap_calculation_runs(id), canonical_player_id uuid not null references public.players(id), source_round_ids text[] not null default '{}', rating_snapshot_ids uuid[] not null default '{}', rating_version_ids text[] not null default '{}', differential_model_version text not null, latest_ten_source_round_ids text[] not null default '{}', best_five_source_round_ids text[] not null default '{}', resulting_index numeric, chronology_confidence text not null check (chronology_confidence in ('EXACT','OFFICIAL_KWT_SEQUENCE','PERIOD_WINDOW','ORDERED_UNDATED','UNKNOWN','AMBIGUOUS')), publication_status text not null check (publication_status in ('DRAFT','PROVISIONAL','UNPUBLISHED','PUBLISHED')), created_at timestamptz not null default now(), unique (calculation_run_id, canonical_player_id, differential_model_version), active_twenty_source_round_ids text[] not null default '{}', active_round_count integer not null default 0, handicap_status text not null default 'LEGACY_BEST_FIVE', effective_from date, check (active_round_count between 0 and 20), check (active_round_count = cardinality(active_twenty_source_round_ids)), check (handicap_status in ('LEGACY_BEST_FIVE','NOT_YET_RATED','PROVISIONAL','OFFICIAL_ELIGIBLE')), check ((handicap_status='NOT_YET_RATED' and active_round_count=0) or (handicap_status='PROVISIONAL' and active_round_count between 1 and 19) or (handicap_status='OFFICIAL_ELIGIBLE' and active_round_count=20) or handicap_status='LEGACY_BEST_FIVE'));
create table public.handicap_review_evidence (id uuid primary key, source_ref text not null, subject_key text not null, subject_kind text not null, evidence_payload jsonb not null default '{}', created_at timestamptz not null default now());
create table public.handicap_review_decisions (id uuid primary key, evidence_id uuid not null references public.handicap_review_evidence(id), subject_key text not null, subject_kind text not null, decision text not null, rationale text not null, reviewer_id uuid, decision_sequence integer not null, created_at timestamptz not null default now());
create trigger handicap_handicap_index_snapshots_append_only before update or delete on public.handicap_index_snapshots for each row execute function handicap_private.reject_history_mutation();
alter table public.handicap_index_snapshots enable row level security;
create view public.handicap_publishable_rating_snapshots with (security_invoker=true) as select * from public.handicap_rating_snapshots where false;
create view public.handicap_publishable_index_snapshots with (security_invoker=true) as select * from public.handicap_index_snapshots where false;
revoke all on public.handicap_index_snapshots, public.handicap_publishable_index_snapshots from public, anon, authenticated;
grant select on public.handicap_index_snapshots, public.handicap_publishable_index_snapshots to service_role;
`

const chunkInsert = (table, columns, rows) => rows.reduce((sql, row, index) => sql + (index % 500 === 0 ? `insert into ${table} (${columns}) values\n` : ",\n") + row + (index % 500 === 499 || index === rows.length - 1 ? ";\n" : ""), "")
const seedPlayers = playerIds.map((id, i) => `(${q(id)}::uuid, ${q(packageRows.find((row) => row.canonical_player_id === id).canonical_screen_name)})`)
const seedRunIds = [
  "5a57560c-3548-54a8-879c-8fc516a85f26", "fb606c55-e2f6-5d01-b79d-bfcc129a7cc6", "3973f8e7-f2c9-5d05-bdb7-e49810713612", "9a9a4bc4-e43d-55d4-84fb-a83c0b757681", "8f136000-0000-5000-8000-000000000136",
]
const seedRuns = seedRunIds.map((id, i) => `(${q(id)}::uuid, 'policy', 'krys-handicap-candidate-a-v1', 'fixture-${i}', 'OFFICIAL_KWT_SEQUENCE', 'DRAFT', '{}'::jsonb, 'QUARANTINED')`)
const provenanceRows = sourceRefs.map((ref, i) => `(${q(uuidFor(`prov:${ref}`))}::uuid, ${q(ref)}, 'KWT', ${q(`fixture/${i}`)}, 'Synthetic source', ${q(packageRows[i % packageRows.length].canonical_player_id)}::uuid, jsonb_build_object('source_player_id', 'fixture-' || ${i}))`)
while (provenanceRows.length < 28672) { const i = provenanceRows.length; provenanceRows.push(`(${q(uuidFor(`filler:${i}`))}::uuid, ${q(`KWT|FILLER|${i}`)}, 'KWT', ${q(`fixture/filler/${i}`)}, 'Synthetic filler', ${q(playerIds[i % playerIds.length])}::uuid, jsonb_build_object('source_player_id', 'filler-${i}'))`) }
const ratingRows = mappingRows.map((row) => `(${q(row.target_snapshot_id)}::uuid, ${q(seedRunIds[4])}::uuid, ${q(row.course_id)}, ${q(row.difficulty)}, ${row.approved_rating}, ${row.approved_slope}, 100, 20, 'ready', 'krys-course-rating-elite-lowest-12-v1', null, ${q('KWT period')}, ARRAY[]::text[], 'UNPUBLISHED', 'KWT_ONLY')`)
while (ratingRows.length < 427) { const i = ratingRows.length; ratingRows.push(`(${q(uuidFor(`rating-filler:${i}`))}::uuid, ${q(seedRunIds[i % 4])}::uuid, ${q(`FILLER_${i}`)}, 'easy', -10, 8, 100, 20, 'ready', 'krys-course-rating-elite-lowest-12-v1', null, ${q('fixture')}, ARRAY[]::text[], 'UNPUBLISHED', 'KWT_ONLY')`) }
const oldIndexRows = Array.from({ length: 157 }, (_, i) => `(${q(uuidFor(`old-index:${i}`))}::uuid, ${q(seedRunIds[0])}::uuid, ${q(playerIds[i])}::uuid, ARRAY[]::text[], ARRAY[]::uuid[], ARRAY[]::text[], 'krys-handicap-candidate-a-v1', ARRAY[]::text[], ARRAY[]::text[], 1, 'OFFICIAL_KWT_SEQUENCE', 'UNPUBLISHED', 0, ARRAY[]::text[], 'LEGACY_BEST_FIVE', null)`)
const evidenceRows = Array.from({ length: 74 }, (_, i) => `(${q(uuidFor(`evidence:${i}`))}::uuid, ${q(`fixture/evidence/${i}`)}, ${q(i === 0 ? 'old-run' : targetRatingIds[(i - 1) % targetRatingIds.length])}, 'SOURCE_RECORD', '{}'::jsonb)`)
const decisionRows = evidenceRows.map((row, i) => `(${q(uuidFor(`decision:${i}`))}::uuid, ${q(uuidFor(`evidence:${i}`))}::uuid, ${q(i === 0 ? 'old-run' : targetRatingIds[(i - 1) % targetRatingIds.length])}, 'SOURCE_RECORD', ${q(i === 0 ? 'QUARANTINE' : 'ACCEPT')}, 'fixture', null, 1)`)
const pgArray = (values) => values.length ? `{${values.map((value) => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\\"')}"`).join(",")}}` : "{}"
const writeFixtureCsv = (name, headers, rows) => {
  const file = path.join(fixtureDir, name)
  fs.writeFileSync(file, Papa.unparse({ fields: headers, data: rows }, { newline: "\n" }) + "\n", "utf8")
  return file.replaceAll("\\", "/")
}
const playersCsv = writeFixtureCsv("players.csv", ["id", "screen_name"], playerIds.map((id) => [id, packageRows.find((row) => row.canonical_player_id === id).canonical_screen_name]))
const runsCsv = writeFixtureCsv("runs.csv", ["id", "policy_version", "model_version", "source_package_ref", "chronology_policy", "status", "metadata", "publication_eligibility"], seedRunIds.map((id, i) => [id, "policy", "krys-handicap-candidate-a-v1", `fixture-${i}`, "OFFICIAL_KWT_SEQUENCE", "DRAFT", "{}", "QUARANTINED"]))
const provenanceCsv = writeFixtureCsv("provenance.csv", ["id", "source_fingerprint", "source_type", "source_ref", "original_player_name", "canonical_player_id", "metadata"], sourceRefs.map((ref, i) => [uuidFor(`prov:${ref}`), ref, "KWT", `fixture/${i}`, "Synthetic source", packageRows[i % packageRows.length].canonical_player_id, JSON.stringify({ source_player_id: `fixture-${i}` })]).concat(Array.from({ length: 28672 - sourceRefs.length }, (_, j) => { const i = sourceRefs.length + j; return [uuidFor(`filler:${i}`), `KWT|FILLER|${i}`, "KWT", `fixture/filler/${i}`, "Synthetic filler", playerIds[i % playerIds.length], JSON.stringify({ source_player_id: `filler-${i}` })] })))
const ratingsCsv = writeFixtureCsv("ratings.csv", ["id", "calculation_run_id", "course_id", "difficulty", "course_rating", "slope", "sample_size", "distinct_canonical_player_count", "rating_confidence", "model_version", "effective_from", "effective_period", "source_evidence_refs", "publication_status", "review_scope"], mappingRows.map((row) => [row.target_snapshot_id, seedRunIds[4], row.course_id, row.difficulty, row.approved_rating, row.approved_slope, 100, 20, "ready", "krys-course-rating-elite-lowest-12-v1", "", "KWT period", "{}", "UNPUBLISHED", "KWT_ONLY"]).concat(Array.from({ length: 427 - mappingRows.length }, (_, i) => [uuidFor(`rating-filler:${i}`), seedRunIds[i % 4], `FILLER_${i}`, "easy", -10, 8, 100, 20, "ready", "krys-course-rating-elite-lowest-12-v1", "", "fixture", "{}", "UNPUBLISHED", "KWT_ONLY"])))
const indexesCsv = writeFixtureCsv("old-indexes.csv", ["id", "calculation_run_id", "canonical_player_id", "source_round_ids", "rating_snapshot_ids", "rating_version_ids", "differential_model_version", "latest_ten_source_round_ids", "best_five_source_round_ids", "resulting_index", "chronology_confidence", "publication_status", "active_round_count", "active_twenty_source_round_ids", "handicap_status", "effective_from"], Array.from({ length: 157 }, (_, i) => [uuidFor(`old-index:${i}`), seedRunIds[0], playerIds[i], "{}", "{}", "{}", "krys-handicap-candidate-a-v1", "{}", "{}", 1, "OFFICIAL_KWT_SEQUENCE", "UNPUBLISHED", 0, "{}", "LEGACY_BEST_FIVE", ""]))
const evidenceCsv = writeFixtureCsv("evidence.csv", ["id", "source_ref", "subject_key", "subject_kind", "evidence_payload"], Array.from({ length: 74 }, (_, i) => [uuidFor(`evidence:${i}`), `fixture/evidence/${i}`, i === 0 ? "old-run" : targetRatingIds[(i - 1) % targetRatingIds.length], "SOURCE_RECORD", "{}"]))
const decisionsCsv = writeFixtureCsv("decisions.csv", ["id", "evidence_id", "subject_key", "subject_kind", "decision", "rationale", "reviewer_id", "decision_sequence"], Array.from({ length: 74 }, (_, i) => [uuidFor(`decision:${i}`), uuidFor(`evidence:${i}`), i === 0 ? "old-run" : targetRatingIds[(i - 1) % targetRatingIds.length], "SOURCE_RECORD", i === 0 ? "QUARANTINE" : "ACCEPT", "fixture", "", 1]))
const seed = `${setup}\\copy public.players (id, screen_name) from '${playersCsv}' with (format csv, header true)\n\\copy public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, metadata, publication_eligibility) from '${runsCsv}' with (format csv, header true)\n\\copy public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, original_player_name, canonical_player_id, metadata) from '${provenanceCsv}' with (format csv, header true)\n\\copy public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) from '${ratingsCsv}' with (format csv, header true)\n\\copy public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status, active_round_count, active_twenty_source_round_ids, handicap_status, effective_from) from '${indexesCsv}' with (format csv, header true)\n\\copy public.handicap_review_evidence (id, source_ref, subject_key, subject_kind, evidence_payload) from '${evidenceCsv}' with (format csv, header true)\n\\copy public.handicap_review_decisions (id, evidence_id, subject_key, subject_kind, decision, rationale, reviewer_id, decision_sequence) from '${decisionsCsv}' with (format csv, header true)`

try {
  console.error("phase140 local: initdb")
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres"])
  console.error("phase140 local: waiting for postgres")
  await waitForReady()
  console.error("phase140 local: seeding fixture")
  run(psql, psqlArgs(["-f", sqlFile("setup.sql", setup)]))
  const copyCommands = [
    `\\copy public.players (id, screen_name) from '${playersCsv}' with (format csv, header true)`,
    `\\copy public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, metadata, publication_eligibility) from '${runsCsv}' with (format csv, header true)`,
    `\\copy public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, original_player_name, canonical_player_id, metadata) from '${provenanceCsv}' with (format csv, header true)`,
    `\\copy public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) from '${ratingsCsv}' with (format csv, header true)`,
    `\\copy public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status, active_round_count, active_twenty_source_round_ids, handicap_status, effective_from) from '${indexesCsv}' with (format csv, header true)`,
    `\\copy public.handicap_review_evidence (id, source_ref, subject_key, subject_kind, evidence_payload) from '${evidenceCsv}' with (format csv, header true)`,
    `\\copy public.handicap_review_decisions (id, evidence_id, subject_key, subject_kind, decision, rationale, reviewer_id, decision_sequence) from '${decisionsCsv}' with (format csv, header true)`,
  ]
  for (const copyCommand of copyCommands) run(psql, psqlArgs(["-c", copyCommand]))
  console.error("phase140 local: preflight")
  run(psql, psqlArgs(["-f", path.join(out, "production_preflight.sql")]))
  console.error("phase140 local: installation")
  run(psql, psqlArgs(["-f", path.join(out, "production_installation.sql")]))
  console.error("phase140 local: post-import assertions")
  const counts = query(`select (select count(*) from public.handicap_calculation_runs)||','||(select count(*) from public.handicap_index_snapshots)||','||(select count(*) from public.handicap_publishable_index_snapshots)`)
  if (counts !== "6,323,0") throw new Error(`Unexpected post-import counts: ${counts}`)
  const failed = spawnSync(psql, psqlArgs(["-c", `begin; insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility) values (${q(runId)}::uuid, 'duplicate', 'duplicate', 'duplicate', 'OFFICIAL_KWT_SEQUENCE', 'DRAFT', 'QUARANTINED'); commit;`]), { encoding: "utf8", windowsHide: true })
  if (failed.status === 0) throw new Error("Duplicate run unexpectedly succeeded")
  const afterRollback = query(`select (select count(*) from public.handicap_calculation_runs)||','||(select count(*) from public.handicap_index_snapshots)`)
  if (afterRollback !== "6,323") throw new Error(`Duplicate-run rollback changed counts: ${afterRollback}`)
  const weekly = query(`select count(*) from public.handicap_index_snapshots where calculation_run_id=${q(runId)}::uuid and exists (select 1 from unnest(source_round_ids) x(ref) where ref like 'THE_WEEKLY%')`)
  if (weekly !== "0") throw new Error(`Weekly personal input detected: ${weekly}`)
  console.log(JSON.stringify({ status: "PASS", localPostgres: "17.11", preflight: "PASS", import: "PASS", duplicateRunRejected: true, atomicRollback: true, counts: { runs: 6, indexes: 323, publishableIndexes: 0 }, weeklyPersonalInputs: 0 }, null, 2))
} finally {
  if (server && server.exitCode === null) server.kill()
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch {}
  try { fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch {}
}
