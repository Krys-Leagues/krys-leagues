import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = process.cwd()
const guard = "scripts/verify-approved-artwork-release.mjs"

test("release guard requires approved artwork and Production ancestry", () => {
  const script = readFileSync(guard, "utf8")
  assert.match(script, /ArtworkNavigation/)
  assert.match(script, /mainHubArtwork/)
  assert.match(script, /leaguePlayArtwork/)
  assert.match(script, /joinArtwork/)
  assert.match(script, /kwtArtwork/)
  assert.match(script, /join-leagues-approved\.jpg/)
  assert.match(script, /kwt-hub-approved\.jpg/)
  assert.match(script, /merge-base.*--is-ancestor/)
})

test("release guard accepts the current Production-integrated ancestor", () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  const output = execFileSync(process.execPath, [guard, "--production-commit", head], { cwd: root, encoding: "utf8" })
  assert.match(output, /READY: approved Main Hub, League Play, Join, and KWT markers present/)
})

test("release guard rejects the legacy origin/main homepage baseline", () => {
  const result = spawnSync(process.execPath, [guard, "--production-commit", "e655e8137be94bc79626e88ecbcb9538628667ac", "--canonical-production-commit", "60eb4a1340ac3dbbb79fcd99783313dc483ba990", "--candidate-commit", "e655e8137be94bc79626e88ecbcb9538628667ac"], { cwd: root, encoding: "utf8" })
  assert.equal(result.status, 1)
  assert.match(`${result.stdout}\n${result.stderr}`, /banned .*legacy homepage|not the approved-artwork homepage/i)
})
