import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const packageDir = path.join(root, "docs", "handicap", "phase130")
type JsonObject = Record<string, unknown>

function readJson(name: string) {
  return JSON.parse(fs.readFileSync(path.join(packageDir, name), "utf8")) as JsonObject
}

function checksum(name: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(packageDir, name))).digest("hex").toUpperCase()
}

test("Phase 130 index package is deterministic, UUID-bound, and unpublished", () => {
  const manifest = readJson("player_index_approval_manifest.json")
  const publication = readJson("player_index_publication_manifest.json")
  const rows = manifest.rows as Array<JsonObject>
  assert.equal(rows.length, 166)
  assert.equal(new Set(rows.map(row => row.canonical_player_id)).size, 166)
  assert.equal(rows.filter(row => row.handicap_status === "OFFICIAL_ELIGIBLE").length, 120)
  assert.equal(rows.filter(row => row.handicap_status === "PROVISIONAL").length, 46)
  assert.equal(rows.reduce((sum, row) => sum + Number(row.weekly_rows_used), 0), 0)
  assert.ok(rows.every((row: JsonObject) => row.publication_status === "UNPUBLISHED" && row.approval_decision === "PENDING_EXPLICIT_APPROVAL"))
  assert.deepEqual((publication.rows as Array<JsonObject>).map((row: JsonObject) => row.snapshot_id), rows.map((row: JsonObject) => row.snapshot_id))
  assert.ok((publication.rows as Array<JsonObject>).every((row: JsonObject) => row.approval_decision === "PENDING" && row.publication_decision === "PENDING"))
})

test("Phase 130 rating batch preserves five approvals and keeps 73 pending", () => {
  const manifest = readJson("rating_approval_batch_manifest.json")
  assert.equal(manifest.pending_candidate_count, 73)
  assert.equal((manifest.pending_candidates as Array<JsonObject>).length, 73)
  assert.equal((manifest.owner_approved_ratings as Array<JsonObject>).length, 5)
  assert.ok((manifest.pending_candidates as Array<JsonObject>).every((row: JsonObject) => row.owner_decision === "PENDING"))
  const raptor = (manifest.owner_approved_ratings as Array<JsonObject>).find((row: JsonObject) => row.course_id === "Raptor Cliff's_hard")
  assert.equal(raptor?.slope, 12.197)
})

test("Phase 130 checksums cover generated approval artifacts", () => {
  const checksums = readJson("checksums.json")
  assert.equal(checksums["phase130/player_index_approval_manifest.json"], checksum("player_index_approval_manifest.json"))
  assert.equal(checksums["phase130/player_index_publication_manifest.json"], checksum("player_index_publication_manifest.json"))
  assert.equal(checksums["phase130/rating_approval_batch_manifest.json"], checksum("rating_approval_batch_manifest.json"))
})
