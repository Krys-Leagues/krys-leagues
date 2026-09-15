import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("All-Time fast entry exposes optional manual scorecard evidence above score inputs", () => {
  const page = read("app/admin/records/entry/page.tsx")
  const evidence = read("components/admin/records/ScorecardEvidence.tsx")
  assert.ok(page.indexOf("<ScorecardEvidence") < page.indexOf("data-testid=\"normal-one-player-scorecard\""))
  assert.match(evidence, /scorecard-drop-zone/)
  assert.match(evidence, /type="file"/)
  assert.match(evidence, /onDrop=/)
  assert.match(evidence, /Zoom in/)
  assert.match(evidence, /Zoom out/)
  assert.match(evidence, /Fit \/ reset/)
  assert.match(evidence, /Rotate/)
  assert.match(evidence, /Full screen/)
  assert.match(evidence, /object-contain/)
  assert.match(page, /Manually entered scores remain authoritative/)
})

test("fast-entry actions are distinct and duplicate saves are guarded", () => {
  const page = read("app/admin/records/entry/page.tsx")
  const fingerprint = page.slice(page.indexOf("async function fingerprintForEntry"), page.indexOf("async function previewEntry"))
  assert.match(page, /ADD AGAIN SC/)
  assert.match(page, /saveEntry\("add_again"\)/)
  assert.match(page, /saveEntry\("add_again_scorecard"\)/)
  assert.match(page, /saveEntry\("finish"\)/)
  assert.match(page, /savingRef\.current/)
  assert.match(page, /Duplicate prevented/)
  assert.match(page, /Do not resubmit the score/)
  assert.doesNotMatch(fingerprint, /verifiedSourceBatchId/)
})

test("verified-period intake preserves source-backed ordering and reports replay results", () => {
  const page = read("app/admin/records/entry/page.tsx")
  assert.match(page, /AUTHORITATIVE BACKLOG CHRONOLOGY/)
  assert.match(page, /admin entry time is never used/)
  assert.match(page, /p_authoritative_submitted_date: verifiedDate/)
  assert.match(page, /p_authoritative_submission_order: Number\(verifiedOrder\)/)
  assert.match(page, /p_verified_source_batch_id: verifiedSourceBatchRef\.current/)
  assert.match(page, /saved\.climbers_points \?\? points/)
  assert.match(page, /CLIMBERS: \$\{savedPoints\}/)
  assert.doesNotMatch(page, /PENDING PERIOD REPLAY|0 points · pending replay/)
})

test("session log records PB movement, Climbers, evidence, and saved time", () => {
  const page = read("app/admin/records/entry/page.tsx")
  assert.match(page, /pbBefore/)
  assert.match(page, /pbAfter/)
  assert.match(page, /Scorecard \{entry\.scorecard\}/)
  assert.match(page, /Saved \{entry\.savedAt\}/)
  assert.match(page, /NEW PB/)
  assert.match(page, /NO NEW PB/)
  assert.match(page, /CLIMBERS:/)
})

test("scorecard upload is protected and binds evidence to the saved canonical observation", () => {
  const route = read("app/api/admin/records/all-time/scorecard/route.ts")
  const authorization = route.indexOf("await authorizeSiteAdminMutation()")
  const service = route.indexOf("createAllTimeScorecardServiceClient()")
  assert.ok(authorization >= 0 && service > authorization)
  assert.match(route, /all_time_record_observations/)
  assert.match(route, /observation\.data\.player_id !== playerId/)
  assert.match(route, /observation\.data\.course_id !== courseId/)
  assert.match(route, /uploaded_by: authorization\.user\.id/)
  assert.match(route, /all_time_scorecard_attachments/)
  assert.doesNotMatch(read("app/admin/records/entry/page.tsx"), /storage\.from/)
})

test("prepared scorecard migration is private, forward-only, and non-destructive", () => {
  const sql = read("20260915_all_time_scorecard_attachments.sql")
  assert.match(sql, /^begin;/i)
  assert.match(sql, /create table if not exists public\.all_time_scorecard_attachments/i)
  assert.match(sql, /observation_id uuid not null unique references public\.all_time_record_observations\(id\) on delete restrict/i)
  assert.match(sql, /uploaded_by uuid not null references auth\.users\(id\) on delete restrict/i)
  assert.match(sql, /alter table public\.all_time_scorecard_attachments enable row level security/i)
  assert.match(sql, /revoke all on table public\.all_time_scorecard_attachments from public, anon, authenticated/i)
  assert.match(sql, /'all-time-scorecards'[\s\S]+false/i)
  assert.doesNotMatch(sql, /delete from|truncate|drop table/i)
  assert.match(sql, /commit;\s*$/i)
})
