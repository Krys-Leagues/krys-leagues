import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import Papa from "papaparse"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const psql = path.join(runtimeBin, "psql.exe")
const port = Number(process.env.KRYS_PG_PORT ?? "55498")
const workDir = path.join(root, `.phase104-local-${Date.now()}`)
const dataDir = path.join(workDir, "data")
const sqlFile = path.join(workDir, "package.sql")
const host = "127.0.0.1"
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
const csv = (relativePath) => {
  const result = Papa.parse(fs.readFileSync(path.join(root, relativePath), "utf8"), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${relativePath}: ${JSON.stringify(result.errors)}`)
  return result.data
}
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`
const sqlUuid = (value) => `${sqlText(value)}::uuid`
const sqlTextArray = (value) => `ARRAY[${value.map(sqlText).join(",")}]::text[]`
const sqlUuidArray = (value) => `ARRAY[${value.map(sqlUuid).join(",")}]::uuid[]`

async function main() {
  fs.rmSync(workDir, { recursive: true, force: true })
  fs.mkdirSync(workDir, { recursive: true })
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  const logs = []
  child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  child.stdout.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr.on("data", (chunk) => logs.push(String(chunk)))
  try {
    await waitForReady(logs)
    const phase59 = proposal("supabase/proposals/20261018_handicap_review_snapshots.proposed.sql")
      .replace("  unique (calculation_run_id, course_id, difficulty, model_version)", "  constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key unique (calculation_run_id, course_id, difficulty, model_version)")
    const phase65 = proposal("supabase/proposals/20261019_handicap_rating_snapshot_review_scope.proposed.sql")
    const phase73 = proposal("supabase/proposals/20261020_handicap_quarantine_publication_gate.proposed.sql")
    const phase96 = proposal("supabase/proposals/20261020_handicap_official_kwt_sequence_publication_gate.proposed.sql")
    const phase101 = proposal("supabase/proposals/20261020_handicap_kwt_effective_period_publication_gate.proposed.sql")
    run(psql, psqlArgs(["-c", `create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.players (id uuid primary key);
${phase59}
${phase65}
${phase73}
${phase96}
${phase101}`]), { timeout: 180000 })

    const ratingRows = csv("docs/handicap/phase104/rating_snapshot_import_rows.csv")
    const indexRows = csv("docs/handicap/phase104/index_snapshot_import_rows.csv")
    const provenance = csv("docs/handicap/phase68/handicap_source_provenance_import.csv")
    const players = [...new Set(provenance.filter((row) => row.source_type === "KWT" && row.canonical_player_id).map((row) => row.canonical_player_id))]
    if (players.length !== 201) throw new Error(`expected 201 canonical players, got ${players.length}`)
    const runId = ratingRows[0].calculation_run_id
    const runMetadata = JSON.parse(fs.readFileSync(path.join(root, "docs/handicap/phase104/calculation_run_manifest.json"), "utf8")).calculationRun
    const playerSql = players.map((id) => `insert into public.players (id) values (${sqlUuid(id)});`).join("\n")
    const ratingSql = ratingRows.map((row) => `insert into public.handicap_rating_snapshots
      (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope)
      values (${sqlUuid(row.id)}, ${sqlUuid(runId)}, ${sqlText(row.course_id)}, ${sqlText(row.difficulty)}, ${row.course_rating}, ${row.slope}, ${row.sample_size}, ${row.distinct_canonical_player_count}, ${sqlText(row.rating_confidence)}, ${sqlText(row.model_version)}, null, ${sqlText(row.effective_period)}, ${sqlTextArray(JSON.parse(row.source_evidence_refs))}, ${sqlText(row.publication_status)}, ${sqlText(row.review_scope)});`).join("\n")
    const indexSql = indexRows.map((row) => `insert into public.handicap_index_snapshots
      (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status)
      values (${sqlUuid(row.id)}, ${sqlUuid(runId)}, ${sqlUuid(row.canonical_player_id)}, ${sqlTextArray(JSON.parse(row.source_round_ids))}, ${sqlUuidArray(JSON.parse(row.rating_snapshot_ids))}, ${sqlTextArray(JSON.parse(row.rating_version_ids))}, ${sqlText(row.differential_model_version)}, ${sqlTextArray(JSON.parse(row.latest_ten_source_round_ids))}, ${sqlTextArray(JSON.parse(row.best_five_source_round_ids))}, ${row.resulting_index}, ${sqlText(row.chronology_confidence)}, ${sqlText(row.publication_status)});`).join("\n")
    const packageSql = `begin;
select pg_advisory_xact_lock(hashtext(${sqlText("krys-leagues:phase104:eligible-handicap-run")}));
insert into public.handicap_calculation_runs
  (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility, metadata)
values (${sqlUuid(runMetadata.id)}, ${sqlText(runMetadata.policy_version)}, ${sqlText(runMetadata.model_version)}, ${sqlText(runMetadata.source_package_ref)}, ${sqlText(runMetadata.chronology_policy)}, ${sqlText(runMetadata.status)}, ${sqlText(runMetadata.publication_eligibility)}, ${sqlText(JSON.stringify(runMetadata.metadata))}::jsonb);
${playerSql}
${ratingSql}
${indexSql}
do $$ begin
  if (not exists (select 1 from public.handicap_rating_snapshots where calculation_run_id=${sqlUuid(runId)} having count(*)=72)) then raise exception 'rating count mismatch'; end if;
  if (not exists (select 1 from public.handicap_index_snapshots where calculation_run_id=${sqlUuid(runId)} having count(*)=157)) then raise exception 'index count mismatch'; end if;
end $$;
commit;`
    fs.writeFileSync(sqlFile, packageSql)
    run(psql, psqlArgs(["-f", sqlFile]), { timeout: 180000 })

    assertQuery(`select count(*) from public.handicap_calculation_runs where id=${sqlUuid(runId)}`, "1", "calculation run")
    assertQuery(`select count(*) from public.handicap_rating_snapshots where calculation_run_id=${sqlUuid(runId)}`, "72", "rating snapshot count")
    assertQuery(`select count(*) from public.handicap_index_snapshots where calculation_run_id=${sqlUuid(runId)}`, "157", "index snapshot count")
    assertQuery(`select count(*) from public.handicap_rating_snapshots where calculation_run_id=${sqlUuid(runId)} and publication_status='UNPUBLISHED' and effective_from is null`, "72", "unpublished rating state")
    assertQuery(`select count(*) from public.handicap_index_snapshots where calculation_run_id=${sqlUuid(runId)} and publication_status='UNPUBLISHED' and chronology_confidence='OFFICIAL_KWT_SEQUENCE'`, "157", "unpublished index state")
    assertQuery(`select count(*) from public.handicap_publishable_rating_snapshots where calculation_run_id=${sqlUuid(runId)}`, "0", "quarantined rating view")
    assertQuery(`select count(*) from public.handicap_publishable_index_snapshots where calculation_run_id=${sqlUuid(runId)}`, "0", "unpublished index view")
    assertQuery(`select count(*) from public.handicap_index_snapshots where calculation_run_id=${sqlUuid(runId)} and exists (select 1 from unnest(source_round_ids) as x(ref) where ref like 'THE_WEEKLY%')`, "0", "Weekly exclusion")
    assertQuery(`select count(*) from public.handicap_index_snapshots i join public.players p on p.id=i.canonical_player_id where i.calculation_run_id=${sqlUuid(runId)}`, "157", "canonical player foreign keys")
    assertQuery("select has_table_privilege('anon','public.handicap_rating_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_rating_snapshots','select')::int::text", "00", "client table access")
    assertQuery("select count(*) from pg_class where relname='handicap_publishable_rating_snapshots' and reloptions @> array['security_invoker=true']", "1", "security invoker rating view")

    const duplicate = spawnSync(psql, psqlArgs(["-c", `begin; insert into public.handicap_calculation_runs (id,policy_version,model_version,source_package_ref,chronology_policy,status,publication_eligibility) values (${sqlUuid(runId)},'x','x','x','x','DRAFT','QUARANTINED'); commit;`]), { encoding: "utf8", windowsHide: true })
    if (duplicate.status === 0) throw new Error("duplicate calculation run unexpectedly committed")
    assertQuery("select count(*) from public.handicap_calculation_runs", "1", "duplicate rollback")
    const mutation = spawnSync(psql, psqlArgs(["-c", `update public.handicap_rating_snapshots set course_rating=0 where calculation_run_id=${sqlUuid(runId)};`]), { encoding: "utf8", windowsHide: true })
    if (mutation.status === 0) throw new Error("append-only rating mutation unexpectedly committed")
    assertQuery(`select count(*) from public.handicap_rating_snapshots where calculation_run_id=${sqlUuid(runId)} and course_rating=0`, "0", "append-only preservation")
    console.log(JSON.stringify({ localPostgres: "PASS", port, players: players.length, calculationRuns: 1, ratingSnapshots: 72, indexSnapshots: 157, publishableRatings: 0, publishableIndexes: 0, duplicateRunRollback: true, appendOnlyMutationRejected: true }, null, 2))
  } finally {
    if (child && child.exitCode === null) child.kill()
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  if (child && child.exitCode === null) child.kill()
  fs.rmSync(workDir, { recursive: true, force: true })
  console.error(error.stack || error)
  process.exitCode = 1
})
