import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = process.cwd()
const guard = "scripts/verify-approved-artwork-release.mjs"

test("release guard requires approved artwork and Production ancestry", () => {
  const script = readFileSync(guard, "utf8")
  assert.match(script, /ArtworkNavigation/)
  assert.match(script, /mainHubArtwork/)
  assert.match(script, /leaguePlayArtwork/)
  assert.match(script, /merge-base.*--is-ancestor/)
})

test("release guard accepts the current Production-integrated ancestor", () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  const output = execFileSync(process.execPath, [guard, "--production-commit", head], { cwd: root, encoding: "utf8" })
  assert.match(output, /READY: approved Main Hub and League Play markers present/)
})
