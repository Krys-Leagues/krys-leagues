import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const pgCtl = path.join(runtimeBin, "pg_ctl.exe")
const psql = path.join(runtimeBin, "psql.exe")
const root = process.cwd()
const proposal = path.join(root, "docs", "kwt", "season15-week01", "activation_transaction.proposed.sql")
const preflight = path.join(root, "docs", "kwt", "season15-week01", "activation_preflight.sql")
const postflight = path.join(root, "docs", "kwt", "season15-week01", "activation_postflight.sql")
const workDir = fs.mkdtempSync(path.join(root, ".kwt-s15-w01-activation-local-"))
const dataDir = path.join(workDir, "data")
const port = 56000 + randomInt(500)
let server

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: "utf8", windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed (${result.status}): ${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

function psqlArgs(extra) {
  return ["-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", ...extra]
}

function query(sql) {
  return run(psql, psqlArgs(["-At", "-F", "\t", "-c", sql]))
}

async function waitForPostgres() {
  const deadline = Date.now() + 30000
  let logs = ""
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`postgres exited before readiness: ${logs}`)
    const probe = spawnSync(psql, psqlArgs(["-At", "-c", "select 1"]), { encoding: "utf8", windowsHide: true, timeout: 1000 })
    if (probe.status === 0 && probe.stdout.trim() === "1") return
    logs = `${probe.stderr || ""}`
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`timed out waiting for disposable PostgreSQL: ${logs}`)
}

const playerIds = [
  "2e4ce1d8-afd6-44a2-9560-f85c16f23747",
  "a0eaf23c-0784-4eb9-ab1d-530b077121a9",
  "69c0daa5-70b8-481b-94e5-a9d033bc75fb",
  "d38c0220-8a80-45a6-86e8-d495f523d5ab",
  "fbd60e4a-9d17-4556-9062-dc005a0c5723",
  "6918df0a-cc2b-495a-8c09-b8be600ed0bc",
  "ebcdd3f4-1a69-40f6-819e-899fbe9998d7",
  "e2741a95-19e9-440c-a605-f1c1498aa5c1",
  "e249815d-ac23-4ef7-9c20-7ed9ba0c57c4",
  "ec943c83-bd7f-46b9-a9a9-8d2d6a3a71b0",
  "6d74f565-dc1d-41e3-81e5-fd7e6b38e28d",
  "b98df6d3-7e16-450f-bd17-f39d9903d1e1",
  "c60ed0d8-1f05-4675-b635-342707607c18",
  "bed410dd-2b89-4db3-8fe4-8226c21c3f5f",
]

const officialPlayerIds = new Set([
  playerIds[0], playerIds[3], playerIds[4], playerIds[6], playerIds[7], playerIds[8], playerIds[9],
  playerIds[10], playerIds[11], playerIds[12], playerIds[13],
])

const setupSql = `
create extension if not exists pgcrypto;
create table public.players (id uuid primary key, screen_name text not null);
create table public.all_time_courses (
  id uuid primary key default gen_random_uuid(), code text not null unique, base_map text not null,
  difficulty text not null, display_name text not null, photo_path text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), image_url text,
  par integer, release_date date, hole_pars jsonb
);
create table public.seasons (
  id uuid primary key default gen_random_uuid(), league_type text not null, season_number integer not null,
  due_date date, created_at timestamp default now(), start_date date, end_date date,
  is_locked boolean not null default false, is_active boolean not null default false, division text,
  game1_course text, game2_course text, game3_course text,
  unique (league_type, season_number)
  ,unique (league_type, division, season_number)
);
create index idx_seasons_lookup on public.seasons (league_type, season_number);
create table public.kwt_public_content (
  id uuid primary key default gen_random_uuid(), content_type text not null, season_number integer not null,
  week_number integer not null, start_date date, end_date date, display_order integer not null default 0,
  image_url text, label text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint kwt_public_content_content_type_check check (content_type = any (array['weekly_feature'::text,'calendar_week'::text])),
  constraint kwt_calendar_dates_together check ((content_type = 'weekly_feature'::text) or ((start_date is not null) and (end_date is not null) and (end_date >= start_date))),
  constraint kwt_feature_image_required check ((content_type = 'calendar_week'::text) or (image_url is not null)),
  constraint kwt_public_content_season_number_check check (season_number > 0),
  constraint kwt_public_content_week_number_check check (week_number > 0)
);
create unique index kwt_calendar_week_unique on public.kwt_public_content (content_type, season_number, week_number) where content_type = 'calendar_week';
create index kwt_public_content_active_idx on public.kwt_public_content (content_type, active, updated_at desc);
create table public.handicap_rating_snapshots (
  id uuid primary key, calculation_run_id uuid not null, course_id text not null, difficulty text not null,
  course_rating numeric, slope numeric, sample_size integer not null, distinct_canonical_player_count integer not null,
  rating_confidence text not null, model_version text not null, effective_from date, effective_period text,
  source_evidence_refs text[] not null default '{}', publication_status text not null, created_at timestamptz not null default now(), review_scope text
);
create table public.handicap_review_decisions (
  id uuid primary key default gen_random_uuid(), evidence_id uuid, subject_kind text not null, subject_key text not null,
  decision text not null, rationale text not null, reviewer_id uuid, decision_sequence integer not null, created_at timestamptz not null default now()
);
create table public.handicap_publishable_index_snapshots (
  id uuid primary key default gen_random_uuid(), calculation_run_id uuid, canonical_player_id uuid, resulting_index numeric,
  handicap_status text, effective_from date, publication_status text, active_twenty_source_round_ids uuid[], active_round_count integer
);
create table public.handicap_publishable_rating_snapshots (id uuid primary key default gen_random_uuid(), publication_status text);
create table public.kwt_operational_results (
  id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons(id), season_number integer not null,
  week_number integer not null, player_id uuid not null references public.players(id), division text not null,
  easy_course_code text not null, hard_course_code text not null, easy_score integer not null, hard_score integer not null,
  total_score integer not null, overall_placement integer not null, division_placement integer not null, points integer not null,
  status text not null default 'official', source_type text not null default 'existing_kwt_website', source_reference text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint kwt_operational_results_status_check check (status in ('draft','official','voided')),
  constraint kwt_operational_results_division_check check (division in ('Amateur','Semi Pro','Pro','Elite')),
  constraint kwt_operational_results_total_check check (total_score = easy_score + hard_score),
  constraint kwt_operational_results_placement_check check (overall_placement > 0 and division_placement > 0),
  constraint kwt_operational_result_key unique (season_id, week_number, player_id)
);
create index kwt_operational_results_player_idx on public.kwt_operational_results (player_id, season_id);
create index kwt_operational_results_season_week_idx on public.kwt_operational_results (season_id, week_number, division, overall_placement);
insert into public.all_time_courses (code,base_map,difficulty,display_name,active) values
  ('RCE','Raptor Cliff''s','Easy','Raptor Cliff''s Easy',true),
  ('RCH','Raptor Cliff''s','Hard','Raptor Cliff''s Hard',true);
insert into public.kwt_public_content (content_type,season_number,week_number,start_date,end_date,display_order,image_url,label,active) values
  ('weekly_feature',14,12,null,null,1,'/approved/weekly-feature.png','Existing weekly feature',true),
  ('calendar_week',14,12,'2026-10-17','2026-10-18',2,null,'Existing calendar week',true);
insert into public.handicap_rating_snapshots (id,calculation_run_id,course_id,difficulty,course_rating,slope,sample_size,distinct_canonical_player_count,rating_confidence,model_version,effective_from,effective_period,publication_status,review_scope) values
  ('b470397b-b07a-5bb4-8575-b83804d7df34','8f136000-0000-5000-8000-000000000136','Raptor Cliff''s_easy','easy',-22.211,9.053,152,78,'high','krys-course-rating-elite-lowest-12-v1','2026-10-22','KWT S8W11-S12W12','UNPUBLISHED','KWT_ONLY'),
  ('0f19e813-655f-521f-bf29-1397ec14ccb1','8f136000-0000-5000-8000-000000000136','Raptor Cliff''s_hard','hard',-13.895,12.197,152,78,'high','krys-course-rating-elite-lowest-12-v1','2026-10-22','KWT S8W11-S12W12','UNPUBLISHED','KWT_ONLY');
insert into public.handicap_review_decisions (subject_kind,subject_key,decision,rationale,decision_sequence) values
  ('RATING','b470397b-b07a-5bb4-8575-b83804d7df34','ACCEPT','Approved KWT reference',1),
  ('RATING','0f19e813-655f-521f-bf29-1397ec14ccb1','ACCEPT','Approved KWT reference',2);
insert into public.players (id,screen_name) values
  ${playerIds.map((id, index) => `('${id}','P${index + 1}')`).join(",\n  ")};
insert into public.handicap_publishable_index_snapshots (canonical_player_id,resulting_index,handicap_status,effective_from,publication_status) values
  ${playerIds.map((id, index) => `('${id}',${index + 1}.0,'${officialPlayerIds.has(id) ? "OFFICIAL_ELIGIBLE" : "PROVISIONAL"}','2026-10-22','PUBLISHED')`).join(",\n  ")};
`

function resultCount() {
  return Number(query("select count(*) from public.kwt_operational_results where season_number=15 and week_number=1"))
}

try {
  if (!fs.existsSync(proposal)) throw new Error(`Activation proposal missing: ${proposal}`)
  if (![initdb, postgres, pgCtl, psql].every((file) => fs.existsSync(file))) throw new Error(`PostgreSQL 17 runtime incomplete under ${runtimeBin}`)
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  server = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  await waitForPostgres()
  run(psql, psqlArgs(["-c", setupSql]), { timeout: 120000 })

  run(psql, psqlArgs(["-f", preflight]), { timeout: 120000 })
  run(psql, psqlArgs(["-f", proposal]), { timeout: 120000 })
  assert.equal(query("select count(*) from public.kwt_public_content where content_type='kwt_week_setup' and season_number=15 and week_number=1 and active"), "1")
  assert.equal(query("select count(*) from public.seasons where league_type='kwt' and season_number=15"), "1")
  assert.equal(resultCount(), 14)
  assert.equal(query("select count(distinct player_id) from public.kwt_operational_results where season_number=15 and week_number=1"), "14")
  assert.equal(query("select count(*) from public.kwt_operational_results where season_number=15 and week_number=1 and status='official' and source_type='existing_kwt_website'"), "14")
  assert.equal(query("select count(*) from public.kwt_operational_results where season_number=15 and week_number=1 and total_score <> easy_score + hard_score"), "0")
  assert.equal(query("select count(*) from public.handicap_rating_snapshots where publication_status='UNPUBLISHED' and review_scope='KWT_ONLY'"), "2")
  assert.equal(query("select count(*) from public.handicap_publishable_index_snapshots where publication_status='PUBLISHED'"), "14")
  assert.equal(query("select count(*) from public.handicap_publishable_index_snapshots where effective_from='2026-10-22' and handicap_status='PROVISIONAL'"), "3")
  assert.equal(query("select count(*) from public.kwt_public_content where content_type='weekly_feature' and season_number=14 and week_number=12 and image_url is not null"), "1")
  assert.equal(query("select count(*) from public.kwt_public_content where content_type='calendar_week' and season_number=14 and week_number=12 and image_url is null"), "1")
  assert.match(query("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.kwt_public_content'::regclass and conname='kwt_feature_image_required'"), /kwt_week_setup/i)
  const weeklyImageRequired = spawnSync(psql, psqlArgs(["-c", "begin; insert into public.kwt_public_content (content_type,season_number,week_number,start_date,end_date,display_order,image_url,label,active) values ('weekly_feature',14,11,null,null,1,null,'invalid',true); commit;"]), { encoding: "utf8", windowsHide: true, timeout: 120000 })
  assert.notEqual(weeklyImageRequired.status, 0, "weekly_feature must still require an image")
  const calendarImageOptional = spawnSync(psql, psqlArgs(["-c", "begin; insert into public.kwt_public_content (content_type,season_number,week_number,start_date,end_date,display_order,image_url,label,active) values ('calendar_week',14,11,'2026-10-10','2026-10-11',1,null,'valid',true); rollback;"]), { encoding: "utf8", windowsHide: true, timeout: 120000 })
  assert.equal(calendarImageOptional.status, 0, "calendar_week image must remain optional")
  const invalidSetup = spawnSync(psql, psqlArgs(["-c", "begin; insert into public.kwt_public_content (content_type,season_number,week_number,start_date,end_date,display_order,image_url,label,active) values ('kwt_week_setup',16,1,null,null,1,null,'invalid setup',true); commit;"]), { encoding: "utf8", windowsHide: true, timeout: 120000 })
  assert.notEqual(invalidSetup.status, 0, "invalid Week Setup metadata must fail closed")
  assert.equal(query("select count(*) from public.kwt_public_content where content_type='kwt_week_setup' and season_number=16 and week_number=1"), "0", "invalid Week Setup must roll back atomically")
  run(psql, psqlArgs(["-f", postflight]), { timeout: 120000 })

  const repeat = spawnSync(psql, psqlArgs(["-f", proposal]), { encoding: "utf8", windowsHide: true, timeout: 120000 })
  assert.notEqual(repeat.status, 0, "duplicate activation must fail closed")
  assert.match(`${repeat.stderr}\n${repeat.stdout}`, /operational results already exist/i)
  assert.equal(resultCount(), 14, "duplicate attempt must leave the original activation intact")
  assert.equal(query("select count(*) from public.kwt_public_content where content_type='kwt_week_setup' and season_number=15 and week_number=1 and active"), "1")

  const rollback = spawnSync(psql, psqlArgs(["-c", "begin; insert into public.seasons (league_type,season_number,start_date,end_date,is_locked,is_active,game1_course,game2_course) values ('kwt',16,'2026-11-01','2026-11-01',false,true,'RCE','RCH'); select 1/0; commit;"]), { encoding: "utf8", windowsHide: true, timeout: 120000 })
  assert.notEqual(rollback.status, 0, "rollback fixture must fail")
  assert.match(`${rollback.stderr}\n${rollback.stdout}`, /division by zero/i)
  assert.equal(query("select count(*) from public.seasons where league_type='kwt' and season_number=16"), "0", "failed transaction must roll back")

  console.log(JSON.stringify({ runtime: "PostgreSQL 17.11", activation: "PASS", productionConstraints: "PASS", setupRows: 1, seasonAnchors: 1, operationalRows: 14, distinctPlayers: 14, approvedRatingRefs: 2, publishedIndexesUnchanged: 14, provisionalIndexes: 3, existingContentTypesPreserved: true, weeklyFeatureImageRequired: true, calendarWeekImageOptional: true, weekSetupImageOptional: true, invalidSetupRejected: true, duplicateExecutionRejected: true, atomicRollback: true }, null, 2))
} finally {
  if (server) spawnSync(pgCtl, ["-D", dataDir, "-m", "immediate", "-w", "stop"], { encoding: "utf8", windowsHide: true, timeout: 30000 })
  fs.rmSync(workDir, { recursive: true, force: true })
}
