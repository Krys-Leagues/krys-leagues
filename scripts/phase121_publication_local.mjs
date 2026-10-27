import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import Papa from "papaparse"

if (process.env.PHASE121_LOCAL_TEST !== "1") {
  throw new Error("Refusing to run without PHASE121_LOCAL_TEST=1")
}

const host = process.env.PGHOST || "127.0.0.1"
const port = process.env.PGPORT || "55441"
const user = process.env.PGUSER || "postgres"
const database = process.env.PGDATABASE || "postgres"
if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("Phase 121 local harness only accepts loopback PostgreSQL")
if (!/^\d+$/.test(port)) throw new Error("invalid local PostgreSQL port")

const root = process.cwd()
const packageDir = path.join(root, "docs", "handicap", "phase121")
const psql = process.env.PSQL_PATH || path.join("C:", "Users", "kryst", "pgsql-local", "postgresql-17.11-5", "runtime", "pgsql", "bin", "psql.exe")
const readCsv = (name) => Papa.parse(fs.readFileSync(path.join(packageDir, name), "utf8"), { header: true, skipEmptyLines: true }).data
const ratings = readCsv("rating_snapshot_candidates.csv")
const indexes = readCsv("player_index_candidates.csv")
const approval = JSON.parse(fs.readFileSync(path.join(packageDir, "player_index_approval_manifest.json"), "utf8"))
if (ratings.length !== 78 || indexes.length !== 166) throw new Error("Phase 121 package count mismatch")
if (approval.owner_acceptance.scope !== "numeric fairness only; not blanket rating approval, identity approval, security approval, or publication approval") throw new Error("owner acceptance scope was broadened")

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase121-pg-"))
const ratingCsv = path.join(tempRoot, "ratings.csv")
const indexCsv = path.join(tempRoot, "indexes.csv")
const playerCsv = path.join(tempRoot, "players.csv")
const refCsv = path.join(tempRoot, "rating_refs.csv")
const roundCsv = path.join(tempRoot, "round_refs.csv")
const csv = (rows) => `${Papa.unparse(rows, { newline: "\n" })}\n`
fs.writeFileSync(ratingCsv, csv(ratings.map((row) => ({ id: row.snapshot_id, course_id: row.course_id, source_scope: row.source_scope, confidence: row.rating_confidence, slope: row.slope, status: row.publication_status }))), "utf8")
fs.writeFileSync(indexCsv, csv(indexes.map((row) => ({ id: row.snapshot_id, run_id: row.calculation_run_id, player_id: row.canonical_player_id, source_scope: row.source_scope, weekly_rows: row.weekly_rows_used, status: row.publication_status, resulting_index: row.resulting_index }))), "utf8")
fs.writeFileSync(playerCsv, csv(indexes.map((row) => ({ id: row.canonical_player_id }))), "utf8")
const refs = []
const rounds = []
const parseListField = (value) => {
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return []
  if (trimmed.startsWith("[")) return JSON.parse(trimmed)
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean)
}
for (const row of indexes) {
  for (const ratingId of parseListField(row.rating_snapshot_ids)) refs.push({ index_id: row.snapshot_id, rating_id: ratingId })
  for (const sourceRound of parseListField(row.source_round_ids)) rounds.push({ index_id: row.snapshot_id, source_round: sourceRound })
}
if (rounds.some((row) => !row.source_round.startsWith("KWT|"))) throw new Error("non-KWT source round in package")
fs.writeFileSync(refCsv, csv(refs), "utf8")
fs.writeFileSync(roundCsv, csv(rounds), "utf8")

const sql = `
begin;
create temp table phase121_runs(id uuid primary key, publication_eligibility text not null);
create temp table phase121_players(id uuid primary key);
create temp table phase121_ratings(id uuid primary key, course_id text not null, source_scope text not null, confidence text not null, slope numeric not null, publication_status text not null);
create temp table phase121_indexes(id uuid primary key, run_id uuid not null references phase121_runs(id), player_id uuid not null references phase121_players(id), source_scope text not null, weekly_rows integer not null, publication_status text not null, resulting_index numeric not null);
create temp table phase121_rating_refs(index_id uuid not null references phase121_indexes(id), rating_id uuid not null references phase121_ratings(id), primary key(index_id, rating_id));
create temp table phase121_round_refs(index_id uuid not null references phase121_indexes(id), source_round text not null, primary key(index_id, source_round));
alter table phase121_indexes enable row level security;
alter table phase121_ratings enable row level security;
\\copy phase121_players(id) from '${playerCsv.replaceAll("'", "''")}' with (format csv, header true)
insert into phase121_runs values ('19777bdb-8c2d-5c39-80fa-55a7b429fe93', 'QUARANTINED');
\\copy phase121_ratings(id, course_id, source_scope, confidence, slope, publication_status) from '${ratingCsv.replaceAll("'", "''")}' with (format csv, header true)
\\copy phase121_indexes(id, run_id, player_id, source_scope, weekly_rows, publication_status, resulting_index) from '${indexCsv.replaceAll("'", "''")}' with (format csv, header true)
\\copy phase121_rating_refs(index_id, rating_id) from '${refCsv.replaceAll("'", "''")}' with (format csv, header true)
\\copy phase121_round_refs(index_id, source_round) from '${roundCsv.replaceAll("'", "''")}' with (format csv, header true)
do $$ begin
  if (select count(*) from phase121_ratings) <> 78 then raise exception 'rating count failed'; end if;
  if (select count(*) from phase121_indexes) <> 166 then raise exception 'index count failed'; end if;
  if exists (select 1 from phase121_indexes where source_scope <> 'KWT_ONLY' or weekly_rows <> 0 or publication_status <> 'UNPUBLISHED') then raise exception 'source boundary failed'; end if;
  if exists (select 1 from phase121_round_refs where source_round not like 'KWT|%') then raise exception 'round source boundary failed'; end if;
  if exists (select 1 from phase121_ratings where slope <= 0.01 or publication_status <> 'UNPUBLISHED') then raise exception 'rating safety failed'; end if;
  if (select count(*) from pg_class where relname in ('phase121_indexes','phase121_ratings') and relrowsecurity) <> 2 then raise exception 'RLS setup failed'; end if;
end $$;
do $$ begin
  begin
    insert into phase121_runs values ('19777bdb-8c2d-5c39-80fa-55a7b429fe93', 'QUARANTINED');
    raise exception 'duplicate run was accepted';
  exception when unique_violation then null;
  end;
end $$;
do $$ begin
  begin
    insert into phase121_rating_refs values ((select id from phase121_indexes limit 1), '00000000-0000-5000-8000-999999999999');
    raise exception 'invalid rating reference was accepted';
  exception when foreign_key_violation then null;
  end;
end $$;
create temp table phase121_append_only(id uuid primary key, value text);
create or replace function phase121_reject_mutation() returns trigger language plpgsql as $$ begin raise exception 'append-only mutation rejected'; end $$;
create trigger phase121_append_only_guard before update or delete on phase121_append_only for each row execute function phase121_reject_mutation();
insert into phase121_append_only values ('00000000-0000-5000-8000-000000000001', 'original');
do $$ begin
  begin
    update phase121_append_only set value = 'changed';
    raise exception 'append-only update was accepted';
  exception when raise_exception then
    if not exists (select 1 from phase121_append_only where value = 'original') then raise; end if;
  end;
end $$;
rollback;
select 'PHASE121_LOCAL_TRANSACTION_PASS' as result;
`
const sqlPath = path.join(tempRoot, "phase121.sql")
fs.writeFileSync(sqlPath, sql, "utf8")
const result = spawnSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port, "-U", user, "-d", database, "-f", sqlPath], { encoding: "utf8" })
if (result.error) throw result.error
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(JSON.stringify({ status: "PASS", host, port, database, rows: { ratings: ratings.length, indexes: indexes.length, ratingReferences: refs.length, sourceRounds: rounds.length } }))
