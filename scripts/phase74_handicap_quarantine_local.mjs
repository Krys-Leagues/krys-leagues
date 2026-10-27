import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const psql = path.join(runtimeBin, "psql.exe")
const workDir = path.join(root, `.phase74-local-${Date.now()}`)
const dataDir = path.join(workDir, "data")
const generatedDir = path.join(workDir, "generated")
const port = 55475
const connectionHost = process.env.KRYS_PG_HOST ?? "127.0.0.1"
const invalidRun = "5a57560c-3548-54a8-879c-8fc516a85f26"
const correctedRun = "fb606c55-e2f6-5d01-b79d-bfcc129a7cc6"
const approvedRun = "00000000-0000-4000-8000-000000000074"
const approvedRating = "00000000-0000-4000-8000-000000000075"
const approvedIndex = "00000000-0000-4000-8000-000000000076"
const playerId = "11111111-1111-4111-8111-111111111111"

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`)
  return result.stdout ?? ""
}

function query(sql) {
  return run(psql, psqlArgs(["-At", "-F", "|", "-c", sql])).trim()
}

function psqlArgs(extra) { return ["-X", "-v", "ON_ERROR_STOP=1", "-h", connectionHost, "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra] }

function parseCsv(text) {
  const rows = []
  let row = [], field = "", quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field.length === 0) quoted = true
    else if (ch === ",") { row.push(field); field = "" }
    else if (ch === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); row = []; field = "" }
    else field += ch
  }
  if (field.length || row.length) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row) }
  const header = rows[0] ?? []
  return rows.slice(1).filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])))
}

function readCsv(file) { return parseCsv(fs.readFileSync(file, "utf8")) }
function csvEscape(value) {
  const text = value == null ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
function writeCsv(file, header, rows) {
  fs.writeFileSync(file, [header.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n") + "\n")
}
function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'` }
function uuidFromText(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("")
  hex[12] = "5"
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16)
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`
}
function pgArray(values) {
  return `{${values.map((value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`
}
function csvPath(file) { return file.replaceAll("\\", "/").replaceAll("'", "''") }
function copy(table, columns, file) {
  return `\\copy ${table} (${columns}) from '${csvPath(file)}' with (format csv, header true, null '')`
}
function assertQuery(sql, expected, label) {
  const actual = query(sql)
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
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

const correctedDir = path.join(root, "docs", "handicap", "phase68")
const sourceRows = readCsv(path.join(correctedDir, "handicap_source_provenance_import.csv"))
const correctedManifest = JSON.parse(fs.readFileSync(path.join(correctedDir, "rating_snapshot_import_manifest.json"), "utf8"))
const phase61Manifest = JSON.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase61", "rating_snapshot_import_manifest.json"), "utf8"))
const provenanceHeader = ["id", "source_fingerprint", "source_type", "source_ref", "source_date", "source_season", "source_week", "original_player_name", "canonical_player_id", "original_course_label", "original_course_code", "metadata"]
const snapshotHeader = ["id", "calculation_run_id", "course_id", "difficulty", "course_rating", "slope", "sample_size", "distinct_canonical_player_count", "rating_confidence", "model_version", "effective_from", "effective_period", "source_evidence_refs", "publication_status", "review_scope"]

const correctedRows = sourceRows.map((row) => ({ ...row, metadata: JSON.parse(row.metadata) }))
const malformedByGood = new Map()
const invalidRows = correctedRows.map((row) => {
  if (row.source_type !== "KWT") return row
  const parts = row.source_fingerprint.split("|")
  const malformed = [parts[0], parts[1], "", parts[3], parts[4]].join("|")
  malformedByGood.set(row.source_fingerprint, malformed)
  return {
    ...row,
    id: uuidFromText(`phase67-invalid:${malformed}`),
    source_fingerprint: malformed,
    canonical_player_id: "",
    metadata: { ...row.metadata, source_player_id: null },
  }
})
const playerIds = [...new Set([
  ...correctedRows.filter((row) => row.source_type === "KWT").map((row) => row.canonical_player_id),
  playerId,
])].sort()

function snapshotFields(snapshot, runId, transformRef) {
  return [
    snapshot.id, runId, snapshot.course_id, snapshot.difficulty, snapshot.course_rating, snapshot.slope,
    snapshot.sample_size, snapshot.distinct_canonical_player_count, snapshot.rating_confidence,
    snapshot.model_version, "", snapshot.effective_period,
    pgArray(snapshot.source_evidence_refs.map((ref) => transformRef(ref))), "UNPUBLISHED", snapshot.review_scope,
  ]
}

fs.rmSync(workDir, { recursive: true, force: true })
fs.mkdirSync(generatedDir, { recursive: true })
writeCsv(path.join(generatedDir, "players.csv"), ["id"], playerIds.map((id) => [id]))
writeCsv(path.join(generatedDir, "invalid_provenance.csv"), provenanceHeader, invalidRows.map((row) => provenanceHeader.map((key) => key === "metadata" ? JSON.stringify(row.metadata) : row[key])))
writeCsv(path.join(generatedDir, "corrected_kwt_provenance.csv"), provenanceHeader, correctedRows.filter((row) => row.source_type === "KWT").map((row) => provenanceHeader.map((key) => key === "metadata" ? JSON.stringify(row.metadata) : row[key])))
writeCsv(path.join(generatedDir, "invalid_snapshots.csv"), snapshotHeader, phase61Manifest.ratingSnapshots.map((snapshot) => snapshotFields(snapshot, invalidRun, (ref) => malformedByGood.get(ref) ?? ref)))
writeCsv(path.join(generatedDir, "corrected_snapshots.csv"), snapshotHeader, correctedManifest.ratingSnapshots.map((snapshot) => snapshotFields(snapshot, correctedRun, (ref) => ref)))

const phase59 = fs.readFileSync(path.join(root, "supabase", "proposals", "20261018_handicap_review_snapshots.proposed.sql"), "utf8")
  .replace("  unique (calculation_run_id, course_id, difficulty, model_version)", "  constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key unique (calculation_run_id, course_id, difficulty, model_version)")
const phase65 = fs.readFileSync(path.join(root, "supabase", "proposals", "20261019_handicap_rating_snapshot_review_scope.proposed.sql"), "utf8")
const phase73 = fs.readFileSync(path.join(root, "supabase", "proposals", "20261020_handicap_quarantine_publication_gate.proposed.sql"), "utf8")
const setupSql = `create extension if not exists pgcrypto;\ncreate role anon nologin;\ncreate role authenticated nologin;\ncreate role service_role nologin;\ncreate table public.players (id uuid primary key);\n${phase59}\n${phase65}\n${phase73}`
fs.writeFileSync(path.join(generatedDir, "setup.sql"), setupSql)

const importSql = `begin;
create temporary table players_import (id uuid primary key);
${copy("players_import", "id", path.join(generatedDir, "players.csv"))}
insert into public.players (id) select id from players_import;
insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status)
values (${sqlLiteral(invalidRun)}, 'krys-handicap-approved-policy-v1', 'krys-course-rating-elite-lowest-12-v1', 'phase67-invalid-import', 'invalid batch retained for audit only', 'DRAFT');
create temp table invalid_provenance_import (like public.handicap_source_provenance including defaults);
${copy("invalid_provenance_import", provenanceHeader.join(","), path.join(generatedDir, "invalid_provenance.csv"))};
insert into public.handicap_source_provenance (${provenanceHeader.join(",")}) select ${provenanceHeader.join(",")} from invalid_provenance_import;
create temp table invalid_snapshots_import (like public.handicap_rating_snapshots including defaults);
${copy("invalid_snapshots_import", snapshotHeader.join(","), path.join(generatedDir, "invalid_snapshots.csv"))};
insert into public.handicap_rating_snapshots (${snapshotHeader.join(",")}) select ${snapshotHeader.join(",")} from invalid_snapshots_import;
commit;`
fs.writeFileSync(path.join(generatedDir, "invalid.sql"), importSql)

const recoverySql = `begin;
insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status)
values (${sqlLiteral(correctedRun)}, 'krys-handicap-approved-policy-v1', 'krys-course-rating-elite-lowest-12-v1', 'phase68-provenance-recovery-v1', 'course-rating evidence only; no player-index snapshots', 'DRAFT');
create temp table corrected_provenance_import (like public.handicap_source_provenance including defaults);
${copy("corrected_provenance_import", provenanceHeader.join(","), path.join(generatedDir, "corrected_kwt_provenance.csv"))};
insert into public.handicap_source_provenance (${provenanceHeader.join(",")}) select ${provenanceHeader.join(",")} from corrected_provenance_import;
insert into public.handicap_review_evidence (id, subject_kind, subject_key, source_ref, evidence_payload)
values (${sqlLiteral(uuidFromText(`phase74-evidence:${invalidRun}`))}, 'SOURCE_RECORD', ${sqlLiteral(invalidRun)}, 'phase67-invalid-batch', jsonb_build_object('reason', 'malformed KWT identity metadata', 'quarantine', true));
insert into public.handicap_review_decisions (id, evidence_id, subject_kind, subject_key, decision, rationale, decision_sequence)
values (${sqlLiteral(uuidFromText(`phase74-decision:${invalidRun}`))}, ${sqlLiteral(uuidFromText(`phase74-evidence:${invalidRun}`))}, 'SOURCE_RECORD', ${sqlLiteral(invalidRun)}, 'QUARANTINE', 'Invalid Phase 67 evidence remains audit-only.', 1);
create temp table corrected_snapshots_import (like public.handicap_rating_snapshots including defaults);
${copy("corrected_snapshots_import", snapshotHeader.join(","), path.join(generatedDir, "corrected_snapshots.csv"))};
insert into public.handicap_rating_snapshots (${snapshotHeader.join(",")}) select ${snapshotHeader.join(",")} from corrected_snapshots_import;
commit;`
fs.writeFileSync(path.join(generatedDir, "recovery.sql"), recoverySql)

let child
async function main() {
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  const logs = []
  child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  child.stdout.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr.on("data", (chunk) => logs.push(String(chunk)))
  await waitForReady(child, logs)
  run(psql, psqlArgs(["-f", path.join(generatedDir, "setup.sql")]), { timeout: 120000 })
  run(psql, psqlArgs(["-f", path.join(generatedDir, "invalid.sql")]), { timeout: 180000 })
  assertQuery("select count(*) from public.handicap_calculation_runs", "1", "invalid run")
  assertQuery("select count(*) from public.handicap_source_provenance", "14394", "invalid provenance")
  assertQuery("select count(*) from public.handicap_rating_snapshots", "169", "invalid snapshots")
  assertQuery("select count(*) from public.handicap_calculation_runs where publication_eligibility='QUARANTINED'", "1", "invalid run default quarantine")
  assertQuery("select count(*) from public.handicap_publishable_rating_snapshots", "0", "invalid rating view exclusion")
  assertQuery(`select count(*) from public.players where id='${playerId}'`, "1", "synthetic player fixture persisted")

  run(psql, psqlArgs(["-f", path.join(generatedDir, "recovery.sql")]), { timeout: 180000 })
  assertQuery("select count(*) from public.handicap_calculation_runs", "2", "recovery runs")
  assertQuery("select count(*) from public.handicap_source_provenance", "27944", "append-only provenance")
  assertQuery("select count(*) from public.handicap_rating_snapshots", "338", "append-only snapshots")
  assertQuery("select count(*) from public.handicap_review_decisions where decision='QUARANTINE'", "1", "quarantine decision")
  assertQuery(`select count(*) from public.handicap_rating_snapshots where calculation_run_id='${correctedRun}' and publication_status <> 'UNPUBLISHED'`, "0", "corrected unpublished")
  assertQuery(`select count(*) from public.players where id='${playerId}'`, "1", "synthetic player fixture survives recovery")
  assertQuery("select count(*) from public.handicap_publishable_rating_snapshots", "0", "corrected unpublished view exclusion")
  assertQuery("select count(*) from public.handicap_publishable_index_snapshots", "0", "no index view rows")
  assertQuery("select has_table_privilege('anon','public.handicap_publishable_rating_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_publishable_index_snapshots','select')::int::text", "00", "view client access")
  assertQuery("select has_table_privilege('service_role','public.handicap_publishable_rating_snapshots','select')::int::text || has_table_privilege('service_role','public.handicap_publishable_index_snapshots','select')::int::text", "11", "view service access")
  assertQuery("select count(*) from pg_class where relname in ('handicap_calculation_runs','handicap_rating_snapshots','handicap_index_snapshots','handicap_review_evidence','handicap_review_decisions','handicap_source_provenance') and relrowsecurity", "6", "RLS tables")

  const invalidAttempt = path.join(generatedDir, "invalid_attempt.sql")
  fs.writeFileSync(invalidAttempt, `begin; insert into public.handicap_calculation_runs (id,policy_version,model_version,source_package_ref,chronology_policy,status) values ('00000000-0000-4000-8000-000000000077','x','x','x','x','DRAFT'); insert into public.handicap_source_provenance (id,source_fingerprint,source_type,source_ref) values ('00000000-0000-4000-8000-000000000078','KWT|bad','KWT','bad'); insert into public.handicap_rating_snapshots (id,calculation_run_id,course_id,difficulty,sample_size,distinct_canonical_player_count,rating_confidence,model_version,publication_status,review_scope) values ('00000000-0000-4000-8000-000000000079','00000000-0000-4000-8000-000000000077','BHE','easy',1,1,'ready','x','UNPUBLISHED','INVALID'); commit;`)
  const invalidAttemptResult = spawnSync(psql, psqlArgs(["-f", invalidAttempt]), { encoding: "utf8", windowsHide: true })
  if (invalidAttemptResult.status === 0) throw new Error("invalid review scope unexpectedly committed")
  assertQuery("select count(*) from public.handicap_calculation_runs", "2", "invalid review scope rollback")
  assertQuery("select count(*) from public.handicap_source_provenance", "27944", "invalid review scope provenance rollback")

  run(psql, psqlArgs(["-c", `insert into public.handicap_calculation_runs (id,policy_version,model_version,source_package_ref,chronology_policy,status,publication_eligibility) values ('${approvedRun}','approved','approved','approved','EXACT','COMPLETED','ELIGIBLE'); insert into public.handicap_source_provenance (id,source_fingerprint,source_type,source_ref,original_player_name,canonical_player_id,metadata) values ('00000000-0000-4000-8000-000000000080','KWT|approved|101|BHE|1','KWT','approved','Player','${playerId}','{"source_player_id":"101"}'); insert into public.handicap_rating_snapshots (id,calculation_run_id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,source_evidence_refs,publication_status,review_scope) values ('${approvedRating}','${approvedRun}','BHE','easy',-20,8.515,50,20,'ready','krys-handicap-candidate-a-v1','2026-10-20','approved',array['KWT|approved|101|BHE|1']::text[],'PUBLISHED','KWT_ONLY'); insert into public.handicap_index_snapshots (id,calculation_run_id,canonical_player_id,source_round_ids,rating_snapshot_ids,rating_version_ids,differential_model_version,latest_ten_source_round_ids,best_five_source_round_ids,resulting_index,chronology_confidence,publication_status) values ('${approvedIndex}','${approvedRun}','${playerId}',array['KWT|approved|101|BHE|1']::text[],array['${approvedRating}'::uuid]::uuid[],array['${approvedRating}']::text[],'krys-handicap-candidate-a-v1',array['KWT|approved|101|BHE|1']::text[],array['KWT|approved|101|BHE|1']::text[],2.4,'EXACT','PUBLISHED');`]), { timeout: 120000 })
  assertQuery("select count(*) from public.handicap_publishable_rating_snapshots", "1", "eligible rating view")
  assertQuery("select count(*) from public.handicap_publishable_index_snapshots", "1", "eligible index view")

  const mutation = spawnSync(psql, psqlArgs(["-c", `update public.handicap_source_provenance set original_player_name='MUTATION' where id='00000000-0000-4000-8000-000000000080';`]), { encoding: "utf8", windowsHide: true })
  if (mutation.status === 0) throw new Error("append-only mutation unexpectedly succeeded")
  assertQuery("select original_player_name from public.handicap_source_provenance where id='00000000-0000-4000-8000-000000000080'", "Player", "append-only preservation")

  const repeat = spawnSync(psql, psqlArgs(["-f", path.join(generatedDir, "recovery.sql")]), { encoding: "utf8", windowsHide: true })
  if (repeat.status === 0) throw new Error("repeat recovery unexpectedly committed")
  assertQuery("select count(*) from public.handicap_source_provenance", "27945", "repeat recovery rollback")
  assertQuery("select count(*) from public.handicap_rating_snapshots", "339", "repeat snapshot rollback")

  const options = query("select coalesce(array_to_string(reloptions, ','), '') from pg_class where relname='handicap_publishable_rating_snapshots'")
  console.log(JSON.stringify({
    runtime: { postgres: "17.11", connection: connectionHost, port },
    invalidBatch: { runs: 1, provenance: 14394, snapshots: 169, defaultQuarantined: true, officialRatingRows: 0 },
    correctedBatch: { additionalKwtProvenance: 13550, snapshots: 169, unpublished: true, officialRatingRows: 0, officialIndexRows: 0 },
    approvedSyntheticRows: { officialRatingRows: 1, officialIndexRows: 1 },
    safeguards: { invalidReviewScopeRollback: true, appendOnlyMutationRejected: true, repeatRecoveryRejected: true, clientViewAccess: false, serviceRoleViewAccess: true, rlsTables: 6, viewOptions: options },
  }, null, 2))
}

main().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1 }).finally(async () => {
  if (child && child.exitCode === null) child.kill()
  await new Promise((resolve) => setTimeout(resolve, 500))
  fs.rmSync(workDir, { recursive: true, force: true })
})
