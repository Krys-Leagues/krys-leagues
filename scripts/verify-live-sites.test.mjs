import { test } from "node:test"
import assert from "node:assert/strict"
import { checkBaseline, classifyRoute, parseLinks, resolveZoneId, validateDeploymentEvent } from "./verify-live-sites.mjs"

test("manifest baselines fail closed until a deployment and commit are recorded", () => {
  const issues = checkBaseline({ projectId: "prj_test", repository: "Krys-Leagues/test", approvedBaseline: { deploymentId: null, commitSha: null } }, { deploymentId: "dpl_test", commitSha: "abc", projectId: "prj_test", repository: "Krys-Leagues/test" })
  assert.equal(issues.length, 1)
  assert.match(issues[0], /not recorded/)
})

test("provenance mismatches are detected as rollback/candidate drift", () => {
  const issues = checkBaseline({ projectId: "prj_expected", repository: "Krys-Leagues/example", approvedBaseline: { deploymentId: "dpl_approved", commitSha: "abc" } }, { deploymentId: "dpl_other", commitSha: "def", projectId: "prj_wrong", repository: "other/repo" })
  assert.equal(issues.length, 4)
  assert.match(issues[0], /project/)
  assert.match(issues[1], /repository/)
  assert.match(issues[2], /Deployment dpl_other differs/)
  assert.match(issues[3], /Commit def differs/)
})

test("hub and back-link checks can compare exact destinations", () => {
  const links = parseLinks('<a href="https://54321.krysleagues.com/tournaments/5-4-3-2-1">5-4-3-2-1</a><a href="https://krysleagues.com/">Back to Hub</a>', "https://krysleagues.com/")
  assert.deepEqual(links, [
    { href: "https://54321.krysleagues.com/tournaments/5-4-3-2-1", label: "5-4-3-2-1" },
    { href: "https://krysleagues.com/", label: "Back to Hub" }
  ])
})

test("deployment metadata resolves to exactly one manifest zone", () => {
  const manifest = { zones: [{ id: "mga", projectId: "prj_mga", repository: "Krys-Leagues/mga" }] }
  assert.equal(resolveZoneId(manifest, { projectId: "prj_mga" }), "mga")
  assert.equal(resolveZoneId(manifest, { projectId: "prj_unknown" }), null)
})

test("repository-dispatch validation fails closed on incomplete provenance", () => {
  const manifest = { hub: { id: "main-hub" }, zones: [{ id: "mga", projectId: "prj_mga", repository: "Krys-Leagues/mga" }] }
  const issues = validateDeploymentEvent(manifest, { projectId: "prj_mga", repository: "Krys-Leagues/mga" }, "mga")
  assert.deepEqual(issues, ["Deployment event is missing deployment_id.", "Deployment event is missing commit_sha."])
})

test("public access uncertainty is distinct from a confirmed broken public route", () => {
  assert.equal(classifyRoute({ publicAccess: "NOT_YET_PUBLIC" }, { ok: false, status: 404 }), "NOT_YET_PUBLIC")
  assert.equal(classifyRoute({ publicAccess: "PUBLIC_DOMAIN_OBSERVED" }, { ok: false, status: 404 }), "BROKEN_ROUTE")
  assert.equal(classifyRoute({ publicAccess: "PUBLIC_DOMAIN_OBSERVED" }, { ok: false, status: 403 }), "INACCESSIBLE")
})
