import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import Papa from "papaparse"
import { buildPublicationPlan } from "../lib/handicap/publicationPreparation.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const psql = path.join(runtimeBin, "psql.exe")
const port = Number(process.env.KRYS_PG_PORT ?? "55499")
const workDir = path.join(root, `.phase107-local-${Date.now()}`)
const dataDir = path.join(workDir, "data")
const sqlFile = path.join(workDir, "transaction.sql")
const host = "127.0.0.1"
let child

const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`)
  return result.stdout ?? ""
}

const psqlArgs = (extra) => ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra]
const query = (sql) => run(psql, psqlArgs(["-At", "-c", sql])).replaceAll("\r\n", "\n").trim()
const assertQuery = (sql, expected, label) => {
  const actual = query(sql)
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
const expectedFailure = (sql, label) => {
  const result = spawnSync(psql, psqlArgs(["-c", sql]), { encoding: "utf8", windowsHide: true })
  if (result.status === 0) throw new Error(`${label}: statement unexpectedly succeeded`)
}
const expectedFileFailure = (filePath, label) => {
  const result = spawnSync(psql, psqlArgs(["-f", filePath]), { encoding: "utf8", windowsHide: true })
  if (result.status === 0) throw new Error(`${label}: script unexpectedly succeeded`)
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

const file = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")
const csv = (relativePath) => {
  const result = Papa.parse(file(relativePath), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${relativePath}: ${JSON.stringify(result.errors)}`)
  return result.data
}
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex")
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`
const sqlUuid = (value) => `${sqlText(value)}::uuid`
const sqlTextArray = (values) => `ARRAY[${values.map(sqlText).join(",")}]::text[]`
const sqlUuidArray = (values) => `ARRAY[${values.map(sqlUuid).join(",")}]::uuid[]`
const sqlJsonb = (value) => `${sqlText(JSON.stringify(value))}::jsonb`
const json = (value) => JSON.parse(value)

function sourceSchema() {
  const phase59 = file("supabase/proposals/20261018_handicap_review_snapshots.proposed.sql")
    .replace("  unique (calculation_run_id, course_id, difficulty, model_version)", "  constraint handicap_rating_snapshots_calculation_run_id_course_id_diff_key unique (calculation_run_id, course_id, difficulty, model_version)")
  const phase65 = file("supabase/proposals/20261019_handicap_rating_snapshot_review_scope.proposed.sql")
  const phase73 = file("supabase/proposals/20261020_handicap_quarantine_publication_gate.proposed.sql")
  const phase96 = file("supabase/proposals/20261020_handicap_official_kwt_sequence_publication_gate.proposed.sql")
  const phase101 = file("supabase/proposals/20261020_handicap_kwt_effective_period_publication_gate.proposed.sql")
  const phase107 = file("supabase/proposals/20261020_handicap_player_read_rpc.proposed.sql")
  const playerReadPrerequisites = `
create schema auth;
create table auth.identities (user_id uuid not null, provider text not null, identity_data jsonb not null);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function public.resolve_canonical_player_id(p_player_id uuid)
returns uuid language sql immutable as $$ select p_player_id $$;
create or replace function public.current_user_canonical_player_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(p.id order by p.id))[1] else null end
  from auth.identities i
  join public.players p on p.discord_id = coalesce(i.identity_data ->> 'provider_id', i.identity_data ->> 'sub')
  where i.user_id = auth.uid() and i.provider = 'discord'
$$;
revoke all on function public.current_user_canonical_player_id() from public, anon;
grant execute on function public.current_user_canonical_player_id() to authenticated;
`
  return `
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.players (id uuid primary key, screen_name text not null, discord_id text not null unique);
${playerReadPrerequisites}
${phase59}
${phase65}
${phase73}
${phase96}
${phase101}
${phase107}
grant usage on schema public to service_role;
`
}

function readPackage() {
  const ratingRows = csv("docs/handicap/phase104/rating_snapshot_import_rows.csv")
  const indexRows = csv("docs/handicap/phase104/index_snapshot_import_rows.csv")
  const provenanceRows = csv("docs/handicap/phase68/handicap_source_provenance_import.csv")
  const snapshotMapRows = csv("docs/handicap/phase104/snapshot_id_map.csv")
  const phase98ToPhase104 = Object.fromEntries(snapshotMapRows.map((row) => [row.source_phase98_snapshot_id, row.phase104_snapshot_id]))
  const phase101Rows = csv("docs/handicap/phase101/rating_approval_manifest.csv")
  const phase101ByPhase98 = new Map(phase101Rows.map((row) => [row.snapshot_id, row]))
  const phase104ToPhase98 = Object.fromEntries(snapshotMapRows.map((row) => [row.phase104_snapshot_id, row.source_phase98_snapshot_id]))
  const sourceRunId = ratingRows[0].calculation_run_id
  const phase104Manifest = JSON.parse(file("docs/handicap/phase104/calculation_run_manifest.json"))
  const players = new Map()
  for (const row of provenanceRows) {
    if (row.source_type === "KWT" && row.canonical_player_id && !players.has(row.canonical_player_id)) {
      players.set(row.canonical_player_id, row.original_player_name || `synthetic-${row.canonical_player_id}`)
    }
  }
  if (players.size !== 201) throw new Error(`expected 201 canonical players, got ${players.size}`)
  const ratings = ratingRows.map((row) => {
    const phase101 = phase101ByPhase98.get(phase104ToPhase98[row.id])
    if (!phase101) throw new Error(`missing Phase 101 review row for ${row.id}`)
    return {
      id: row.id,
      calculationRunId: sourceRunId,
      courseId: row.course_id,
      difficulty: row.difficulty,
      courseRating: Number(row.course_rating),
      slope: Number(row.slope),
      sampleSize: Number(row.sample_size),
      distinctPlayers: Number(row.distinct_canonical_player_count),
      ratingConfidence: row.rating_confidence,
      modelVersion: row.model_version,
      effectiveFrom: null,
      effectivePeriod: row.effective_period,
      sourceEvidenceRefs: json(row.source_evidence_refs),
      publicationStatus: row.publication_status,
      reviewScope: row.review_scope,
      recommendation: phase101.recommendation,
    }
  })
  const indexes = indexRows.map((row) => ({
    id: row.id,
    calculationRunId: sourceRunId,
    canonicalPlayerId: row.canonical_player_id,
    sourceRoundIds: json(row.source_round_ids),
    ratingSnapshotIds: json(row.rating_snapshot_ids),
    ratingVersionIds: json(row.rating_version_ids),
    differentialModelVersion: row.differential_model_version,
    latestTenSourceRoundIds: json(row.latest_ten_source_round_ids),
    bestFiveSourceRoundIds: json(row.best_five_source_round_ids),
    resultingIndex: Number(row.resulting_index),
    chronologyConfidence: row.chronology_confidence,
    publicationStatus: row.publication_status,
  }))
  const approvalHash = sha256("phase107-local-explicit-approval-fixture")
  const approval = {
    schemaVersion: "phase107-publication-approval-v1",
    sourceRunId,
    approvalManifestSha256: approvalHash,
    ratingManifestSha256: sha256(file("docs/handicap/phase101/rating_approval_manifest.csv")),
    diagnosticManifestSha256: sha256(file("docs/handicap/phase101/rating_approval_manifest.csv")),
    indexManifestSha256: sha256(file("docs/handicap/phase104/index_snapshot_import_rows.csv")),
    ratingApprovals: ratings.map((row) => ({
      snapshotId: row.id,
      decision: "APPROVE",
      approvalRef: `local-test-review:${row.id}`,
      ...(row.recommendation === "APPROVE_AFTER_DIAGNOSTIC_REVIEW" ? { diagnosticDisposition: "LOCAL_TEST_NO_DEFECT_FOUND" } : {}),
    })),
    diagnosticApprovals: ratings.filter((row) => row.recommendation === "APPROVE_AFTER_DIAGNOSTIC_REVIEW").map((row) => ({ snapshotId: row.id, decision: "APPROVE", disposition: "LOCAL_TEST_NO_DEFECT_FOUND", approvalRef: `local-test-diagnostic:${row.id}` })),
    indexApprovals: indexes.map((row) => ({ snapshotId: row.id, decision: "APPROVE", approvalRef: `local-test-review:${row.id}` })),
  }
  return { sourceRunId, phase104Manifest, provenanceRows, players, ratings, indexes, approval, phase98ToPhase104 }
}

function seedSql(pkg) {
  const run = pkg.phase104Manifest.calculationRun
  const playerSql = [...pkg.players].map(([id, name]) => `insert into public.players (id, screen_name, discord_id) values (${sqlUuid(id)}, ${sqlText(name)}, ${sqlText(`phase107-player-${id}`)});`).join("\n")
  const identityPlayerId = [...pkg.players.keys()][0]
  const identityUserId = "99999999-9999-4999-8999-999999999999"
  const identitySql = `insert into auth.identities (user_id, provider, identity_data) values (${sqlUuid(identityUserId)}, 'discord', ${sqlJsonb({ provider_id: `phase107-player-${identityPlayerId}` })});`
  const runSql = `insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility, metadata) values (${sqlUuid(run.id)}, ${sqlText(run.policy_version)}, ${sqlText(run.model_version)}, ${sqlText(run.source_package_ref)}, ${sqlText(run.chronology_policy)}, ${sqlText(run.status)}, ${sqlText(run.publication_eligibility)}, ${sqlJsonb(run.metadata)});`
  const provenanceSql = pkg.provenanceRows.map((row) => {
    const metadata = JSON.parse(row.metadata || "{}");
    return `insert into public.handicap_source_provenance (id, source_fingerprint, source_type, source_ref, source_date, source_season, source_week, original_player_name, canonical_player_id, original_course_label, original_course_code, metadata) values (${sqlUuid(row.id)}, ${sqlText(row.source_fingerprint)}, ${sqlText(row.source_type)}, ${sqlText(row.source_ref)}, null, ${row.source_season ? Number(row.source_season) : "null"}, ${row.source_week ? Number(row.source_week) : "null"}, ${row.original_player_name ? sqlText(row.original_player_name) : "null"}, ${row.canonical_player_id ? sqlUuid(row.canonical_player_id) : "null"}, ${row.original_course_label ? sqlText(row.original_course_label) : "null"}, ${row.original_course_code ? sqlText(row.original_course_code) : "null"}, ${sqlJsonb(metadata)});`
  }).join("\n")
  const ratingSql = pkg.ratings.map((row) => `insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) values (${sqlUuid(row.id)}, ${sqlUuid(row.calculationRunId)}, ${sqlText(row.courseId)}, ${sqlText(row.difficulty)}, ${row.courseRating}, ${row.slope}, ${row.sampleSize}, ${row.distinctPlayers}, ${sqlText(row.ratingConfidence)}, ${sqlText(row.modelVersion)}, null, ${sqlText(row.effectivePeriod)}, ${sqlTextArray(row.sourceEvidenceRefs)}, ${sqlText(row.publicationStatus)}, ${sqlText(row.reviewScope)});`).join("\n")
  const indexSql = pkg.indexes.map((row) => `insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status) values (${sqlUuid(row.id)}, ${sqlUuid(row.calculationRunId)}, ${sqlUuid(row.canonicalPlayerId)}, ${sqlTextArray(row.sourceRoundIds)}, ${sqlUuidArray(row.ratingSnapshotIds)}, ${sqlTextArray(row.ratingVersionIds)}, ${sqlText(row.differentialModelVersion)}, ${sqlTextArray(row.latestTenSourceRoundIds)}, ${sqlTextArray(row.bestFiveSourceRoundIds)}, ${row.resultingIndex}, ${sqlText(row.chronologyConfidence)}, ${sqlText(row.publicationStatus)});`).join("\n")
  return `begin;\n${playerSql}\n${identitySql}\n${runSql}\n${provenanceSql}\n${ratingSql}\n${indexSql}\ncommit;`
}

function publicationSql(plan, label, invalidCanonicalId = null) {
  const run = plan.run
  const runId = plan.publicationRunId
  const runSql = `insert into public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility, metadata) values (${sqlUuid(runId)}, ${sqlText(run.policyVersion)}, ${sqlText(run.modelVersion)}, ${sqlText(`phase107-${label}`)}, ${sqlText(run.chronologyPolicy)}, ${sqlText(run.status)}, ${sqlText(run.publicationEligibility)}, ${sqlJsonb(run.metadata)});`
  const ratingSql = plan.ratingSnapshots.map((row) => `insert into public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) values (${sqlUuid(row.id)}, ${sqlUuid(row.calculationRunId)}, ${sqlText(row.courseId)}, ${sqlText(row.difficulty)}, ${row.courseRating}, ${row.slope}, ${row.sampleSize}, ${row.distinctPlayers}, ${sqlText(row.ratingConfidence)}, ${sqlText(row.modelVersion)}, null, ${sqlText(row.effectivePeriod)}, ${sqlTextArray(row.sourceEvidenceRefs)}, ${sqlText(row.publicationStatus)}, ${sqlText(row.reviewScope)});`).join("\n")
  const indexSql = plan.indexSnapshots.map((row, index) => `insert into public.handicap_index_snapshots (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status) values (${sqlUuid(row.id)}, ${sqlUuid(row.calculationRunId)}, ${sqlUuid(invalidCanonicalId && index === 0 ? invalidCanonicalId : row.canonicalPlayerId)}, ${sqlTextArray(row.sourceRoundIds)}, ${sqlUuidArray(row.ratingSnapshotIds)}, ${sqlTextArray(row.ratingVersionIds)}, ${sqlText(row.differentialModelVersion)}, ${sqlTextArray(row.latestTenSourceRoundIds)}, ${sqlTextArray(row.bestFiveSourceRoundIds)}, ${row.resultingIndex}, ${sqlText(row.chronologyConfidence)}, ${sqlText(row.publicationStatus)});`).join("\n")
  return `begin;\nselect pg_advisory_xact_lock(hashtext('krys-leagues:phase107:publication'));\n${runSql}\n${ratingSql}\n${indexSql}\ncommit;`
}

async function main() {
  const pkg = readPackage()
  fs.rmSync(workDir, { recursive: true, force: true })
  fs.mkdirSync(workDir, { recursive: true })
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  const logs = []
  child = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  child.stdout.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr.on("data", (chunk) => logs.push(String(chunk)))
  try {
    await waitForReady(logs)
    run(psql, psqlArgs(["-c", sourceSchema()]), { timeout: 180000 })
    fs.writeFileSync(sqlFile, seedSql(pkg))
    run(psql, psqlArgs(["-f", sqlFile]), { timeout: 180000 })
    assertQuery("select count(*) from public.handicap_source_provenance", "14394", "seed provenance")
    assertQuery("select count(*) from public.handicap_rating_snapshots", "72", "seed ratings")
    assertQuery("select count(*) from public.handicap_index_snapshots", "157", "seed indexes")
    assertQuery("select count(*) from public.handicap_publishable_rating_snapshots", "0", "draft ratings hidden")
    assertQuery("select count(*) from public.handicap_publishable_index_snapshots", "0", "draft indexes hidden")

    const approvalForRollback = { ...pkg.approval, approvalManifestSha256: sha256("phase107-rollback-test") }
    const rollbackPlan = buildPublicationPlan({ sourceRunId: pkg.sourceRunId, ratingRows: pkg.ratings, indexRows: pkg.indexes, approval: approvalForRollback, ratingSnapshotIdAliases: pkg.phase98ToPhase104 })
    fs.writeFileSync(sqlFile, publicationSql(rollbackPlan, "rollback-test", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
    expectedFileFailure(sqlFile, "invalid canonical publication")
    assertQuery("select count(*) from public.handicap_calculation_runs", "1", "atomic rollback run")
    assertQuery("select count(*) from public.handicap_rating_snapshots", "72", "atomic rollback ratings")
    assertQuery("select count(*) from public.handicap_index_snapshots", "157", "atomic rollback indexes")

    const plan = buildPublicationPlan({ sourceRunId: pkg.sourceRunId, ratingRows: pkg.ratings, indexRows: pkg.indexes, approval: pkg.approval, ratingSnapshotIdAliases: pkg.phase98ToPhase104 })
    fs.writeFileSync(sqlFile, publicationSql(plan, "approved-local-test"))
    run(psql, psqlArgs(["-f", sqlFile]), { timeout: 180000 })
    assertQuery("select count(*) from public.handicap_calculation_runs", "2", "published lineage runs")
    assertQuery(`select count(*) from public.handicap_rating_snapshots where calculation_run_id=${sqlUuid(plan.publicationRunId)} and publication_status='PUBLISHED'`, "72", "published rating successors")
    assertQuery(`select count(*) from public.handicap_index_snapshots where calculation_run_id=${sqlUuid(plan.publicationRunId)} and publication_status='PUBLISHED'`, "157", "published index successors")
    assertQuery(`select count(*) from public.handicap_publishable_rating_snapshots where calculation_run_id=${sqlUuid(plan.publicationRunId)}`, "72", "publishable rating view")
    assertQuery(`select count(*) from public.handicap_publishable_index_snapshots where calculation_run_id=${sqlUuid(plan.publicationRunId)}`, "157", "publishable index view")
    assertQuery(`select count(*) from public.handicap_rating_snapshots where calculation_run_id=${sqlUuid(pkg.sourceRunId)} and publication_status='UNPUBLISHED'`, "72", "draft rating preservation")
    assertQuery(`select count(*) from public.handicap_index_snapshots where calculation_run_id=${sqlUuid(pkg.sourceRunId)} and publication_status='UNPUBLISHED'`, "157", "draft index preservation")
    assertQuery(`select count(*) from public.handicap_index_snapshots where calculation_run_id=${sqlUuid(plan.publicationRunId)} and exists (select 1 from unnest(source_round_ids) r(ref) where ref like 'THE_WEEKLY%')`, "0", "Weekly personal-index exclusion")
    assertQuery(`select count(*) from public.handicap_index_snapshots where calculation_run_id=${sqlUuid(plan.publicationRunId)} and rating_snapshot_ids[1] = ${sqlUuid(pkg.ratings[0].id)}`, "0", "published rating successor references")

    fs.writeFileSync(sqlFile, publicationSql(plan, "duplicate-test"))
    expectedFileFailure(sqlFile, "duplicate publication")
    assertQuery("select count(*) from public.handicap_calculation_runs", "2", "duplicate publication rollback")

    const playerId = [...pkg.players.keys()][0]
    const otherPlayerId = [...pkg.players.keys()][1]
    const userId = "99999999-9999-4999-8999-999999999999"
    assertQuery(`set role authenticated; select set_config('request.jwt.claim.sub',${sqlText(userId)},false) is not null; select (public.get_published_handicap_for_player(${sqlUuid(playerId)}) ->> 'canonical_player_id') = ${sqlText(playerId)}; reset role;`, "t\nt", "authorized player read")
    assertQuery(`set role authenticated; select set_config('request.jwt.claim.sub',${sqlText(userId)},false) is not null; select public.get_published_handicap_for_player(${sqlUuid(otherPlayerId)}) is null; reset role;`, "t\nt", "cross-player denial")
    expectedFailure(`set role anon; select public.get_published_handicap_for_player(${sqlUuid(playerId)});`, "anonymous RPC denial")
    expectedFailure("set role authenticated; select count(*) from public.handicap_publishable_index_snapshots;", "authenticated direct view denial")
    assertQuery("select has_table_privilege('anon','public.handicap_publishable_index_snapshots','select')::int::text || has_table_privilege('authenticated','public.handicap_publishable_index_snapshots','select')::int::text", "00", "client view grants")
    assertQuery("select has_function_privilege('anon','public.get_published_handicap_for_player(uuid)','execute')::int::text || has_function_privilege('authenticated','public.get_published_handicap_for_player(uuid)','execute')::int::text", "01", "RPC execute grants")
    assertQuery("set role service_role; select count(*) from public.handicap_publishable_index_snapshots; reset role;", "157", "service-role publication view access")
    assertQuery("select count(*) from public.handicap_publishable_index_snapshots", "157", "postgres publication reader")
    console.log(JSON.stringify({
      localPostgres: "PASS",
      port,
      sourceRun: pkg.sourceRunId,
      sourceProvenance: 14394,
      sourceRatings: 72,
      sourceIndexes: 157,
      publicationRun: plan.publicationRunId,
      publishedRatings: 72,
      publishedIndexes: 157,
      originalDraftPreserved: true,
      atomicRollback: true,
      duplicatePublicationRejected: true,
      authorizedPlayerRead: true,
      crossPlayerDenied: true,
      anonymousDenied: true,
      directClientViewDenied: true,
      weeklyPersonalIndexExclusion: true,
    }, null, 2))
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
