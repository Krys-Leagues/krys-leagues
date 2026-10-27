import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import { KWT_SEASON_15_WEEK_01_SOURCE, KWT_SEASON_15_WEEK_01_IDENTITIES } from "../lib/kwtSeason15Week01Verification.ts"

const dashboard = fs.readFileSync("app/admin/kwt/page.tsx", "utf8")
const activeGames = fs.readFileSync("app/admin/kwt/active-games/page.tsx", "utf8")

test("KWT admin navigation does not point at the removed standings route", () => {
  assert.doesNotMatch(dashboard, /kwt-standings/)
  assert.doesNotMatch(activeGames, /kwt-standings/)
})

test("KWT admin exposes every protected operational workflow route", () => {
  for (const route of ["results", "scorecards", "divisions", "finalization", "aces", "history"]) {
    assert.ok(fs.existsSync(`app/admin/kwt/${route}/page.tsx`), `missing /admin/kwt/${route}`)
    assert.match(dashboard, new RegExp(`/admin/kwt/${route}`))
  }
})

test("KWT Week Management reports the activated operational state instead of the pre-activation empty-state text", () => {
  const page = fs.readFileSync("app/admin/kwt/week-management/page.tsx", "utf8")
  assert.match(page, /api\/admin\/kwt\/reporting/)
  assert.match(page, /official Season 15 Week 01 operational result rows/)
  assert.doesNotMatch(page, /Production has no Season 15 operational result rows at this checkpoint/)
})

test("KWT reporting remains admin-authorized and read-only", () => {
  const route = fs.readFileSync("app/api/admin/kwt/reporting/route.ts", "utf8")
  assert.ok(route.indexOf("await authorizeSiteAdminMutation()") >= 0)
  assert.ok(route.indexOf("loadVerifiedKwtNetPayload()") >= 0)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
})

test("Week 01 source evidence and identity ledger remain complete", () => {
  assert.equal(KWT_SEASON_15_WEEK_01_SOURCE.eventIdentifier, "KWTS15W01")
  assert.equal(KWT_SEASON_15_WEEK_01_SOURCE.courseName, "Raptor Cliffs")
  assert.equal(KWT_SEASON_15_WEEK_01_SOURCE.ownerConfirmedHandicapFreezeCutoff, "2026-10-23T04:00:00Z")
  assert.equal(Object.keys(KWT_SEASON_15_WEEK_01_IDENTITIES).length, 14)
  assert.equal(KWT_SEASON_15_WEEK_01_SOURCE.officialDate, "2026-10-24")
})
