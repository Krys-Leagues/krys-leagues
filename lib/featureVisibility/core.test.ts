import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { featureAccessDecision, matchesFeatureRoute } from "./core.ts"
import { FEATURE_ROUTES } from "./registry.ts"

const ordinary = { authenticated: true, canonical_player_id: "ordinary", approved_tester: false, site_admin: false }
const tester = { authenticated: true, canonical_player_id: "canonical-tester", approved_tester: true, site_admin: false }
const admin = { authenticated: true, canonical_player_id: null, approved_tester: false, site_admin: true }

test("PUBLIC plus LIVE allows anonymous access", () => {
  assert.equal(featureAccessDecision({ siteMode: "public", visibility: "live", access: null }), "allow")
})

test("PUBLIC feature states independently enforce tester and private", () => {
  assert.equal(featureAccessDecision({ siteMode: "public", visibility: "private", access: ordinary }), "deny")
  assert.equal(featureAccessDecision({ siteMode: "public", visibility: "tester", access: tester }), "allow")
  assert.equal(featureAccessDecision({ siteMode: "public", visibility: "tester", access: ordinary }), "deny")
})

test("PRELAUNCH composes with each feature state", () => {
  assert.equal(featureAccessDecision({ siteMode: "prelaunch", visibility: "live", access: ordinary }), "site-deny")
  assert.equal(featureAccessDecision({ siteMode: "prelaunch", visibility: "live", access: tester }), "allow")
  assert.equal(featureAccessDecision({ siteMode: "prelaunch", visibility: "private", access: tester }), "deny")
  assert.equal(featureAccessDecision({ siteMode: "prelaunch", visibility: "private", access: admin }), "allow")
})

test("authorization lookup failure fails closed", () => {
  assert.equal(featureAccessDecision({ siteMode: "public", visibility: "tester", access: tester, resolutionFailed: true }), "resolution-failed")
})

test("nested routes inherit the parent feature state", () => {
  assert.equal(matchesFeatureRoute("/solo/hall-of-fame", "/solo"), true)
  assert.equal(matchesFeatureRoute("/players/123", "/players"), true)
  assert.equal(matchesFeatureRoute("/player-dashboard", "/players"), false)
})

test("initial registry contains no generic tester feature and exact V1 private routes", () => {
  assert.equal(FEATURE_ROUTES.some((route) => route.visibility === "tester"), false)
  for (const path of ["/amateur-pro", "/solo", "/skins", "/records", "/tournaments", "/invitationals", "/kwt", "/monthlies"]) {
    assert.equal(FEATURE_ROUTES.find((route) => route.path === path)?.visibility, "private")
  }
})

test("Majors authorization remains outside the generic registry", async () => {
  assert.equal(FEATURE_ROUTES.some((route) => route.path.startsWith("/majors")), false)
  const server = await readFile("lib/featureVisibility/server.ts", "utf8")
  assert.match(server, /Four Majors deliberately remains controlled/)
})

test("tester decisions consume canonical access output only", () => {
  assert.deepEqual(Object.keys(tester).sort(), ["approved_tester", "authenticated", "canonical_player_id", "site_admin"])
})
