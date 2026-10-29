import assert from "node:assert/strict"
import test from "node:test"

import {
  decideSiteAccessGate,
  isPrelaunchEntryPath,
  parseSiteAccessMode,
  safePrelaunchNext,
  siteAccessAllowed,
  testingAccessRedirect,
} from "./core.ts"

const ordinary = { authenticated: true, canonical_player_id: "ordinary", approved_tester: false, site_admin: false }
const tester = { authenticated: true, canonical_player_id: "canonical-tester", approved_tester: true, site_admin: false }
const admin = { authenticated: true, canonical_player_id: null, approved_tester: false, site_admin: true }

test("anonymous and ordinary players are denied during prelaunch", () => {
  assert.equal(siteAccessAllowed(null), false)
  assert.equal(siteAccessAllowed(ordinary), false)
})

test("PUBLIC mode bypasses prelaunch authorization", () => {
  assert.equal(parseSiteAccessMode(undefined), "public")
  assert.equal(parseSiteAccessMode("public"), "public")
  assert.equal(parseSiteAccessMode("prelaunch"), "prelaunch")
  assert.equal(decideSiteAccessGate({ mode: "public", pathname: "/players", access: null }), "allow")
})

test("PRELAUNCH authorization failure fails closed", () => {
  assert.equal(decideSiteAccessGate({ mode: "prelaunch", pathname: "/players/111", access: tester, resolutionFailed: true }), "boundary")
})

test("approved canonical tester and site admin are allowed", () => {
  assert.equal(siteAccessAllowed(tester), true)
  assert.equal(tester.canonical_player_id, "canonical-tester")
  assert.equal(siteAccessAllowed(admin), true)
})

test("safe nested next paths are preserved", () => {
  assert.equal(safePrelaunchNext("/players/111?tab=trophies"), "/players/111?tab=trophies")
  assert.equal(testingAccessRedirect("/stroke"), "/testing-access?next=%2Fstroke")
})

test("external, protocol-relative, encoded and script next values are rejected", () => {
  for (const value of [
    "https://example.com",
    "//example.com/path",
    "%2f%2fevil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,hello",
  ]) assert.equal(safePrelaunchNext(value), "/")
})

test("entry paths are explicit and cannot redirect-loop", () => {
  assert.equal(isPrelaunchEntryPath("/testing-access"), true)
  assert.equal(isPrelaunchEntryPath("/auth/callback"), true)
  assert.equal(isPrelaunchEntryPath("/players"), false)
  assert.equal(safePrelaunchNext("/testing-access?next=%2Fplayers"), "/")
  assert.equal(safePrelaunchNext("/auth/callback?code=secret"), "/")
  assert.equal(decideSiteAccessGate({ mode: "prelaunch", pathname: "/auth/callback", access: null }), "allow")
  assert.equal(decideSiteAccessGate({ mode: "prelaunch", pathname: "/testing-access", access: ordinary }), "boundary")
  assert.equal(decideSiteAccessGate({ mode: "prelaunch", pathname: "/testing-access", access: tester }), "continue")
})

test("individual feature decisions remain independent after site entry", () => {
  assert.equal(decideSiteAccessGate({ mode: "prelaunch", pathname: "/future-private", access: tester }), "allow")
  assert.equal("private", "private")
})

test("archived or merged identities cannot qualify independently", () => {
  const archivedSource = { authenticated: true, canonical_player_id: null, approved_tester: false, site_admin: false }
  assert.equal(siteAccessAllowed(archivedSource), false)
})

test("site access decisions contain no email or display-name matching inputs", () => {
  assert.deepEqual(Object.keys(tester).sort(), [
    "approved_tester",
    "authenticated",
    "canonical_player_id",
    "site_admin",
  ])
})
