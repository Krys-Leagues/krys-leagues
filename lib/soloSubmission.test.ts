import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync(new URL("../supabase/migrations/20261005120000_solo_player_submission_review.sql", import.meta.url), "utf8")
const closeMigration = fs.readFileSync(new URL("../supabase/migrations/20261005130000_solo_close_uses_verified_submissions.sql", import.meta.url), "utf8")
const dashboard = fs.readFileSync(new URL("../app/player-dashboard/PlayerDashboardClient.tsx", import.meta.url), "utf8")
const submit = fs.readFileSync(new URL("../app/solo/submit/page.tsx", import.meta.url), "utf8")
const publicPage = fs.readFileSync(new URL("../app/solo/page.tsx", import.meta.url), "utf8")

test("Solo submissions are canonical, roster-gated, private, and additive", () => {
  assert.match(migration, /create table if not exists public\.solo_submissions/)
  assert.match(migration, /player_id uuid not null references public\.players\(id\)/)
  assert.match(migration, /status text not null default 'provisional'/)
  assert.match(migration, /submission_intent text not null check \(submission_intent in \('score','ace'\)\)/)
  assert.match(submit, /api\/solo\/submissions/)
  assert.match(submit, /SUBMIT ACE CARD/)
  assert.match(submit, /Negative scores are valid/)
})

test("Solo public board exposes provisional and verified state without duplicating rows", () => {
  assert.match(migration, /get_public_solo_live_v2/)
  assert.match(migration, /solo_live_best_attempts_v2/)
  assert.match(migration, /solo_live_hn1_recognition_v2/)
  assert.match(publicPage, /get_public_solo_live_v2/)
  assert.match(publicPage, /PROVISIONAL/)
  assert.match(publicPage, /VERIFIED/)
})

test("Solo verification and finalization remain authoritative and safe", () => {
  assert.match(migration, /review_solo_submission/)
  assert.match(migration, /solo_finalization_guard_trigger/)
  assert.match(migration, /WEEK CANNOT BE FINALIZED/)
  assert.match(dashboard, /api\/solo\/dashboard/)
  assert.match(dashboard, /SUBMIT SCORE/)
  assert.match(dashboard, /SUBMIT ACE CARD/)
})

test("live rollover is separate from manual finalization", () => {
  assert.match(migration, /due_date is null or due_date > current_date/)
  assert.match(migration, /WEEK CANNOT BE FINALIZED/)
  assert.match(closeMigration, /create or replace function public\.close_solo_week/)
  assert.match(closeMigration, /solo_live_best_attempts_v2/)
  assert.match(closeMigration, /solo_live_hn1_recognition_v2/)
  assert.match(closeMigration, /set status = 'closed'/)
})
