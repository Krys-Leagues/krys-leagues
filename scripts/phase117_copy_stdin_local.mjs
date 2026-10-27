import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"

const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const postgres = path.join(runtimeBin, "postgres.exe")
const initdb = path.join(runtimeBin, "initdb.exe")
const psql = path.join(runtimeBin, "psql.exe")
const csvPath = path.resolve("docs/handicap/phase117/handicap_source_provenance_import.csv")
const dataDir = mkdtempSync(path.join(tmpdir(), "phase117-copy-"))
const port = 55417

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.status !== 0) {
    throw new Error(`${path.basename(executable)} failed (${result.status}): ${result.stderr || result.stdout}`)
  }
  return result.stdout
}

function psqlArgs(extra = []) {
  return ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra]
}

function query(sql) {
  return run(psql, psqlArgs(["-At", "-c", sql])).trim()
}

let server
try {
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  server = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true })

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const probe = spawnSync(psql, psqlArgs(["-At", "-c", "select 1"]), { encoding: "utf8", windowsHide: true })
    if (probe.status === 0) break
    if (server.exitCode !== null) throw new Error(`postgres exited before readiness: ${probe.stderr}`)
  }
  if (query("select 1") !== "1") throw new Error("postgres readiness probe failed")

  run(psql, psqlArgs(["-c", `create table phase117_copy_test (
    id uuid primary key,
    source_fingerprint text not null,
    source_type text not null,
    source_ref text not null,
    source_season integer,
    source_week integer,
    original_player_name text,
    canonical_player_id uuid not null,
    original_course_label text,
    original_course_code text,
    difficulty text not null,
    score numeric not null,
    metadata jsonb not null,
    import_status text not null
  )`]))

  const csv = readFileSync(csvPath, "utf8")
  const copyScript = `begin;
\\copy phase117_copy_test (id,source_fingerprint,source_type,source_ref,source_season,source_week,original_player_name,canonical_player_id,original_course_label,original_course_code,difficulty,score,metadata,import_status) from stdin with (format csv, header true, null '')
${csv}\\.
select count(*) from phase117_copy_test;
select count(distinct canonical_player_id) from phase117_copy_test;
commit;
`
  const loaded = run(psql, psqlArgs(["-f", "-"]), { input: copyScript })
  const counts = query("select count(*) || '|' || count(distinct canonical_player_id) from phase117_copy_test")
  if (counts !== "728|65") throw new Error(`unexpected loaded counts: ${counts}; output=${loaded}`)

  const rollbackScript = `begin;
insert into phase117_copy_test select * from phase117_copy_test limit 1;
select 1/0;
commit;
`
  const failed = spawnSync(psql, psqlArgs(["-f", "-"]), { input: rollbackScript, encoding: "utf8", windowsHide: true })
  if (failed.status === 0) throw new Error("rollback failure probe unexpectedly succeeded")
  if (query("select count(*) from phase117_copy_test") !== "728") throw new Error("failed transaction left partial rows")

  console.log(JSON.stringify({ runtime: "PostgreSQL 17.11", csvPath, copy: "client-side stdin", rows: 728, distinctCanonicalPlayers: 65, rollback: "passed" }))
} finally {
  if (server && server.exitCode === null) {
    spawnSync(path.join(runtimeBin, "pg_ctl.exe"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { encoding: "utf8", windowsHide: true })
  }
  rmSync(dataDir, { recursive: true, force: true })
}
