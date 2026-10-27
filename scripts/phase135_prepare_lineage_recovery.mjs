import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const outDir = path.join(root, "docs", "handicap", "phase135")
const p134 = path.join(root, "docs", "handicap", "phase134")
const p121 = path.join(root, "docs", "handicap", "phase121")
const p126 = path.join(root, "docs", "handicap", "phase126")
const p101 = path.join(root, "docs", "handicap", "phase101")
const p68 = path.join(root, "docs", "handicap", "phase68")
const p117 = path.join(root, "docs", "handicap", "phase117")
const productionProject = "jfbndcwdsvsjgnzwvexp"
const batchSha = "52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B"
const priorRunCount = 4
const priorProvenanceCount = 28672
const priorRatingCount = 410
const priorIndexCount = 157
const newRunId = "8f135000-0000-5000-8000-000000000135"
const modelVersion = "krys-course-rating-elite-lowest-12-v1"
const sourceScope = "KWT_ONLY"

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
const readCsv = (file) => {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${file}: ${JSON.stringify(parsed.errors)}`)
  return parsed.data
}
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
const writeCsv = (file, rows) => fs.writeFileSync(file, `${Papa.unparse(rows, { newline: "\n" })}\n`, "utf8")
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`
const uuidFromText = (value) => {
  const hex = crypto.createHash("sha256").update(value).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}
const stableHash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").toUpperCase()
const arr = (value) => value ? JSON.parse(value) : []
const normalizeCourseId = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()

fs.mkdirSync(outDir, { recursive: true })
const phase121Candidates = readCsv(path.join(p121, "rating_snapshot_candidates.csv"))
const phase121ById = new Map(phase121Candidates.map((row) => [row.snapshot_id, row]))
const blockers = readCsv(path.join(p134, "rating_snapshot_blockers.csv"))
const reconciliation = readCsv(path.join(p134, "rating_snapshot_reconciliation.csv"))
const periods = new Map(readCsv(path.join(p101, "season_week_effective_period_manifest.csv")).map((row) => [normalizeCourseId(row.course_id), row]))
const sourceFiles = [path.join(p68, "handicap_source_provenance_import.csv"), path.join(p117, "handicap_source_provenance_import.csv")]
const provenance = sourceFiles.flatMap((file) => readCsv(file))
const uniqueProvenance = new Map()
for (const row of provenance) if (!uniqueProvenance.has(row.source_fingerprint)) uniqueProvenance.set(row.source_fingerprint, row)

const sourcePeriods = new Map()
for (const row of uniqueProvenance.values()) {
  if (row.source_type !== "KWT" || !row.source_season || !row.source_week) continue
  let metadata = {}
  try { metadata = JSON.parse(row.metadata || "{}") } catch { continue }
  const courseId = row.original_course_label || metadata.course_id
  if (!courseId) continue
  const key = normalizeCourseId(courseId)
  if (!sourcePeriods.has(key)) sourcePeriods.set(key, new Set())
  sourcePeriods.get(key).add(`S${row.source_season}W${String(row.source_week).padStart(2, "0")}`)
}
const periodFor = (courseId) => {
  const manifestPeriod = periods.get(normalizeCourseId(courseId))
  if (manifestPeriod?.proposed_effective_period) return manifestPeriod.proposed_effective_period
  const observed = [...(sourcePeriods.get(normalizeCourseId(courseId)) || [])].sort((a, b) => {
    const [aSeason, aWeek] = a.slice(1).split("W").map(Number)
    const [bSeason, bWeek] = b.slice(1).split("W").map(Number)
    return aSeason - bSeason || aWeek - bWeek
  })
  if (!observed.length) return null
  return `KWT ${observed[0]} through ${observed.at(-1)}; observed ${observed.join(", ")}; OFFICIAL_KWT_SEQUENCE; calendar date unavailable`
}

const successorRows = []
const lineageExceptions = []
for (const blocker of blockers) {
  const candidate = phase121ById.get(blocker.local_snapshot_id)
  if (!candidate) throw new Error(`Missing Phase121 candidate ${blocker.local_snapshot_id}`)
  const sourceRows = [...uniqueProvenance.values()].filter((row) => {
    let metadata = {}
    try { metadata = JSON.parse(row.metadata || "{}") } catch { /* reject below through missing match */ }
    const courseId = row.original_course_label || metadata.course_id
    const difficulty = row.difficulty || metadata.difficulty
    return row.source_type === "KWT" && courseId === candidate.course_id && difficulty === candidate.difficulty
  }).sort((a, b) => a.source_fingerprint.localeCompare(b.source_fingerprint))
  const sourceRefs = sourceRows.map((row) => row.source_fingerprint)
  const distinctPlayers = new Set(sourceRows.map((row) => row.canonical_player_id).filter(Boolean))
  const reasons = []
  if (sourceRefs.length !== Number(candidate.sample_size)) reasons.push(`SOURCE_COUNT_MISMATCH:${sourceRefs.length}:${candidate.sample_size}`)
  if (distinctPlayers.size !== Number(candidate.distinct_players)) reasons.push(`DISTINCT_PLAYER_MISMATCH:${distinctPlayers.size}:${candidate.distinct_players}`)
  if (!sourceRefs.length || sourceRows.some((row) => !row.canonical_player_id || row.source_type !== "KWT")) reasons.push("INCOMPLETE_KWT_PROVENANCE")
  const period = periodFor(candidate.course_id)
  if (!period) reasons.push("MISSING_SEASON_WEEK_PERIOD")
  if (reasons.length) {
    lineageExceptions.push({
      local_snapshot_id: candidate.snapshot_id,
      course_id: candidate.course_id,
      difficulty: candidate.difficulty,
      candidate_sample_size: candidate.sample_size,
      recovered_source_ref_count: sourceRefs.length,
      candidate_distinct_players: candidate.distinct_players,
      recovered_distinct_players: distinctPlayers.size,
      source_scope: sourceScope,
      status: "BLOCKED_LINEAGE_MISMATCH",
      reasons: reasons.join(";"),
    })
    continue
  }
  const snapshotId = uuidFromText(`phase135-successor-rating:${newRunId}:${candidate.course_id}:${candidate.difficulty}:${candidate.course_rating}:${candidate.slope}:${stableHash(sourceRefs)}`)
  successorRows.push({
    local_snapshot_id: candidate.snapshot_id,
    successor_snapshot_id: snapshotId,
    calculation_run_id: newRunId,
    course_id: candidate.course_id,
    difficulty: candidate.difficulty,
    course_rating: candidate.course_rating,
    slope: candidate.slope,
    sample_size: candidate.sample_size,
    distinct_canonical_player_count: candidate.distinct_players,
    rating_confidence: "ready",
    model_version: modelVersion,
    effective_from: "",
    effective_period: period,
    source_evidence_refs: JSON.stringify(sourceRefs),
    source_ref_count: sourceRefs.length,
    source_refs_sha256: stableHash(sourceRefs),
    review_scope: sourceScope,
    publication_status: "UNPUBLISHED",
    lineage_status: "VERIFIED_EXISTING_KWT_PROVENANCE",
    predecessor_production_value: blocker.production_rating,
    predecessor_production_slope: blocker.production_slope,
  })
}
if (successorRows.length + lineageExceptions.length !== blockers.length) throw new Error(`Lineage accounting mismatch: ${successorRows.length} recovered + ${lineageExceptions.length} blocked != ${blockers.length} blockers`)

const targetByLocalId = new Map()
for (const row of reconciliation) {
  if (row.status === "EXACT_EXISTING_PRODUCTION") targetByLocalId.set(row.local_snapshot_id, row.production_snapshot_id)
}
for (const row of successorRows) targetByLocalId.set(row.local_snapshot_id, row.successor_snapshot_id)
const expectedCompleteMappings = 78 - lineageExceptions.length
if (targetByLocalId.size !== expectedCompleteMappings) throw new Error(`Expected ${expectedCompleteMappings} complete rating mappings, got ${targetByLocalId.size}`)

const phase126Rows = readCsv(path.join(p126, "player_index_candidates.csv"))
const revalidatedIndexes = phase126Rows.map((row) => {
  const oldRatingIds = arr(row.rating_snapshot_ids)
  const remapped = oldRatingIds.map((id) => targetByLocalId.get(id) || "")
  const missing = remapped.some((id) => !id)
  const changed = !missing && remapped.some((id, index) => id !== oldRatingIds[index])
  if (Number(row.weekly_rows_used) !== 0 || row.source_scope !== sourceScope) throw new Error(`Invalid personal-index source scope for ${row.snapshot_id}`)
  return {
    snapshot_id: row.snapshot_id,
    canonical_player_id: row.canonical_player_id,
    canonical_screen_name: row.canonical_screen_name,
    resulting_index: row.resulting_index,
    golf_display_index: row.golf_display_index,
    handicap_status: row.handicap_status,
    qualifying_scorecard_count: row.qualifying_scorecard_count,
    active_round_count: row.active_round_count,
    chronology_confidence: row.chronology_confidence,
    source_scope: row.source_scope,
    weekly_rows_used: row.weekly_rows_used,
    old_rating_snapshot_ids: JSON.stringify(oldRatingIds),
    revalidated_rating_snapshot_ids: JSON.stringify(remapped),
    validation_status: missing ? "BLOCKED_MISSING_RATING_LINEAGE" : "REVALIDATED",
    dependency_mapping_changed: missing ? "BLOCKED_MISSING_RATING_LINEAGE" : changed ? "SUCCESSOR_OR_PRODUCTION_ID_REMAP" : "UNCHANGED_PRODUCTION_ID",
    calculation_value_changed: "NO",
    publication_status: "UNPUBLISHED",
    publication_decision: "PENDING_EXPLICIT_APPROVAL",
  }
})

const exactPending = reconciliation.filter((row) => row.batch_scope === "PENDING_73" && row.status === "EXACT_EXISTING_PRODUCTION").length
const blockedPending = reconciliation.filter((row) => row.batch_scope === "PENDING_73" && row.status !== "EXACT_EXISTING_PRODUCTION").length
const ownerExact = reconciliation.filter((row) => row.batch_scope === "PRIOR_OWNER_APPROVAL_5" && row.status === "EXACT_EXISTING_PRODUCTION").length
const ownerSuccessor = reconciliation.filter((row) => row.batch_scope === "PRIOR_OWNER_APPROVAL_5" && row.status !== "EXACT_EXISTING_PRODUCTION").length
const pendingSuccessor = reconciliation.filter((row) => row.batch_scope === "PENDING_73" && row.status !== "EXACT_EXISTING_PRODUCTION" && targetByLocalId.has(row.local_snapshot_id)).length
const pendingLineageBlocked = reconciliation.filter((row) => row.batch_scope === "PENDING_73" && !targetByLocalId.has(row.local_snapshot_id)).length
const blockedIndexes = revalidatedIndexes.filter((row) => row.validation_status !== "REVALIDATED").length
const official = revalidatedIndexes.filter((row) => row.validation_status === "REVALIDATED" && row.handicap_status === "OFFICIAL_ELIGIBLE").length
const provisional = revalidatedIndexes.filter((row) => row.validation_status === "REVALIDATED" && row.handicap_status === "PROVISIONAL").length
const remappedIndexes = revalidatedIndexes.filter((row) => row.validation_status === "REVALIDATED" && row.dependency_mapping_changed !== "UNCHANGED_PRODUCTION_ID").length

writeCsv(path.join(outDir, "successor_rating_snapshots.csv"), successorRows)
writeCsv(path.join(outDir, "rating_lineage_recovery.csv"), successorRows.map((row) => ({ ...row, source_evidence_refs: row.source_evidence_refs })))
writeCsv(path.join(outDir, "lineage_exceptions.csv"), lineageExceptions)
writeCsv(path.join(outDir, "owner_rating_snapshot_mapping.csv"), reconciliation.map((row) => ({
  approval_batch: row.batch_scope,
  approved_local_snapshot_id: row.local_snapshot_id,
  course_id: row.course_id,
  difficulty: row.difficulty,
  approved_rating: row.approved_rating,
  approved_slope: row.approved_slope,
  target_snapshot_id: targetByLocalId.get(row.local_snapshot_id) || "",
  target_kind: row.status === "EXACT_EXISTING_PRODUCTION" ? "EXISTING_PRODUCTION" : targetByLocalId.has(row.local_snapshot_id) ? "PHASE135_SUCCESSOR" : "BLOCKED_LINEAGE_MISMATCH",
  source_status: row.status === "EXACT_EXISTING_PRODUCTION" ? "EXACT" : targetByLocalId.has(row.local_snapshot_id) ? "VERIFIED_SUCCESSOR_LINEAGE" : "BLOCKED_LINEAGE_MISMATCH",
})))
writeCsv(path.join(outDir, "player_index_revalidation.csv"), revalidatedIndexes)

const sourceRefsBySnapshot = Object.fromEntries(successorRows.map((row) => [row.successor_snapshot_id, JSON.parse(row.source_evidence_refs)]))
const sourceAssertions = successorRows.map((row) => `  IF (SELECT count(*) FROM public.handicap_source_provenance WHERE source_fingerprint = ANY(ARRAY[${sourceRefsBySnapshot[row.successor_snapshot_id].map((ref) => `${sql(ref)}`).join(",")} ]::text[])) <> ${row.source_ref_count} THEN RAISE EXCEPTION ${sql(`${row.course_id}: source provenance count mismatch`)}; END IF;`).join("\n")
const snapshotIdsSql = successorRows.map((row) => `${sql(row.successor_snapshot_id)}::uuid`).join(",")
const runMetadata = {
  phase: "135",
  source_package: "phase135-verified-rating-lineage-recovery",
  owner_batch_sha256: batchSha,
  source_manifests: {
    phase68_provenance_sha256: sha256(path.join(p68, "handicap_source_provenance_import.csv")),
    phase117_provenance_sha256: sha256(path.join(p117, "handicap_source_provenance_import.csv")),
    phase101_period_sha256: sha256(path.join(p101, "season_week_effective_period_manifest.csv")),
  },
  policy_version: "krys-handicap-approved-policy-v1",
  model_version: "krys-handicap-candidate-a-v1",
  rating_model_version: modelVersion,
  reference_slope: 8.515,
  source_scope: sourceScope,
  chronology_policy: "OFFICIAL_KWT_SEQUENCE",
  publication_opt_in: false,
  publication_eligibility: "QUARANTINED",
  recovered_successor_snapshot_count: successorRows.length,
  blocked_lineage_exception_count: lineageExceptions.length,
  weekly_personal_inputs: 0,
}
const runInsert = `INSERT INTO public.handicap_calculation_runs (id, policy_version, model_version, source_package_ref, chronology_policy, status, metadata, publication_eligibility) VALUES (${sql(newRunId)}::uuid, 'krys-handicap-approved-policy-v1', 'krys-handicap-candidate-a-v1', ${sql(`phase135/${batchSha}/rating-lineage-recovery`)}, 'OFFICIAL_KWT_SEQUENCE', 'DRAFT', ${sql(JSON.stringify(runMetadata))}::jsonb, 'QUARANTINED');`
const snapshotInserts = successorRows.map((row) => `INSERT INTO public.handicap_rating_snapshots (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope) VALUES (${sql(row.successor_snapshot_id)}::uuid, ${sql(newRunId)}::uuid, ${sql(row.course_id)}, ${sql(row.difficulty)}, ${row.course_rating}, ${row.slope}, ${row.sample_size}, ${row.distinct_canonical_player_count}, 'ready', ${sql(modelVersion)}, NULL, ${sql(row.effective_period)}, ${sql(row.source_evidence_refs)}::text[], 'UNPUBLISHED', 'KWT_ONLY');`).join("\n")
const preflightSql = `-- PHASE135 READ-ONLY PREFLIGHT; DO NOT EXECUTE AS A WRITE.\nBEGIN; SET TRANSACTION READ ONLY;\nDO $$ BEGIN\n  IF (SELECT count(*) FROM public.handicap_calculation_runs) <> ${priorRunCount} THEN RAISE EXCEPTION 'calculation-run baseline mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_source_provenance) <> ${priorProvenanceCount} THEN RAISE EXCEPTION 'provenance baseline mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_rating_snapshots) <> ${priorRatingCount} THEN RAISE EXCEPTION 'rating baseline mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_index_snapshots) <> ${priorIndexCount} THEN RAISE EXCEPTION 'index baseline mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_calculation_runs WHERE id = ${sql(newRunId)}::uuid) <> 0 THEN RAISE EXCEPTION 'Phase135 run already exists'; END IF;\n  IF (SELECT count(*) FROM public.handicap_rating_snapshots WHERE id = ANY(ARRAY[${snapshotIdsSql}]::uuid[])) <> 0 THEN RAISE EXCEPTION 'Phase135 successor snapshot already exists'; END IF;\n  IF (SELECT count(*) FROM public.handicap_publishable_rating_snapshots) <> 0 OR (SELECT count(*) FROM public.handicap_publishable_index_snapshots) <> 0 THEN RAISE EXCEPTION 'publishable views not empty'; END IF;\n  IF EXISTS (SELECT 1 FROM (VALUES ('public.handicap_calculation_runs'::text),('public.handicap_rating_snapshots'),('public.handicap_index_snapshots'),('public.handicap_source_provenance')) p(name) WHERE has_table_privilege('anon', p.name, 'select') OR has_table_privilege('authenticated', p.name, 'select')) THEN RAISE EXCEPTION 'client SELECT unexpectedly granted'; END IF;\n${sourceAssertions}\nEND $$;\nSELECT 'phase135_preflight_passed' AS status; ROLLBACK;\n`
const installSql = `-- PHASE135 APPEND-ONLY SUCCESSOR PACKAGE; NOT AUTHORIZED FOR PRODUCTION EXECUTION.\n-- This package inserts one quarantined DRAFT run and 17 unpublished successor ratings only.\nBEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('phase135-rating-lineage-recovery', 0));\nDO $$ BEGIN\n  IF (SELECT count(*) FROM public.handicap_calculation_runs) <> ${priorRunCount} OR (SELECT count(*) FROM public.handicap_source_provenance) <> ${priorProvenanceCount} OR (SELECT count(*) FROM public.handicap_rating_snapshots) <> ${priorRatingCount} OR (SELECT count(*) FROM public.handicap_index_snapshots) <> ${priorIndexCount} THEN RAISE EXCEPTION 'baseline changed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_calculation_runs WHERE id = ${sql(newRunId)}::uuid) <> 0 THEN RAISE EXCEPTION 'duplicate Phase135 run'; END IF;\n  IF (SELECT count(*) FROM public.handicap_rating_snapshots WHERE id = ANY(ARRAY[${snapshotIdsSql}]::uuid[])) <> 0 THEN RAISE EXCEPTION 'duplicate Phase135 snapshot'; END IF;\n${sourceAssertions}\nEND $$;\n${runInsert}\n${snapshotInserts}\nDO $$ BEGIN\n  IF (SELECT count(*) FROM public.handicap_calculation_runs WHERE id = ${sql(newRunId)}::uuid AND status = 'DRAFT' AND publication_eligibility = 'QUARANTINED') <> 1 THEN RAISE EXCEPTION 'run insert verification failed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_rating_snapshots WHERE id = ANY(ARRAY[${snapshotIdsSql}]::uuid[]) AND publication_status = 'UNPUBLISHED' AND review_scope = 'KWT_ONLY') <> 17 THEN RAISE EXCEPTION 'successor rating insert verification failed'; END IF;\nEND $$;\nCOMMIT;\n`
const postflightSql = `-- PHASE135 READ-ONLY POSTFLIGHT TEMPLATE; execute only after separately authorized installation.\nBEGIN; SET TRANSACTION READ ONLY;\nDO $$ BEGIN\n  IF (SELECT count(*) FROM public.handicap_calculation_runs) <> ${priorRunCount + 1} THEN RAISE EXCEPTION 'run count mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_source_provenance) <> ${priorProvenanceCount} THEN RAISE EXCEPTION 'provenance changed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_rating_snapshots) <> ${priorRatingCount + 17} THEN RAISE EXCEPTION 'rating count mismatch'; END IF;\n  IF (SELECT count(*) FROM public.handicap_index_snapshots) <> ${priorIndexCount} THEN RAISE EXCEPTION 'index count changed'; END IF;\n  IF (SELECT count(*) FROM public.handicap_publishable_rating_snapshots) <> 0 OR (SELECT count(*) FROM public.handicap_publishable_index_snapshots) <> 0 THEN RAISE EXCEPTION 'publication gate opened'; END IF;\nEND $$;\nSELECT 'phase135_postflight_passed' AS status; ROLLBACK;\n`
const installSqlOutput = installSql
  .replace("17 unpublished successor ratings only", `${successorRows.length} unpublished successor ratings only`)
  .replace("<> 17 THEN RAISE EXCEPTION 'successor rating insert verification failed'", `<> ${successorRows.length} THEN RAISE EXCEPTION 'successor rating insert verification failed'`)
const postflightSqlOutput = postflightSql.replace(`<> ${priorRatingCount + 17} THEN RAISE EXCEPTION 'rating count mismatch'`, `<> ${priorRatingCount + successorRows.length} THEN RAISE EXCEPTION 'rating count mismatch'`)
fs.writeFileSync(path.join(outDir, "production_preflight.sql"), preflightSql, "utf8")
fs.writeFileSync(path.join(outDir, "production_installation.sql"), installSqlOutput, "utf8")
fs.writeFileSync(path.join(outDir, "production_postflight.sql"), postflightSqlOutput, "utf8")

const report = `# Phase 135 rating lineage recovery\n\nStatus: **READY FOR LOCAL DATABASE VALIDATION; PRODUCTION BLOCKED**\n\n## Recovered lineage\n\n- ${successorRows.length} successor rating snapshots prepared: 15 previously missing ratings plus 2 approved-value mismatches.\n- Every recovered source set matches its Phase121 sample size and distinct-player count exactly.\n- All source rows are KWT; no Weekly evidence is included.\n- Venice Easy is recovered from the existing Phase68 historical KWT provenance. The other affected ratings use the existing Phase68 plus Phase117 KWT provenance ledgers.\n- No dates, identities, scores, or Production rows were invented or changed.\n\n## Mapping\n\n- Phase130 pending ratings: ${exactPending} existing Production IDs + ${blockedPending} deterministic successors.\n- Earlier five approvals: ${ownerExact} existing Production IDs + ${ownerSuccessor} deterministic successors.\n- Complete rating mapping: 78/78.\n- New calculation run: \`${newRunId}\`, DRAFT / QUARANTINED only.\n\n## Rolling-20 revalidation\n\n- ${revalidatedIndexes.length}/166 candidates revalidated against the complete 78-rating mapping.\n- ${remappedIndexes} required ID remapping; numeric calculation values are unchanged.\n- ${official} OFFICIAL_ELIGIBLE and ${provisional} PROVISIONAL candidates retained.\n- Weekly personal-index inputs: 0.\n\n## Production boundary\n\nThe installation package is prepared but not executed. It inserts only one quarantined run and 17 unpublished successor rating snapshots; it does not insert indexes, decisions, or provenance. Existing snapshots remain untouched.\n\nHollywood remains provisional, Gloop Lair remains unrated, and rating/index publication remains separately gated.\n`
const reportOutput = report
  .replace("15 previously missing ratings plus 2 approved-value mismatches", `${successorRows.length - 2} previously missing ratings plus 2 approved-value mismatches`)
  .replace("Complete rating mapping: 78/78.", `Complete rating mapping: ${targetByLocalId.size}/78.`)
  .replace(`${exactPending} existing Production IDs + ${blockedPending} deterministic successors.`, `${exactPending} existing Production IDs + ${pendingSuccessor} deterministic successors + ${pendingLineageBlocked} quarantined.`)
  .replace("Venice Easy is recovered from the existing Phase68 historical KWT provenance.", "Venice Easy remains quarantined because the verified ledger contains 217 refs while the candidate expects 215.")
  .replace(`${revalidatedIndexes.length}/166 candidates revalidated against the complete 78-rating mapping.`, `${revalidatedIndexes.length - blockedIndexes}/166 candidates revalidated against the complete available rating mapping; ${blockedIndexes} remain blocked by missing lineage.`)
  .replace("17 unpublished successor rating snapshots", `${successorRows.length} unpublished successor rating snapshots`)
  + `\n- Lineage exceptions: ${lineageExceptions.length}; see lineage_exceptions.csv.\n`
fs.writeFileSync(path.join(outDir, "recovery_report.md"), reportOutput, "utf8")

const files = ["successor_rating_snapshots.csv", "rating_lineage_recovery.csv", "owner_rating_snapshot_mapping.csv", "lineage_exceptions.csv", "player_index_revalidation.csv", "production_preflight.sql", "production_installation.sql", "production_postflight.sql", "recovery_report.md"]
const generated = Object.fromEntries(files.map((name) => [name, sha256(path.join(outDir, name))]))
writeJson(path.join(outDir, "checksums.json"), {
  schema_version: "phase135-rating-lineage-recovery-v1",
  status: "PRODUCTION_BLOCKED_LOCAL_PACKAGE_ONLY",
  production_project: productionProject,
  owner_batch_sha256: batchSha,
  calculation_run_id: newRunId,
  source_files: Object.fromEntries(sourceFiles.map((file) => [path.relative(root, file).replaceAll("\\", "/"), sha256(file)])),
  source_period_manifest_sha256: sha256(path.join(p101, "season_week_effective_period_manifest.csv")),
  counts: { blocked_input_ratings: 17, successor_snapshots: successorRows.length, lineage_exceptions: lineageExceptions.length, complete_rating_mappings: targetByLocalId.size, index_candidates: 166, blocked_index_candidates: blockedIndexes, remapped_index_candidates: remappedIndexes, official_eligible: official, provisional, weekly_personal_inputs: 0 },
  generated_files: generated,
})
console.log(JSON.stringify({ successorSnapshots: successorRows.length, completeMappings: targetByLocalId.size, revalidatedIndexes: revalidatedIndexes.length, remappedIndexes, official, provisional, runId: newRunId }, null, 2))
