import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const psql = path.join(runtimeBin, "psql.exe")
const workDir = path.join(root, `.phase96-local-${Date.now()}`)
const dataDir = path.join(workDir, "data")
const port = Number(process.env.KRYS_PG_PORT ?? "55496")
const host = process.env.KRYS_PG_HOST ?? "127.0.0.1"
const playerId = "11111111-1111-4111-8111-111111111111"
const sourceFingerprint = "KWT|S14W01|synthetic|BHE|1"
const ratingId = "00000000-0000-4000-8000-000000000961"
let child

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`)
  return result.stdout ?? ""
}

function psqlArgs(extra) {
  return ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra]
}

function query(sql) {
  return run(psql, psqlArgs(["-At", "-c", sql])).trim()
}

function assertQuery(sql, expected, label) {
  const actual = query(sql)
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function waitForReady(logs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000
    const timer = setInterval(() => {
      if (child.exitCode !== null) {
        clearInterval(timer)
        reject(new Error(`postgres exited: ${logs.join("")}`))
        return
      }
      const probe = spawnSync(psql, psqlArgs(["-At", "-c", "select 1"]), { encoding: "utf8", windowsHide: true })
      if (probe.status === 0 && probe.stdout.trim() === "1") {
        clearInterval(timer)
        resolve()
        return
      }
      if (Date.now() > deadline) {
        clearInterval(timer)
        reject(new Error(`postgres readiness timeout: ${probe.stderr ?? ""}`))
      }
    }, 250)
  })
}

const phase59 = fs.readFileSync(path.join(root, "supabase/proposals/20261018_handicap_review_snapshots.proposed.sql"), "utf8")
  .replace("  unique (calculation_run_id, course_id, difficulty, model_version)", "  constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key unique (calculation_run_id, course_id, difficulty, model_version)")
const phase65 = fs.readFileSync(path.join(root, "supabase/proposals/20261019_handicap_rating_snapshot_review_scope.proposed.sql"), "utf8")
const phase73 = fs.readFileSync(path.join(root, "supabase/proposals/20261020_handicap_quarantine_publication_gate.proposed.sql"), "utf8")
const phase96 = fs.readFileSync(path.join(root, "supabase/proposals/20261020_handicap_official_kwt_sequence_publication_gate.proposed.sql"), "utf8")

const setupSql = `create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.players (id uuid primary key);
${phase59}
${phase65}
${phase73}
${phase96}`

const insertSql = `begin;
insert into public.players (id) values ('${playerId}');
insert into public.handicap_calculation_runs
  (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility, metadata)
values
  ('00000000-0000-4000-8000-000000000960', 'approved', 'approved', 'phase96-local', 'OFFICIAL_KWT_SEQUENCE', 'COMPLETED', 'ELIGIBLE', '{"allow_official_kwt_sequence_publication": true}'),
  ('00000000-0000-4000-8000-000000000962', 'approved', 'approved', 'phase96-local-no-opt-in', 'OFFICIAL_KWT_SEQUENCE', 'COMPLETED', 'ELIGIBLE', '{}');
insert into public.handicap_source_provenance
  (id, source_fingerprint, source_type, source_ref, original_player_name, canonical_player_id, metadata)
values
  ('00000000-0000-4000-8000-000000000963', '${sourceFingerprint}', 'KWT', 'phase96-local', 'Synthetic Player', '${playerId}', '{"source_player_id":"synthetic"}');
insert into public.handicap_rating_snapshots
  (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope)
values
  ('${ratingId}', '00000000-0000-4000-8000-000000000960', 'BHE', 'easy', -20, 8.515, 50, 20, 'ready', 'krys-handicap-candidate-a-v1', '2026-10-20', 'phase96', array['${sourceFingerprint}']::text[], 'PUBLISHED', 'KWT_ONLY');
insert into public.handicap_index_snapshots
  (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status)
values
  ('00000000-0000-4000-8000-000000000964', '00000000-0000-4000-8000-000000000960', '${playerId}', array['${sourceFingerprint}']::text[], array['${ratingId}'::uuid]::uuid[], array['${ratingId}']::text[], 'krys-handicap-candidate-a-v1', array['${sourceFingerprint}']::text[], array['${sourceFingerprint}']::text[], 2.4, 'OFFICIAL_KWT_SEQUENCE', 'PUBLISHED'),
  ('00000000-0000-4000-8000-000000000965', '00000000-0000-4000-8000-000000000962', '${playerId}', array['${sourceFingerprint}']::text[], array['${ratingId}'::uuid]::uuid[], array['${ratingId}']::text[], 'krys-handicap-candidate-a-v1', array['${sourceFingerprint}']::text[], array['${sourceFingerprint}']::text[], 2.4, 'OFFICIAL_KWT_SEQUENCE', 'PUBLISHED');
commit;`

async function main() {
  fs.rmSync(workDir, { recursive: true, force: true })
  fs.mkdirSync(workDir, { recursive: true })
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  const logs = []
  child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  child.stdout.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr.on("data", (chunk) => logs.push(String(chunk)))
  await waitForReady(logs)
  run(psql, psqlArgs(["-c", setupSql]), { timeout: 180000 })
  run(psql, psqlArgs(["-c", insertSql]), { timeout: 120000 })

  assertQuery("select count(*) from public.handicap_publishable_index_snapshots", "1", "opt-in official sequence selection")
  assertQuery("select count(*) from public.handicap_index_snapshots where chronology_confidence='OFFICIAL_KWT_SEQUENCE'", "2", "official sequence rows")
  assertQuery("select count(*) from public.handicap_index_snapshots where publication_status='PUBLISHED'", "2", "published synthetic rows remain auditable")
  assertQuery("select count(*) from pg_constraint where conname='handicap_index_snapshots_chronology_confidence_check' and pg_get_constraintdef(oid) like '%OFFICIAL_KWT_SEQUENCE%'", "1", "official chronology constraint")
  assertQuery("select count(*) from pg_class where relname='handicap_publishable_index_snapshots' and reloptions @> array['security_invoker=true']", "1", "security invoker view")
  assertQuery("select has_table_privilege('anon','public.handicap_publishable_index_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_publishable_index_snapshots','select')::int::text", "00", "client view access")
  assertQuery("select has_table_privilege('service_role','public.handicap_publishable_index_snapshots','select')::int::text", "1", "service view access")

  const invalidSql = `begin; insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, chronology_confidence, publication_status) values ('00000000-0000-4000-8000-000000000966','00000000-0000-4000-8000-000000000960','${playerId}','NOT_ALLOWED','PUBLISHED'); commit;`
  const invalid = spawnSync(psql, psqlArgs(["-c", invalidSql]), { encoding: "utf8", windowsHide: true })
  if (invalid.status === 0) throw new Error("invalid chronology was accepted")
  assertQuery("select count(*) from public.handicap_index_snapshots", "2", "invalid chronology rollback")

  console.log(JSON.stringify({
    runtime: { postgres: "17.11", host, port },
    syntheticOfficialSequence: { totalIndexes: 2, selectedByPublishableView: 1, noOptInExcluded: true },
    safeguards: { invalidChronologyRejected: true, clientViewAccess: false, serviceRoleViewAccess: true, securityInvoker: true },
  }, null, 2))
}

main().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1 }).finally(async () => {
  if (child && child.exitCode === null) child.kill()
  await new Promise((resolve) => setTimeout(resolve, 500))
  fs.rmSync(workDir, { recursive: true, force: true })
})
