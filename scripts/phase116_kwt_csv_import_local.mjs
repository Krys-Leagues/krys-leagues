import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import Papa from "papaparse"

const root = process.cwd()
const sourceDir = path.join(root, "docs", "handicap", "phase114")
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const psql = path.join(runtimeBin, "psql.exe")
const port = Number(process.env.KRYS_PG_PORT ?? "55416")
const workDir = path.join(root, `.phase116-local-${Date.now()}`)
const dataDir = path.join(workDir, "data")
const generatedDir = path.join(workDir, "generated")
const runId = uuidFromText(`phase116:${sha256(fs.readFileSync(path.join(sourceDir, "package_manifest.json")))}`)

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase()
}

function uuidFromText(value) {
  const bytes = Buffer.from(createHash("sha256").update(value).digest("hex").slice(0, 32), "hex")
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`)
  return result.stdout ?? ""
}

function psqlArgs(extra) {
  return ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra]
}

function query(sql) {
  return run(psql, psqlArgs(["-At", "-F", "|", "-c", sql])).trim()
}

function assertQuery(sql, expected, label) {
  const actual = query(sql)
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function parseCsv(file) {
  const result = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${path.basename(file)} CSV errors: ${JSON.stringify(result.errors)}`)
  return result.data
}

function csvEscape(value) {
  const text = value == null ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(file, headers, rows) {
  fs.writeFileSync(file, `${headers.join(",")}\n${rows.map(row => headers.map(header => csvEscape(row[header])).join(",")).join("\n")}\n`)
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function waitForReady(child, logs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000
    const timer = setInterval(() => {
      if (child.exitCode !== null) { clearInterval(timer); reject(new Error(`postgres exited: ${logs.join("")}`)); return }
      const probe = spawnSync(psql, psqlArgs(["-At", "-c", "select 1"]), { encoding: "utf8", windowsHide: true })
      if (probe.status === 0 && probe.stdout.trim() === "1") { clearInterval(timer); resolve(); return }
      if (Date.now() > deadline) { clearInterval(timer); reject(new Error(`postgres readiness timeout: ${logs.join("")} probe=${probe.stderr ?? ""}`)) }
    }, 250)
  })
}

function copy(table, columns, file) {
  return `\\copy ${table} (${columns}) from '${file.replaceAll("\\", "/").replaceAll("'", "''")}' with (format csv, header true, null '')`
}

const phase59 = fs.readFileSync(path.join(root, "supabase", "proposals", "20261018_handicap_review_snapshots.proposed.sql"), "utf8")
  .replace("  unique (calculation_run_id, course_id, difficulty, model_version)", "  constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key unique (calculation_run_id, course_id, difficulty, model_version)")
const phase65 = fs.readFileSync(path.join(root, "supabase", "proposals", "20261019_handicap_rating_snapshot_review_scope.proposed.sql"), "utf8")
const phase73 = fs.readFileSync(path.join(root, "supabase", "proposals", "20261020_handicap_quarantine_publication_gate.proposed.sql"), "utf8")
const packageRows = parseCsv(path.join(sourceDir, "handicap_source_provenance_import.csv"))
const packageManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "package_manifest.json"), "utf8"))
const packageHeaders = ["id", "source_fingerprint", "source_type", "source_ref", "source_season", "source_week", "original_player_name", "canonical_player_id", "original_course_label", "original_course_code", "metadata", "difficulty", "score", "import_status"]
const rows = packageRows.map(row => ({
  ...row,
  id: uuidFromText(`phase116-provenance:${row.source_fingerprint}`),
}))
const playerIds = [...new Set(rows.map(row => row.canonical_player_id))].sort()
const expectedPackageDistinctPlayers = 65
if (playerIds.length !== expectedPackageDistinctPlayers) {
  throw new Error(`Phase 114 package identity count changed: expected ${expectedPackageDistinctPlayers}, got ${playerIds.length}`)
}
const packageHash = sha256(fs.readFileSync(path.join(sourceDir, "package_manifest.json")))

let child
async function main() {
  if (!fs.existsSync(initdb) || !fs.existsSync(postgres) || !fs.existsSync(psql)) throw new Error(`PostgreSQL runtime incomplete under ${runtimeBin}`)
  if (port < 1024 || port > 65535) throw new Error(`Invalid disposable port ${port}`)
  fs.rmSync(workDir, { recursive: true, force: true })
  fs.mkdirSync(generatedDir, { recursive: true })

  writeCsv(path.join(generatedDir, "import.csv"), packageHeaders, rows)
  writeCsv(path.join(generatedDir, "players.csv"), ["id"], playerIds.map(id => ({ id })))

  const setupSql = [
    "create extension if not exists pgcrypto;",
    "create role anon nologin; create role authenticated nologin; create role service_role nologin;",
    "create table public.players (id uuid primary key, screen_name text not null);",
    phase59,
    phase65,
    phase73,
  ].join("\n")
  fs.writeFileSync(path.join(generatedDir, "setup.sql"), setupSql)

  const logs = []
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  child.stdout.on("data", chunk => logs.push(String(chunk)))
  child.stderr.on("data", chunk => logs.push(String(chunk)))
  await waitForReady(child, logs)
  run(psql, psqlArgs(["-f", path.join(generatedDir, "setup.sql")]), { timeout: 120000 })

  const importPath = path.join(generatedDir, "import.csv")
  const playersPath = path.join(generatedDir, "players.csv")
  const importSql = `begin;
create temp table players_import(id uuid primary key);
${copy("players_import", "id", playersPath)}
insert into public.players(id, screen_name) select id, 'SYNTHETIC-' || id::text from players_import;
create temp table kwt_csv_import (id uuid primary key, source_fingerprint text not null, source_type text not null, source_ref text not null, source_season integer, source_week integer, original_player_name text, canonical_player_id uuid not null, original_course_label text, original_course_code text, metadata jsonb not null, difficulty text not null, score numeric not null, import_status text not null);
${copy("kwt_csv_import", packageHeaders.join(","), importPath)}
do $$ begin
  if (select count(*) from kwt_csv_import) <> 728 then raise exception 'expected 728 import rows'; end if;
  if exists (select 1 from kwt_csv_import where source_type <> 'KWT' or canonical_player_id is null or metadata->>'provenance_namespace' <> 'OFFICIAL_KWT_CSV' or metadata->>'personal_handicap_eligible' <> 'true') then raise exception 'source contract failed'; end if;
  if exists (select 1 from kwt_csv_import where source_fingerprint !~ '^KWT\\|OFFICIAL_KWT_CSV:[^|]+\\|[^|]+:[^|]+:row=[0-9]+\\|[^|]+:(easy|hard)\\|[^|]+$') then raise exception 'fingerprint shape failed'; end if;
  if (select count(distinct source_fingerprint) from kwt_csv_import) <> 728 then raise exception 'fingerprint uniqueness failed'; end if;
  if (select count(distinct canonical_player_id) from kwt_csv_import) <> ${expectedPackageDistinctPlayers} then raise exception 'expected ${expectedPackageDistinctPlayers} distinct canonical players in the Season 14 package'; end if;
  if (select count(*) from kwt_csv_import where score < 0) = 0 then raise exception 'negative score preservation failed'; end if;
  if exists (select source_season, source_week, canonical_player_id, original_course_code, difficulty from kwt_csv_import group by 1,2,3,4,5 having count(*) > 1) then raise exception 'duplicate official pair failed'; end if;
end $$;
do $$ begin
  if exists (
    select 1
    from kwt_csv_import incoming
    join public.handicap_source_provenance existing
      on existing.source_fingerprint = incoming.source_fingerprint
      or (existing.source_type = 'KWT'
          and existing.source_season = incoming.source_season
          and existing.source_week = incoming.source_week
          and existing.canonical_player_id = incoming.canonical_player_id
          and existing.original_course_code = incoming.original_course_code
          and existing.metadata->>'difficulty' = incoming.difficulty)
  ) then raise exception 'existing KWT observation collision'; end if;
end $$;
insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, metadata)
values (${sqlLiteral(runId)}, 'krys-handicap-approved-policy-v1', 'krys-handicap-candidate-a-v1', ${sqlLiteral(`phase116:${packageHash}`)}, 'SEASON_WEEK_EASY_HARD', 'DRAFT', jsonb_build_object('publication_eligibility', 'QUARANTINED', 'official_sequence', 'SEASON_WEEK_EASY_HARD', 'source_type', 'KWT', 'source_namespace', 'OFFICIAL_KWT_CSV'));
insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, source_season, source_week, original_player_name, canonical_player_id, original_course_label, original_course_code, metadata)
select id, source_fingerprint, source_type, source_ref, source_season, source_week, original_player_name, canonical_player_id, original_course_label, original_course_code, metadata from kwt_csv_import;
commit;`
  fs.writeFileSync(path.join(generatedDir, "import.sql"), importSql)
  run(psql, psqlArgs(["-f", path.join(generatedDir, "import.sql")]), { timeout: 180000 })

  assertQuery("select count(*) from public.handicap_calculation_runs", "1", "calculation run")
  assertQuery("select count(*) from public.handicap_source_provenance", "728", "provenance rows")
  assertQuery(`select count(*) from public.handicap_source_provenance where source_type='KWT' and metadata->>'provenance_namespace'='OFFICIAL_KWT_CSV' and canonical_player_id is not null`, "728", "KWT canonical rows")
  assertQuery("select count(*) from public.handicap_rating_snapshots", "0", "rating snapshots unchanged")
  assertQuery("select count(*) from public.handicap_index_snapshots", "0", "index snapshots unchanged")
  assertQuery("select count(*) from public.handicap_publishable_rating_snapshots", "0", "publishable ratings")
  assertQuery("select count(*) from public.handicap_publishable_index_snapshots", "0", "publishable indexes")
  assertQuery("select has_table_privilege('anon','public.handicap_source_provenance','select')::int::text || has_table_privilege('authenticated','public.handicap_source_provenance','select')::int::text", "00", "client table access")
  assertQuery("select count(*) from pg_class where relname in ('handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and relrowsecurity", "6", "RLS tables")

  const before = query("select (select count(*)::text from public.handicap_calculation_runs) || ':' || (select count(*)::text from public.handicap_source_provenance) || ':' || (select count(*)::text from public.handicap_rating_snapshots)")
  const duplicateSql = `begin;
create temp table duplicate_import (like kwt_csv_import including defaults);
${copy("duplicate_import", packageHeaders.join(","), importPath)}
do $$ begin if exists (select 1 from duplicate_import d join public.handicap_source_provenance p on p.source_fingerprint=d.source_fingerprint) then raise exception 'duplicate fingerprint rejected'; end if; end $$;
commit;`
  fs.writeFileSync(path.join(generatedDir, "duplicate.sql"), duplicateSql)
  const duplicateResult = spawnSync(psql, psqlArgs(["-f", path.join(generatedDir, "duplicate.sql")]), { encoding: "utf8", windowsHide: true })
  if (duplicateResult.status === 0) throw new Error("duplicate fingerprint unexpectedly committed")
  assertQuery("select (select count(*)::text from public.handicap_calculation_runs) || ':' || (select count(*)::text from public.handicap_source_provenance) || ':' || (select count(*)::text from public.handicap_rating_snapshots)", before, "duplicate rollback")

  const first = rows[0]
  const crossNamespaceSql = `begin;
insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, source_season, source_week, original_player_name, canonical_player_id, original_course_code, metadata)
values (${sqlLiteral(uuidFromText("phase116-original-id"))}, 'KWT|KWT14W05|101|${first.original_course_code}|999', 'KWT', 'original-id-format', ${first.source_season}, ${first.source_week}, ${sqlLiteral(first.original_player_name)}, ${sqlLiteral(first.canonical_player_id)}, ${sqlLiteral(first.original_course_code)}, jsonb_build_object('difficulty', ${sqlLiteral(first.difficulty)}, 'source_id_namespace', 'ORIGINAL_KWT_ID'));
create temp table cross_import (like kwt_csv_import including defaults);
${copy("cross_import", packageHeaders.join(","), importPath)}
do $$ begin
  if not exists (select 1 from cross_import incoming join public.handicap_source_provenance existing on existing.source_type='KWT' and existing.source_season=incoming.source_season and existing.source_week=incoming.source_week and existing.canonical_player_id=incoming.canonical_player_id and existing.original_course_code=incoming.original_course_code and existing.metadata->>'difficulty'=incoming.difficulty) then raise exception 'cross-namespace duplicate was not detected'; end if;
  raise exception 'cross-namespace duplicate rejected';
end $$;
commit;`
  fs.writeFileSync(path.join(generatedDir, "cross_namespace.sql"), crossNamespaceSql)
  const crossResult = spawnSync(psql, psqlArgs(["-f", path.join(generatedDir, "cross_namespace.sql")]), { encoding: "utf8", windowsHide: true })
  if (crossResult.status === 0) throw new Error("cross-namespace duplicate unexpectedly committed")
  assertQuery("select count(*) from public.handicap_source_provenance", "728", "cross-namespace rollback")

  const badFkSql = `begin; insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status) values ('00000000-0000-4116-8111-000000000001','bad','bad','bad','bad','DRAFT'); insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, canonical_player_id, metadata) values ('00000000-0000-4116-8111-000000000002','KWT|bad-fk','KWT','bad','00000000-0000-4116-8111-000000000099','{}'); commit;`
  fs.writeFileSync(path.join(generatedDir, "bad_fk.sql"), badFkSql)
  const badFkResult = spawnSync(psql, psqlArgs(["-f", path.join(generatedDir, "bad_fk.sql")]), { encoding: "utf8", windowsHide: true })
  if (badFkResult.status === 0) throw new Error("invalid canonical FK unexpectedly committed")
  assertQuery("select (select count(*)::text from public.handicap_calculation_runs) || ':' || (select count(*)::text from public.handicap_source_provenance)", "1:728", "FK rollback")

  const mutationResult = spawnSync(psql, psqlArgs(["-c", "update public.handicap_source_provenance set original_player_name='MUTATION';"]), { encoding: "utf8", windowsHide: true })
  if (mutationResult.status === 0) throw new Error("append-only mutation unexpectedly succeeded")
  assertQuery("select count(*) from public.handicap_source_provenance where original_player_name='MUTATION'", "0", "append-only preservation")

  console.log(JSON.stringify({
    localPostgres: "PASS",
    port,
    packageHash,
    runId,
    canonicalPlayers: playerIds.length,
    importedProvenance: rows.length,
    easyObservations: rows.filter(row => row.difficulty === "easy").length,
    hardObservations: rows.filter(row => row.difficulty === "hard").length,
    negativeScores: rows.filter(row => Number(row.score) < 0).length,
    quarantinedPairs: packageManifest.quarantined_player_week_pairs,
    ratingSnapshots: 0,
    indexSnapshots: 0,
    duplicateFingerprintRollback: true,
    crossNamespaceRollback: true,
    foreignKeyRollback: true,
    appendOnlyMutationRejected: true,
    rlsTables: 6,
    clientDirectAccess: false,
  }, null, 2))
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1 }).finally(async () => {
  if (child && child.exitCode === null) child.kill()
  await new Promise(resolve => setTimeout(resolve, 500))
  fs.rmSync(workDir, { recursive: true, force: true })
})
