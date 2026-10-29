import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const manifest = JSON.parse(readFileSync(resolve(root, "release/isolated-development-manifest.json"), "utf8"))
const safetyScript = readFileSync(resolve(root, "scripts/verify-release-safety.mjs"), "utf8")
const worktreeScript = readFileSync(resolve(root, "scripts/create-isolated-feature-worktree.ps1"), "utf8")
const previewScript = readFileSync(resolve(root, "scripts/validate-staging-preview-report.mjs"), "utf8")

test("manifest keeps Production and staging targets distinct", () => {
  assert.notEqual(manifest.productionDatabaseProject, manifest.stagingDatabaseProject)
  assert.deepEqual(manifest.productionDomains, ["krysleagues.com", "www.krysleagues.com"])
  for (const route of ["/majors", "/tournaments", "/course-challenges"]) assert.ok(manifest.requiredRoutes.includes(route))
})
test("release safety rejects an unclean candidate", () => {
  assert.match(safetyScript, /status.*porcelain=v1/s)
  assert.match(safetyScript, /Candidate worktree is not clean/)
  assert.match(safetyScript, /supabase\/migrations/)
  assert.match(safetyScript, /sharedStagingAliasChange: false/)
})
test("worktree creator refuses reuse and never uses production deployment flags", () => {
  assert.match(worktreeScript, /Refusing to reuse existing worktree path/)
  assert.match(worktreeScript, /git .*worktree add -b/)
  assert.doesNotMatch(worktreeScript, /--prod|promote|rollback/)
})
test("Preview evidence requires a private READY deployment and untouched Production", () => {
  assert.match(previewScript, /deploymentStatus !== "READY"/)
  assert.match(previewScript, /\.vercel\.app/)
  assert.match(previewScript, /productionTouched !== false/)
  assert.match(previewScript, /sharedStagingAliasChanged !== false/)
})
test("current baseline is clean and anchored at the approved MGA Open commit", () => {
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", manifest.centralBaselineCommit, "HEAD"], { cwd: root })
  assert.equal(ancestry.status, 0)
  assert.equal(execFileSync("git", ["diff", "--name-status", `${manifest.centralBaselineCommit}..HEAD`, "--", "supabase/migrations"], { cwd: root, encoding: "utf8" }).trim(), "")
})
test("safety script accepts the clean baseline", () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  const result = spawnSync(process.execPath, ["scripts/verify-release-safety.mjs", "--baseline", manifest.centralBaselineCommit, "--commit", head], { cwd: root, encoding: "utf8" })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /"status": "READY"/)
})
