import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const psql = path.join(runtimeBin, "psql.exe")
const workDir = path.join(root, `.phase102-local-${Date.now()}`)
const dataDir = path.join(workDir, "data")
const host = process.env.KRYS_PG_HOST ?? "127.0.0.1"
const port = Number(process.env.KRYS_PG_PORT ?? "55497")
const playerId = "11111111-1111-4111-8111-111111111111"
let child

const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`)
  return result.stdout ?? ""
}

const psqlArgs = (extra) => ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra]
const query = (sql) => run(psql, psqlArgs(["-At", "-c", sql])).trim()
const assertQuery = (sql, expected, label) => {
  const actual = query(sql)
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const waitForReady = (logs) => new Promise((resolve, reject) => {
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

const proposal = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")
const phase59 = proposal("supabase/proposals/20261018_handicap_review_snapshots.proposed.sql")
  .replace("  unique (calculation_run_id, course_id, difficulty, model_version)", "  constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key unique (calculation_run_id, course_id, difficulty, model_version)")
const phase65 = proposal("supabase/proposals/20261019_handicap_rating_snapshot_review_scope.proposed.sql")
const phase73 = proposal("supabase/proposals/20261020_handicap_quarantine_publication_gate.proposed.sql")
const phase96 = proposal("supabase/proposals/20261020_handicap_official_kwt_sequence_publication_gate.proposed.sql")
const phase101 = proposal("supabase/proposals/20261020_handicap_kwt_effective_period_publication_gate.proposed.sql")

const setupSql = `create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.players (id uuid primary key);
${phase59}
${phase65}
${phase73}
${phase96}
${phase101}`

const period = "KWT S4W01 through S4W02; observed S4W01, S4W02; OFFICIAL_KWT_SEQUENCE; calendar date unavailable"
const insertSql = `begin;
insert into public.players (id) values ('${playerId}');
insert into public.handicap_calculation_runs
  (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility, metadata)
values
  ('00000000-0000-4100-8000-000000000101', 'approved', 'approved', 'phase102-period', 'OFFICIAL_KWT_SEQUENCE', 'COMPLETED', 'ELIGIBLE', '{"allow_official_kwt_sequence_publication": true}'),
  ('00000000-0000-4100-8000-000000000102', 'approved', 'approved', 'phase102-no-opt-in', 'OFFICIAL_KWT_SEQUENCE', 'COMPLETED', 'ELIGIBLE', '{}'),
  ('00000000-0000-4100-8000-000000000103', 'approved', 'approved', 'phase102-malformed-period', 'OFFICIAL_KWT_SEQUENCE', 'COMPLETED', 'ELIGIBLE', '{"allow_official_kwt_sequence_publication": true}'),
  ('00000000-0000-4100-8000-000000000104', 'approved', 'approved', 'phase102-exact-date', 'EXACT', 'COMPLETED', 'ELIGIBLE', '{}');
insert into public.handicap_source_provenance
  (id, source_fingerprint, source_type, source_ref, original_player_name, canonical_player_id, metadata)
values
  ('00000000-0000-4100-8000-000000000111', 'KWT|S4W01|synthetic|BHE|1', 'KWT', 'phase102', 'Synthetic Player', '${playerId}', '{"source_player_id":"synthetic"}'),
  ('00000000-0000-4100-8000-000000000112', 'KWT|S4W02|synthetic|BHE|1', 'KWT', 'phase102', 'Synthetic Player', '${playerId}', '{"source_player_id":"synthetic"}'),
  ('00000000-0000-4100-8000-000000000113', 'KWT|S4W03|synthetic|BHE|1', 'KWT', 'phase102', 'Synthetic Player', '${playerId}', '{"source_player_id":"synthetic"}'),
  ('00000000-0000-4100-8000-000000000114', 'KWT|S4W04|synthetic|BHE|1', 'KWT', 'phase102', 'Synthetic Player', '${playerId}', '{"source_player_id":"synthetic"}');
insert into public.handicap_rating_snapshots
  (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope)
values
  ('00000000-0000-4100-8000-000000000121', '00000000-0000-4100-8000-000000000101', 'BHE', 'easy', -20, 8.515, 50, 20, 'ready', 'krys-handicap-candidate-a-v1', null, '${period}', array['KWT|S4W01|synthetic|BHE|1','KWT|S4W02|synthetic|BHE|1']::text[], 'PUBLISHED', 'KWT_ONLY'),
  ('00000000-0000-4100-8000-000000000122', '00000000-0000-4100-8000-000000000102', 'BHE', 'easy', -20, 8.515, 50, 20, 'ready', 'krys-handicap-candidate-a-v1', null, '${period}', array['KWT|S4W01|synthetic|BHE|1']::text[], 'PUBLISHED', 'KWT_ONLY'),
  ('00000000-0000-4100-8000-000000000123', '00000000-0000-4100-8000-000000000103', 'BHE', 'easy', -20, 8.515, 50, 20, 'ready', 'krys-handicap-candidate-a-v1', null, 'not-a-validated-period', array['KWT|S4W03|synthetic|BHE|1']::text[], 'PUBLISHED', 'KWT_ONLY'),
  ('00000000-0000-4100-8000-000000000124', '00000000-0000-4100-8000-000000000104', 'BHE', 'easy', -20, 8.515, 50, 20, 'ready', 'krys-handicap-candidate-a-v1', '2026-10-20', null, array['KWT|S4W04|synthetic|BHE|1']::text[], 'PUBLISHED', 'KWT_ONLY');
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

  assertQuery("select count(*) from public.handicap_publishable_rating_snapshots", "2", "calendar and period paths")
  assertQuery("select count(*) from public.handicap_publishable_rating_snapshots where calculation_run_id='00000000-0000-4100-8000-000000000101'", "1", "opted-in period path")
  assertQuery("select count(*) from public.handicap_publishable_rating_snapshots where calculation_run_id in ('00000000-0000-4100-8000-000000000102','00000000-0000-4100-8000-000000000103')", "0", "no-opt-in and malformed period exclusion")
  assertQuery("select has_table_privilege('anon','public.handicap_publishable_rating_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_publishable_rating_snapshots','select')::int::text", "00", "client view access")
  assertQuery("select has_table_privilege('service_role','public.handicap_publishable_rating_snapshots','select')::int::text", "1", "service view access")
  assertQuery("select count(*) from pg_class where relname='handicap_publishable_rating_snapshots' and reloptions @> array['security_invoker=true']", "1", "security invoker view")

  const mutation = spawnSync(psql, psqlArgs(["-c", "update public.handicap_rating_snapshots set course_rating = 0 where id='00000000-0000-4100-8000-000000000121';"]), { encoding: "utf8", windowsHide: true })
  if (mutation.status === 0) throw new Error("rating snapshot append-only mutation unexpectedly succeeded")
  assertQuery("select course_rating from public.handicap_rating_snapshots where id='00000000-0000-4100-8000-000000000121'", "-20", "append-only preservation")

  console.log(JSON.stringify({
    runtime: { postgres: "17.11", host, port },
    publication: { selected: 2, periodOnlySelected: 1, exactDateSelected: 1, noOptInExcluded: true, malformedPeriodExcluded: true },
    safeguards: { clientViewAccess: false, serviceRoleViewAccess: true, securityInvoker: true, appendOnlyMutationRejected: true },
  }, null, 2))
}

main().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1 }).finally(async () => {
  if (child && child.exitCode === null) child.kill()
  await new Promise((resolve) => setTimeout(resolve, 500))
  fs.rmSync(workDir, { recursive: true, force: true })
})
