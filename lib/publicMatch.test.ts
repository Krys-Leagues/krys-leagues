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
  assert.doesNotMatch(page, /canonical_player_id|source_sha256|preview_fingerprint|validated_preview|committed_by/)
})
test("public Match uses only its read RPC and no historical write paths", () => {
  const page = readFileSync("app/match-play/page.tsx", "utf8")
  assert.match(page, /rpc\("get_public_match_play"\)/)
  assert.doesNotMatch(page, /commit_historical|set_historical|remember_verified|insert\(|update\(|delete\(/)
  assert.doesNotMatch(page, /opponent|fixture/i)
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
  assert.match(page, /standings_only/)
  assert.match(page, /historical_year !== null/)
  assert.match(page, /No course-level history was recorded/)
  assert.match(css, /@media\(max-width:680px\)/)
  assert.match(css, /overflow-x:auto/)
})
test("SQL grants only read RPC execution and keeps historical tables behind their RLS", () => {
  const sql = readFileSync("historical_match_public_read.sql", "utf8")
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path to ''/)
  assert.match(sql, /grant execute on function public\.get_public_match_play\(\) to anon/)
  assert.doesNotMatch(sql, /grant (select|insert|update|delete) on (table )?public\.historical_match/i)
  assert.doesNotMatch(sql, /canonical_player_id/)
})
