import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { validateRegistry } from "../../scripts/verify-feature-registry.mjs"

const root = resolve(import.meta.dirname, "../..")
const registry = JSON.parse(readFileSync(resolve(root, "release/approved-feature-registry.json"), "utf8"))
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
const baseline = "2252ff7ec162476189f4f31b48c03add0e024ba6"

test("registry inventories every requested feature family without inferred approval", () => {
  assert.equal(registry.features.length, 20)
  assert.ok(registry.features.some((feature) => feature.id === "majors-mga-open"))
  assert.ok(registry.features.some((feature) => feature.id === "trophy-studio-importer"))
  assert.ok(registry.features.some((feature) => feature.id === "homepage-mga-open-banner" && feature.status === "APPROVED"))
  assert.ok(registry.features.filter((feature) => feature.id !== "homepage-mga-open-banner").every((feature) => feature.status === "PENDING OWNER REVIEW"))
  assert.ok(registry.features.filter((feature) => feature.id !== "homepage-mga-open-banner").every((feature) => feature.approval.ownerApproved === false))
})

test("approved homepage MGA Open banner is independently checkpointed", () => {
  const banner = registry.features.find((feature) => feature.id === "homepage-mga-open-banner")
  assert.equal(banner.scope, "banner only; the surrounding homepage remains pending owner review")
  assert.equal(banner.checkpoint.commit, "8e58a6caa365ac350335e1ee6d3a572ac9c323fa")
  assert.equal(banner.checkpoint.deploymentId, "dpl_7aNR1Ve5DjUizWQh5FtEyR68xj1a")
  assert.equal(banner.artwork[0].approvalState, "APPROVED")
  assert.equal(banner.artwork[0].sha256, "4E16EA16AD3CAD95692DD80822443DD37E97963ECCE182547DE8136BCB5C3056")
  assert.equal(banner.requiredInteractions[1], "entire banner links to /majors/major-2")
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
