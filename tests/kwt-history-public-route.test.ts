import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { featureAccessDecision, matchesFeatureRoute } from "../lib/featureVisibility/core.ts"
import { FEATURE_ROUTES } from "../lib/featureVisibility/registry.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("/kwt/history exists and renders the authoritative KWT history fields", () => {
  assert.equal(existsSync("app/kwt/history/page.tsx"), true)
  const page = read("app/kwt/history/page.tsx")
  assert.match(page, /loadPublicKwtHistory/)
  assert.match(page, /KWT Score History/)
  assert.match(page, /Easy course/)
  assert.match(page, /Hard course/)
  assert.match(page, /Combined/)
  assert.match(page, /Placement/)
  assert.match(page, /href="\/kwt"/)
  assert.doesNotMatch(page, /access-denied/)
})

test("/kwt/history reuses historical KWT authority and canonical identity", () => {
  const server = read("lib/kwtHistoryServer.ts")
  assert.match(server, /from\("historical_kwt_scorecards"\)/)
  assert.match(server, /get_public_player_canonical_identity/)
  assert.match(server, /from\("all_time_courses"\)/)
  assert.doesNotMatch(server, /insert\(|update\(|delete\(/)
})

test("/kwt/history inherits the narrow live KWT route and stays public", () => {
  const kwt = FEATURE_ROUTES.find((route) => route.path === "/kwt")
  assert.ok(kwt)
  assert.equal(kwt.visibility, "live")
  assert.equal(matchesFeatureRoute("/kwt/history", kwt.path), true)
  assert.equal(featureAccessDecision({ siteMode: "public", visibility: kwt.visibility, access: null }), "allow")
})

test("public route smoke watch requires /kwt/history", () => {
  const watch = read("scripts/public-route-smoke.mjs")
  assert.match(watch, /route: "\/kwt\/history"/)
  assert.match(watch, /app\/kwt\/history\/page\.tsx/)
})
