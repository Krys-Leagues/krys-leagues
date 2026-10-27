import assert from "node:assert/strict"
import { randomInt } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { adaptProductionOperationalRows, selectFrozenPublishedHandicaps, validateVerifiedWeekSetup } from "../lib/kwtNetProductionAdapter.ts"
import { buildKwtNetResults } from "../lib/kwtNetLeaderboard.ts"

const runtimeBin = process.env.KRYS_PG_BIN ?? "C:\\Users\\kryst\\pgsql-local\\postgresql-17.11-5\\runtime\\pgsql\\bin"
const initdb = path.join(runtimeBin, "initdb.exe")
const postgres = path.join(runtimeBin, "postgres.exe")
const pgCtl = path.join(runtimeBin, "pg_ctl.exe")
const psql = path.join(runtimeBin, "psql.exe")
const root = process.cwd()
const workDir = fs.mkdtempSync(path.join(root, ".kwt-s15-w01-net-local-"))
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

const players = [
  ["p1", "ZANETTI", "ELITE", -24, -21, -45, 1, 25],
  ["p2", "JESUNET", "PRO", -19, -14, -33, 2, 21],
  ["p3", "CHIPNPUTT", "PRO", -20, -3, -23, 3, 18],
  ["p4", "NUTTYGRANDPA", "SEMI", -14, -2, -16, 4, 16],
  ["p5", "KILLERBEE", "AMA", -8, 10, 2, 5, 15],
  ["p6", "ULTRAFOX_LYNNE", "AMA", -6, 8, 2, 5, 15],
  ["p7", "Sj_76", "SEMI", -6, 12, 6, 7, 13],
]

const setupSql = `
create table public.players (id text primary key, screen_name text);
create table public.all_time_courses (code text primary key, base_map text, difficulty text, display_name text, active boolean);
create table public.kwt_public_content (content_type text, season_number integer, week_number integer, label text, start_date date, end_date date, active boolean);
create table public.kwt_operational_results (id serial primary key, season_number integer, week_number integer, player_id text, division text, easy_course_code text, hard_course_code text, easy_score integer, hard_score integer, total_score integer, overall_placement integer, points integer, status text, source_type text, source_reference text);
create table public.handicap_publishable_index_snapshots (canonical_player_id text, resulting_index numeric, handicap_status text, effective_from date, created_at timestamptz);
create table public.handicap_publishable_rating_snapshots (course_id text, slope numeric);
insert into public.all_time_courses values ('RCE','Raptor Cliffs','easy','Raptor Cliff''s',true),('RCH','Raptor Cliffs','hard','Raptor Cliff''s - Hard',true);
insert into public.kwt_public_content values ('kwt_week_setup',15,1,'{"eventIdentifier":"KWTS15W01","courseName":"Raptor Cliffs","easyCourseCode":"RCE","hardCourseCode":"RCH","freezeCutoff":"2026-10-23T04:00:00Z"}','2026-10-24','2026-10-24',true);
insert into public.handicap_publishable_rating_snapshots values ('RCE',8.515),('RCH',12.197);
${players.map(([id, name]) => `insert into public.players values ('${id}','${name}');`).join("\n")}
${players.map(([id, , division, easy, hard, total, position, points]) => `insert into public.kwt_operational_results (season_number,week_number,player_id,division,easy_course_code,hard_course_code,easy_score,hard_score,total_score,overall_placement,points,status,source_type,source_reference) values (15,1,'${id}','${division}','RCE','RCH',${easy},${hard},${total},${position},${points},'VERIFIED','KWT','KWTS15W01');`).join("\n")}
insert into public.handicap_publishable_index_snapshots values ${players.map(([id]) => `('${id}',4.04,'OFFICIAL_ELIGIBLE','2026-10-22','2026-10-22T12:00:00Z')`).join(",")};
insert into public.players values ('p8','WEEKLY_ONLY');
insert into public.kwt_operational_results (season_number,week_number,player_id,division,easy_course_code,hard_course_code,easy_score,hard_score,total_score,overall_placement,points,status,source_type,source_reference) values (15,1,'p8','ELITE','RCE','RCH',-1,-1,-2,8,0,'VERIFIED','THE_WEEKLY','weekly');
`

try {
  if (![initdb, postgres, pgCtl, psql].every((file) => fs.existsSync(file))) throw new Error(`PostgreSQL 17 runtime incomplete under ${runtimeBin}`)
  run(initdb, ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"], { timeout: 60000 })
  server = spawn(postgres, ["-D", dataDir, "-p", String(port), "-F"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  await waitForPostgres()
  run(psql, psqlArgs(["-c", setupSql]), { timeout: 120000 })

  const raw = query("select season_number,week_number,player_id,division,easy_course_code,hard_course_code,easy_score,hard_score,total_score,overall_placement,points,status,source_type,source_reference from public.kwt_operational_results where season_number=15 and week_number=1 order by overall_placement")
    .split(/\r?\n/).filter(Boolean).map((line) => { const [season, week, player, division, easyCode, hardCode, easy, hard, total, placement, points, status, sourceType, sourceReference] = line.split("\t"); return { season_number: Number(season), week_number: Number(week), player_id: player, division, easy_course_code: easyCode, hard_course_code: hardCode, easy_score: Number(easy), hard_score: Number(hard), total_score: Number(total), overall_placement: Number(placement), points: Number(points), status, source_type: sourceType, source_reference: sourceReference } })
  const playerRows = query("select id,screen_name from public.players order by id").split(/\r?\n/).filter(Boolean).map((line) => { const [id, screenName] = line.split("\t"); return { id, screen_name: screenName } })
  const handicapRows = query("select canonical_player_id,resulting_index,handicap_status,effective_from,created_at from public.handicap_publishable_index_snapshots order by canonical_player_id").split(/\r?\n/).filter(Boolean).map((line) => { const [id, index, status, effective, created] = line.split("\t"); return { canonical_player_id: id, resulting_index: index, handicap_status: status, effective_from: effective, created_at: created } })
  const setup = { eventIdentifier: "KWTS15W01", season: 15, week: 1, courseName: "Raptor Cliffs", easyCourseCode: "RCE", hardCourseCode: "RCH", easySlope: 8.515, hardSlope: 12.197, freezeCutoff: "2026-10-23T04:00:00Z" }
  assert.equal(validateVerifiedWeekSetup(setup), true)
  const frozen = selectFrozenPublishedHandicaps(handicapRows, setup.freezeCutoff)
  const adapted = adaptProductionOperationalRows(raw, playerRows, frozen, setup)
  const netRows = buildKwtNetResults(setup, adapted.inputs)
  assert.equal(adapted.inputs.length, 7)
  assert.equal(netRows.length, 7)
  assert.equal(netRows.filter((item) => item.combinedNet !== null).length, 7)
  assert.ok(adapted.rejected.some((reason) => reason.includes("source or result status")))
  const duplicate = adaptProductionOperationalRows([raw[0], raw[0]], playerRows, frozen, setup)
  assert.equal(duplicate.inputs.length, 1)
  assert.ok(duplicate.rejected.some((reason) => reason.includes("duplicate logical")))

  try {
    run(psql, psqlArgs(["-c", "begin; insert into public.kwt_operational_results (season_number,week_number,player_id,status,source_type) values (15,1,'p1','VERIFIED','KWT'); select 1/0; commit;"]), { timeout: 120000 })
    throw new Error("rollback fixture unexpectedly succeeded")
  } catch (error) {
    if (!(error instanceof Error) || !/division by zero/.test(error.message)) throw error
  }
  const count = query("select count(*) from public.kwt_operational_results where player_id='p1'")
  assert.equal(count, "1", "atomic rollback must remove the failed insert")
  console.log(JSON.stringify({ runtime: "PostgreSQL 17.11", rows: 7, canonicalPlayers: 7, netRows: 7, weeklyRowsRejected: true, duplicateLogicalRoundRejected: true, frozenHandicapSelection: true, atomicRollback: true }, null, 2))
} finally {
  if (server) spawnSync(pgCtl, ["-D", dataDir, "-m", "immediate", "-w", "stop"], { encoding: "utf8", windowsHide: true, timeout: 30000 })
  fs.rmSync(workDir, { recursive: true, force: true })
}

