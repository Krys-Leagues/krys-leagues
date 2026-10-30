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
  assert.equal(registry.features.length, 22)
  assert.ok(registry.features.some((feature) => feature.id === "majors-mga-open"))
  assert.ok(registry.features.some((feature) => feature.id === "trophy-studio-importer"))
  assert.ok(registry.features.some((feature) => feature.id === "homepage-mga-open-banner" && feature.status === "APPROVED"))
  assert.ok(registry.features.some((feature) => feature.id === "mga-open-registration-schedule" && feature.status === "APPROVED"))
  const pendingFeatures = registry.features.filter((feature) => !["homepage-mga-open-banner", "mga-open-registration-schedule", "player-hub-artwork-layout"].includes(feature.id))
  assert.ok(pendingFeatures.every((feature) => feature.status === "PENDING OWNER REVIEW"))
  assert.ok(pendingFeatures.every((feature) => feature.approval.ownerApproved === false))
})

test("approved homepage MGA Championship banner is independently checkpointed", () => {
  const banner = registry.features.find((feature) => feature.id === "homepage-mga-open-banner")
  assert.equal(banner.scope, "banner only; the surrounding homepage remains pending owner review")
  assert.equal(banner.checkpoint.commit, "e8f2ca08277363b6f088f5967a5f32287613e1e1")
  assert.equal(banner.checkpoint.deploymentId, null)
  assert.equal(banner.artwork[0].approvalState, "APPROVED")
  assert.equal(banner.artwork[0].sha256, "CB38060E2F4CA23F71C81BE4600DFD65F2E643D06AFA065B33DBBEF7DDBBC279")
  assert.equal(banner.requiredInteractions[1], "entire banner links to /majors/major-2")
})

test("MGA schedule approval is narrower than the full Majors approval", () => {
  const schedule = registry.features.find((feature) => feature.id === "mga-open-registration-schedule")
  assert.equal(schedule.scope, "schedule interface only; authenticated VIP submission, non-VIP rejection, and Production launch remain pending verification")
  assert.equal(schedule.checkpoint.commit, "d156d63dee7d37dcade1e3d22c7ae49a9c491c2e")
  assert.equal(schedule.checkpoint.deploymentId, "dpl_4EPP7VfwE3ZifWfthKoeCnFDC3CE")
  assert.deepEqual(schedule.routes, ["/majors/major-2", "/majors/major-2/vip"])
  assert.ok(schedule.requiredInteractions.includes("Thursday slots 1–12"))
  assert.ok(schedule.requiredInteractions.includes("Sunday slots 37–48"))
  assert.equal(schedule.evidenceGaps.includes("authenticated VIP submission"), true)
  assert.equal(schedule.evidenceGaps.includes("authenticated non-VIP rejection"), true)
  assert.equal(schedule.evidenceGaps.includes("Production launch approval"), true)
})

test("approved MGA schedule markers fail closed when its controls are removed", () => {
  const candidate = structuredClone(registry)
  candidate.features.find((feature) => feature.id === "mga-open-registration-schedule").sourceMarkers[0].text = "missing schedule control marker"
  const result = validateRegistry(candidate, { candidateCommit: head })
  assert.ok(result.errors.some((error) => error.includes("mga-open-registration-schedule source marker is missing")))
})

test("replacing or removing the approved homepage MGA banner fails closed", () => {
  const bannerHashChanged = structuredClone(registry)
  bannerHashChanged.features.find((feature) => feature.id === "homepage-mga-open-banner").artwork[0].sha256 = "0".repeat(64)
  const changedResult = validateRegistry(bannerHashChanged, { candidateCommit: head })
  assert.ok(changedResult.errors.some((error) => error.includes("homepage-mga-open-banner artwork hash mismatch")))

  const bannerRemoved = structuredClone(registry)
  bannerRemoved.features.find((feature) => feature.id === "homepage-mga-open-banner").artwork[0].path = "public/approved-pages/missing-mga-banner.png"
  const removedResult = validateRegistry(bannerRemoved, { candidateCommit: head })
  assert.ok(removedResult.errors.some((error) => error.includes("homepage-mga-open-banner missing artwork")))
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
