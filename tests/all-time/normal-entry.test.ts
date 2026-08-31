import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("normal All-Time admin surfaces keep entry, history, and Climbers separate", () => {
  const hub = read("app/admin/records/page.tsx")
  assert.match(hub, /\/admin\/records\/entry/)
  assert.match(hub, /\/admin\/records\/history/)
  assert.match(hub, /\/admin\/records\/backfill/)
  assert.match(hub, /\/admin\/records\/climbers/)
  assert.match(read("app/admin/records/entry/page.tsx"), /record_all_time_normal_entry/)
  assert.match(read("app/admin/records/history/page.tsx"), /correct_all_time_record_entry/)
  assert.match(read("app/admin/records/history/page.tsx"), /void_all_time_record_entry/)
  assert.match(read("app/admin/records/backfill/page.tsx"), /preview_all_time_late_backfill_entry/)
  assert.match(read("app/admin/records/backfill/page.tsx"), /record_all_time_late_backfill_entry/)
  assert.match(read("app/admin/records/backfill/page.tsx"), /confirmation_token/)
  assert.match(read("app/admin/records/climbers/page.tsx"), /finalize_climbers_season/)
})

test("late/backdated entry keeps authoritative chronology separate and never creates a season", () => {
  const page = read("app/admin/records/backfill/page.tsx")
  assert.match(page, /Aug 15–Aug 28, 2026/)
  assert.match(page, /Exact original timestamp/)
  assert.match(page, /Date known \+ source-backed order/)
  assert.match(page, /No Climbers season is created by this page/)
  assert.match(page, /reviewed the canonical player, authoritative chronology/)
  assert.match(page, /request\.fingerprint !== previewFingerprint/)
  assert.match(read("app/admin/records/history/page.tsx"), /correct_all_time_late_backfill_entry/)
  assert.match(read("app/admin/records/history/page.tsx"), /void_all_time_late_backfill_entry/)
})

test("normal entry preview protects lower-is-better records and describes Climbers", () => {
  const page = read("app/admin/records/entry/page.tsx")
  assert.match(page, /Current PB/)
  assert.match(page, /New PB — passes/)
  assert.match(page, /does not improve the record/)
  assert.match(page, /First score — establishes PB/)
  assert.match(page, /from\("climbers_seasons"\)/)
  assert.match(page, /no active Climbers season — earns 0 Climbers points/)
  assert.match(page, /entryKey/)
})

test("public records only expose detailed card statistics when holes and pars exist", () => {
  const route = read("app/api/records/public/route.ts")
  assert.match(route, /best_observation_id/)
  assert.match(route, /detailedCardStats/)
  assert.match(read("lib/all-time/public-records.ts"), /holeStrokes.length !== 18/)
})
