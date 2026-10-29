import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { validateRegistry } from "../../scripts/verify-feature-registry.mjs"

const root = resolve(import.meta.dirname, "../..")
const registry = JSON.parse(readFileSync(resolve(root, "release/approved-feature-registry.json"), "utf8"))
const head = "54882a8877f43afe06b54846e7c70d04c90ef017"
const baseline = "2252ff7ec162476189f4f31b48c03add0e024ba6"

test("registry inventories every requested feature family without inferred approval", () => {
  assert.equal(registry.features.length, 19)
  assert.ok(registry.features.some((feature) => feature.id === "majors-mga-open"))
  assert.ok(registry.features.some((feature) => feature.id === "trophy-studio-importer"))
  assert.ok(registry.features.every((feature) => feature.status === "PENDING OWNER REVIEW"))
  assert.ok(registry.features.every((feature) => feature.approval.ownerApproved === false))
})

test("current candidate passes route, artwork, and checkpoint verification", () => {
  const result = validateRegistry(registry, { candidateCommit: head, changedFrom: baseline })
  assert.deepEqual(result.errors, [])
})

test("changed protected artwork fails closed", () => {
  const candidate = structuredClone(registry)
  candidate.features.find((feature) => feature.id === "majors-mga-open").artwork[0].sha256 = "0".repeat(64)
  const result = validateRegistry(candidate, { candidateCommit: head })
  assert.ok(result.errors.some((error) => error.includes("artwork hash mismatch")))
})

test("removed approved route fails closed", () => {
  const candidate = structuredClone(registry)
  candidate.features.find((feature) => feature.id === "player-profiles").routes = ["/players", "/players/missing-approved-route"]
  const result = validateRegistry(candidate, { candidateCommit: head })
  assert.ok(result.errors.some((error) => error.includes("route /players/missing-approved-route is missing")))
})

test("unreviewed changed paths fail closed", () => {
  const candidate = structuredClone(registry)
  const result = validateRegistry(candidate, { candidateCommit: head, changedFrom: baseline })
  assert.deepEqual(result.errors, [])
  candidate.policy.sharedInfrastructurePaths = []
  const blocked = validateRegistry(candidate, { candidateCommit: head, changedFrom: baseline })
  assert.ok(blocked.errors.some((error) => error.includes("unreviewed changed path")))
})
