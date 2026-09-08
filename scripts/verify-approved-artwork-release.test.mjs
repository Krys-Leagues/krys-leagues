import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = process.cwd()
const guard = "scripts/verify-approved-artwork-release.mjs"

test("release guard requires an exact candidate SHA and candidate-tree checks", () => {
  const script = readFileSync(guard, "utf8")
  assert.match(script, /merge-base/)
  assert.match(script, /--is-ancestor/)
  assert.match(script, /candidateCommit/)
  assert.match(script, /sourceAtCandidate/)
  assert.match(script, /cat-file/)
  assert.match(script, /approved public route markers and assets/)
})

test("release guard accepts the committed recovery candidate descended from live Production", () => {
  const candidate = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  const output = execFileSync(process.execPath, [
    guard,
    "--production-commit", "de16589e6b2607c4fe690dc0beab05463a517c51",
    "--candidate-commit", candidate,
  ], { cwd: root, encoding: "utf8" })
  assert.match(output, /READY: exact candidate/)
})

test("release guard rejects an omitted candidate SHA", () => {
  const result = spawnSync(process.execPath, [guard, "--production-commit", "de16589e6b2607c4fe690dc0beab05463a517c51"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(result.status, 1)
  assert.match(result.stdout + "\n" + result.stderr, /Exact deployment candidate commit is required/)
})

test("release guard rejects a candidate not descended from current Production", () => {
  const result = spawnSync(process.execPath, [
    guard,
    "--production-commit", "de16589e6b2607c4fe690dc0beab05463a517c51",
    "--candidate-commit", "5f2885fe7783b851d51c26bde965da7569eacf8d",
  ], { cwd: root, encoding: "utf8" })
  assert.equal(result.status, 1)
  assert.match(result.stdout + "\n" + result.stderr, /not descended from current live Production/)
})

test("release guard rejects the legacy homepage candidate", () => {
  const result = spawnSync(process.execPath, [
    guard,
    "--production-commit", "e655e8137be94bc79626e88ecbcb9538628667ac",
    "--candidate-commit", "e655e8137be94bc79626e88ecbcb9538628667ac",
  ], { cwd: root, encoding: "utf8" })
  assert.equal(result.status, 1)
  assert.match(result.stdout + "\n" + result.stderr, /exact-candidate public release guard failed/)
})