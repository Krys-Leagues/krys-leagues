import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { historicalCourseLabel, publicMatchDivisions } from "./publicMatch.ts"

test("public Match divisions include only populated values", () => {
  assert.deepEqual(publicMatchDivisions([{ division_number: 3 }, { division_number: 1 }, { division_number: 3 }]), [1, 3])
})
test("unplayed historical courses never look like played zero results", () => {
  assert.equal(historicalCourseLabel({ season_number: 55, division_number: 1, source_final_rank: 1, course_order: 1, historical_course_name: "COURSE", played: false, outcome: null, holes_won: null }), "Unplayed")
})
test("public page uses frozen source rank and historical display name", () => {
  const page = readFileSync("app/match-play/page.tsx", "utf8")
  assert.match(page, /source_final_rank/)
  assert.match(page, /historical_display_name/)
  assert.match(page, /Season \{option\.seasonNumber\}/)
  assert.doesNotMatch(page, /Historical Seasons|Historical standings|canonical_player_id|source_sha256|preview_fingerprint|validated_preview|committed_by/)
})
test("public Match uses read-only sources and no private score paths", () => {
  const page = readFileSync("app/match-play/page.tsx", "utf8")
  assert.match(page, /rpc\("get_public_match_play"\)/)
  assert.match(page, /from\("schedule"\)/)
  assert.match(page, /WHO PLAYS WHO/)
  assert.match(page, /league_type/)
  assert.match(page, /match_roster_version_id/)
  assert.doesNotMatch(page, /commit_historical|set_historical|remember_verified|insert\(|update\(|delete\(|player1_score|player2_score|from\("results"\)/)
})
test("read SQL preserves authoritative current rank and exposes no admin provenance", () => {
  const sql = readFileSync("historical_match_public_read.sql", "utf8")
  assert.match(sql, /standing\.rank/)
  assert.match(sql, /standing\.source_final_rank/)
  assert.match(sql, /standing\.historical_display_name/)
  assert.doesNotMatch(sql, /source_sha256|preview_fingerprint|validated_preview|committed_by|identity_resolution_note/)
  assert.doesNotMatch(sql, /\b(insert|update|delete)\b/i)
})
test("standings-only, null year, and responsive public states are supported", () => {
  const page = readFileSync("app/match-play/page.tsx", "utf8")
  const css = readFileSync("app/match-play/match-play.module.css", "utf8")
  assert.match(page, /historical_standings/)
  assert.match(page, /selectedSchedule/)
  assert.match(css, /@media\(max-width:760px\)/)
  assert.match(css, /overflow-x:hidden/)
  assert.match(css, /data-label/)
})

test("current public rows include roster players even without a standings row", () => {
  const sql = readFileSync("historical_match_public_read.sql", "utf8")
  assert.match(sql, /left join public\.season_standings as standing/)
  assert.match(sql, /coalesce\(standing\.wins, 0\)/)
  assert.match(sql, /coalesce\(standing\.strokes, 0\)/)
})
test("SQL grants only read RPC execution and keeps historical tables behind their RLS", () => {
  const sql = readFileSync("historical_match_public_read.sql", "utf8")
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path to ''/)
  assert.match(sql, /grant execute on function public\.get_public_match_play\(\) to anon/)
  assert.doesNotMatch(sql, /grant (select|insert|update|delete) on (table )?public\.historical_match/i)
  assert.doesNotMatch(sql, /canonical_player_id/)
})
