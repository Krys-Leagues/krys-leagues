import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { decideAdminGate } from "./core.ts"

const siteAdmin = { siteAdmin: true, soloAdmin: false }
const ordinary = { siteAdmin: false, soloAdmin: false }
const soloAdmin = { siteAdmin: false, soloAdmin: true }

test("anonymous admin requests use the safe login flow", () => {
  assert.equal(decideAdminGate({ pathname: "/admin", authenticated: false, permissions: null }), "login")
  assert.equal(decideAdminGate({ pathname: "/admin/players", authenticated: false, permissions: null }), "login")
})

test("site admins are allowed on root and nested admin routes", () => {
  assert.equal(decideAdminGate({ pathname: "/admin", authenticated: true, permissions: siteAdmin }), "allow")
  assert.equal(decideAdminGate({ pathname: "/admin/settings/advanced", authenticated: true, permissions: siteAdmin }), "allow")
})

test("ordinary players and non-admin testers cannot bypass nested routes", () => {
  assert.equal(decideAdminGate({ pathname: "/admin", authenticated: true, permissions: ordinary }), "deny")
  assert.equal(decideAdminGate({ pathname: "/admin/players/123", authenticated: true, permissions: ordinary }), "deny")
})

test("Solo admins remain limited to the Solo admin subtree", () => {
  assert.equal(decideAdminGate({ pathname: "/admin/solo/results", authenticated: true, permissions: soloAdmin }), "allow")
  assert.equal(decideAdminGate({ pathname: "/admin/players", authenticated: true, permissions: soloAdmin }), "deny")
})

test("authorization failures fail closed", () => {
  assert.equal(decideAdminGate({ pathname: "/admin/import", authenticated: true, permissions: null, resolutionFailed: true }), "failure")
})

test("admin denial and player-site actions remain available", async () => {
  const denial = await readFile("app/access-denied/page.tsx", "utf8")
  const actions = await readFile("app/access-denied/AccessDeniedActions.tsx", "utf8")
  const layout = await readFile("app/admin/layout.tsx", "utf8")
  assert.match(denial, /Admin Access Denied/)
  assert.match(denial, /not authorized for administration/)
  assert.match(actions, /Go to Player Dashboard/)
  assert.match(actions, /Sign Out/)
  assert.match(layout, /href="\/"/)
  assert.match(layout, /← Player Site/)
})

test("the independently protected admin authorization endpoint remains reachable", async () => {
  const proxy = await readFile("proxy.ts", "utf8")
  const endpointExemption = proxy.indexOf('pathname === "/api/auth/admin-authorization"')
  const genericApiGate = proxy.indexOf('pathname.startsWith("/api/")')
  assert.ok(endpointExemption >= 0)
  assert.ok(genericApiGate > endpointExemption)
})
