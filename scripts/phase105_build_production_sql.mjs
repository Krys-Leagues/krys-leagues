import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import Papa from "papaparse"

const root = process.cwd()
const phase104 = path.join(root, "docs", "handicap", "phase104")
const phase105 = path.join(root, "docs", "handicap", "phase105")
const runId = "3973f8e7-f2c9-5d05-bdb7-e49810713612"
const packageRef = "phase104-first-eligible-kwt-handicap-run-v1"
const lockKey = "krys-leagues:phase104:eligible-handicap-run"

function text(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function uuid(value) {
  return `${text(value)}::uuid`
}

function textArray(values) {
  return `ARRAY[${values.map(text).join(",")}]::text[]`
}

function uuidArray(values) {
  return `ARRAY[${values.map(uuid).join(",")}]::uuid[]`
}

function csv(file) {
  const parsed = Papa.parse(fs.readFileSync(path.join(phase104, file), "utf8"), { header: true, skipEmptyLines: true })
  if (parsed.errors.length) throw new Error(`${file}: ${JSON.stringify(parsed.errors)}`)
  return parsed.data
}

function readPackageFile(file) {
  return fs.readFileSync(path.join(phase104, file), "utf8")
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase()
}

function verifyPackage() {
  const checksums = JSON.parse(readPackageFile("package_checksums.json"))
  for (const [file, expected] of Object.entries(checksums.artifacts)) {
    if (file === "source_artifacts") continue
    const actual = hash(readPackageFile(file))
    if (actual !== expected.sha256) throw new Error(`${file}: checksum mismatch`)
  }
  const manifest = JSON.parse(readPackageFile("calculation_run_manifest.json"))
  if (manifest.packageRef !== packageRef || manifest.calculationRun.id !== runId) throw new Error("package identity mismatch")
  if (manifest.counts.readyRatingSnapshots !== 72 || manifest.counts.playerIndexSnapshots !== 157) throw new Error("package counts mismatch")
  return manifest.calculationRun
}

function distinct(values) {
  return [...new Set(values)]
}

function build() {
  fs.mkdirSync(phase105, { recursive: true })
  const run = verifyPackage()
  const ratings = csv("rating_snapshot_import_rows.csv")
  const indexes = csv("index_snapshot_import_rows.csv")
  const provenance = Papa.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase68", "handicap_source_provenance_import.csv"), "utf8"), { header: true, skipEmptyLines: true }).data
  const ratingIds = ratings.map((row) => row.id)
  const indexIds = indexes.map((row) => row.id)
  const snapshotMap = csv("snapshot_id_map.csv")
  const oldRatingIdByNewId = new Map(snapshotMap.map((row) => [row.phase104_snapshot_id, row.source_phase98_snapshot_id]))
  const playerIds = distinct(provenance.filter((row) => row.source_type === "KWT" && row.canonical_player_id).map((row) => row.canonical_player_id))
  const ratingRefs = ratings.flatMap((row) => JSON.parse(row.source_evidence_refs))
  const indexRefs = indexes.flatMap((row) => JSON.parse(row.source_round_ids))
  const sourceRefs = distinct([...ratingRefs, ...indexRefs])
  if (ratings.length !== 72 || indexes.length !== 157 || playerIds.length !== 201 || sourceRefs.length === 0) throw new Error("package dependency count mismatch")
  if (indexRefs.some((ref) => ref.startsWith("THE_WEEKLY|"))) throw new Error("Weekly reference crossed into index package")

  const preflight = `select json_build_object(
  'calculation_runs', (select count(*) from public.handicap_calculation_runs),
  'provenance_rows', (select count(*) from public.handicap_source_provenance),
  'rating_snapshots', (select count(*) from public.handicap_rating_snapshots),
  'index_snapshots', (select count(*) from public.handicap_index_snapshots),
  'publishable_ratings', (select count(*) from public.handicap_publishable_rating_snapshots),
  'publishable_indexes', (select count(*) from public.handicap_publishable_index_snapshots),
  'quarantined_draft_runs', (select count(*) from public.handicap_calculation_runs where status='DRAFT' and publication_eligibility='QUARANTINED'),
  'new_run_exists', (select count(*) from public.handicap_calculation_runs where id=${uuid(runId)}),
  'new_rating_ids_existing', (select count(*) from public.handicap_rating_snapshots where id = any(${uuidArray(ratingIds)})),
  'new_index_ids_existing', (select count(*) from public.handicap_index_snapshots where id = any(${uuidArray(indexIds)})),
  'canonical_players_present', (select count(*) from public.players where id = any(${uuidArray(playerIds)})),
  'package_source_rows_present', (select count(*) from public.handicap_source_provenance where source_type='KWT' and canonical_player_id is not null),
  'package_source_refs_expected', ${sourceRefs.length},
  'phase103_columns', (select count(*) from information_schema.columns where table_schema='public' and table_name='handicap_rating_snapshots' and column_name in ('review_scope','effective_period')),
  'phase103_publication_column', (select count(*) from information_schema.columns where table_schema='public' and table_name='handicap_calculation_runs' and column_name='publication_eligibility'),
  'official_kwt_constraint', (select count(*) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname='handicap_index_snapshots' and c.conname='handicap_index_snapshots_chronology_confidence_check' and pg_get_constraintdef(c.oid) like '%OFFICIAL_KWT_SEQUENCE%'),
  'security_invoker_views', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('handicap_publishable_rating_snapshots','handicap_publishable_index_snapshots') and c.reloptions @> array['security_invoker=true'])
) as phase105_preflight;\n`

  const ratingSeed = ratings.map((row) => `(${uuid(row.id)}, ${uuid(oldRatingIdByNewId.get(row.id))}, ${text(row.course_id)}, ${text(row.difficulty)}, ${row.course_rating}, ${row.slope}, ${row.sample_size}, ${row.distinct_canonical_player_count}, ${text(row.effective_period)})`).join(",\n  ")
  const ratingInserts = `insert into public.handicap_rating_snapshots
  (id, calculation_run_id, course_id, difficulty, course_rating, slope, sample_size, distinct_canonical_player_count, rating_confidence, model_version, effective_from, effective_period, source_evidence_refs, publication_status, review_scope)
select seed.new_id, ${uuid(runId)}, seed.course_id, seed.difficulty, seed.course_rating, seed.slope, seed.sample_size, seed.distinct_players, 'ready', 'krys-course-rating-elite-lowest-12-v1', null, seed.effective_period, source.source_evidence_refs, 'UNPUBLISHED', 'KWT_ONLY'
from (values
  ${ratingSeed}
) as seed(new_id, old_id, course_id, difficulty, course_rating, slope, sample_size, distinct_players, effective_period)
join public.handicap_rating_snapshots source on source.id = seed.old_id
where source.review_scope = 'KWT_ONLY'
  and source.publication_status = 'UNPUBLISHED';`
  const indexInserts = indexes.map((row) => `insert into public.handicap_index_snapshots
  (id, calculation_run_id, canonical_player_id, source_round_ids, rating_snapshot_ids, rating_version_ids, differential_model_version, latest_ten_source_round_ids, best_five_source_round_ids, resulting_index, chronology_confidence, publication_status)
values (${uuid(row.id)}, ${uuid(runId)}, ${uuid(row.canonical_player_id)}, ${textArray(JSON.parse(row.source_round_ids))}, ${uuidArray(JSON.parse(row.rating_snapshot_ids))}, ${textArray(JSON.parse(row.rating_version_ids))}, ${text(row.differential_model_version)}, ${textArray(JSON.parse(row.latest_ten_source_round_ids))}, ${textArray(JSON.parse(row.best_five_source_round_ids))}, ${row.resulting_index}, ${text(row.chronology_confidence)}, ${text(row.publication_status)});`).join("\n")

  const preAssertions = `do $$ begin
  if (select count(*) from public.handicap_calculation_runs) <> 2 then raise exception 'unexpected calculation-run count before Phase 105'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 27944 then raise exception 'unexpected provenance count before Phase 105'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 338 then raise exception 'unexpected rating count before Phase 105'; end if;
  if (select count(*) from public.handicap_index_snapshots) <> 0 then raise exception 'unexpected index count before Phase 105'; end if;
  if (select count(*) from public.handicap_calculation_runs where id=${uuid(runId)}) <> 0 then raise exception 'Phase 105 run already exists'; end if;
  if (select count(*) from public.handicap_rating_snapshots where id = any(${uuidArray(ratingIds)})) <> 0 then raise exception 'Phase 105 rating ID already exists'; end if;
  if (select count(*) from public.handicap_index_snapshots where id = any(${uuidArray(indexIds)})) <> 0 then raise exception 'Phase 105 index ID already exists'; end if;
  if (select count(*) from public.handicap_rating_snapshots where id = any(${uuidArray([...new Set([...oldRatingIdByNewId.values()])])}) and review_scope='KWT_ONLY' and publication_status='UNPUBLISHED') <> 72 then raise exception 'Phase 105 source rating dependency mismatch'; end if;
  if (select count(*) from public.players where id = any(${uuidArray(playerIds)})) <> 201 then raise exception 'Phase 105 canonical player dependency mismatch'; end if;
end $$;`
  const postAssertions = `do $$ begin
  if (select count(*) from public.handicap_calculation_runs) <> 3 then raise exception 'Phase 105 run count mismatch'; end if;
  if (select count(*) from public.handicap_source_provenance) <> 27944 then raise exception 'Phase 105 modified provenance'; end if;
  if (select count(*) from public.handicap_rating_snapshots) <> 410 then raise exception 'Phase 105 rating count mismatch'; end if;
  if (select count(*) from public.handicap_index_snapshots) <> 157 then raise exception 'Phase 105 index count mismatch'; end if;
  if (select count(*) from public.handicap_calculation_runs where id=${uuid(runId)} and status='DRAFT' and publication_eligibility='QUARANTINED') <> 1 then raise exception 'Phase 105 run not quarantined'; end if;
  if (select count(*) from public.handicap_rating_snapshots where calculation_run_id=${uuid(runId)} and publication_status='UNPUBLISHED' and effective_from is null) <> 72 then raise exception 'Phase 105 ratings not unpublished'; end if;
  if (select count(*) from public.handicap_index_snapshots where calculation_run_id=${uuid(runId)} and publication_status='UNPUBLISHED' and chronology_confidence='OFFICIAL_KWT_SEQUENCE') <> 157 then raise exception 'Phase 105 indexes not unpublished'; end if;
  if exists (select 1 from public.handicap_index_snapshots i, lateral unnest(i.source_round_ids) refs(source_ref) where i.calculation_run_id=${uuid(runId)} and source_ref like 'THE_WEEKLY|%') then raise exception 'Weekly source entered personal indexes'; end if;
  if exists (select 1 from public.handicap_rating_snapshots s, lateral unnest(s.source_evidence_refs) refs(source_ref) left join public.handicap_source_provenance p on p.source_fingerprint=refs.source_ref where s.calculation_run_id=${uuid(runId)} and p.id is null) then raise exception 'rating provenance reference missing'; end if;
  if exists (select 1 from public.handicap_index_snapshots i, lateral unnest(i.rating_snapshot_ids) refs(rating_id) left join public.handicap_rating_snapshots s on s.id=refs.rating_id where i.calculation_run_id=${uuid(runId)} and s.id is null) then raise exception 'index rating reference missing'; end if;
  if (select count(*) from public.handicap_publishable_rating_snapshots) <> 0 then raise exception 'ratings unexpectedly publishable'; end if;
  if (select count(*) from public.handicap_publishable_index_snapshots) <> 0 then raise exception 'indexes unexpectedly publishable'; end if;
end $$;`
  const install = `begin;
select pg_advisory_xact_lock(hashtext(${text(lockKey)}));
${preAssertions}
insert into public.handicap_calculation_runs
  (id, policy_version, model_version, source_package_ref, chronology_policy, status, publication_eligibility, metadata)
values (${uuid(run.id)}, ${text(run.policy_version)}, ${text(run.model_version)}, ${text(run.source_package_ref)}, ${text(run.chronology_policy)}, ${text(run.status)}, ${text(run.publication_eligibility)}, ${text(JSON.stringify(run.metadata))}::jsonb);
${ratingInserts}
${indexInserts}
${postAssertions}
commit;\n`
  fs.writeFileSync(path.join(phase105, "production_preflight.sql"), preflight)
  fs.writeFileSync(path.join(phase105, "production_install.sql"), install)
  const artifacts = {
    production_preflight_sql: hash(preflight),
    production_install_sql: hash(install),
    production_install_sql_bytes: Buffer.byteLength(install),
    packageRef,
    runId,
    ratingCount: ratings.length,
    indexCount: indexes.length,
    sourceRefCount: sourceRefs.length,
    playerCount: playerIds.length,
  }
  fs.writeFileSync(path.join(phase105, "production_sql_checksums.json"), `${JSON.stringify(artifacts, null, 2)}\n`)
  console.log(JSON.stringify(artifacts, null, 2))
}

build()
