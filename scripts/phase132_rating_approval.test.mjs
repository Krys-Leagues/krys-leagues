import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const dir = path.join(root, "docs", "handicap", "phase132")
const phase125 = JSON.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase121", "rating_approval_manifest.json"), "utf8"))
const owner = JSON.parse(fs.readFileSync(path.join(dir, "rating_owner_decision_manifest.json"), "utf8"))
const checksums = JSON.parse(fs.readFileSync(path.join(dir, "checksums.json"), "utf8"))

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()

test("Phase132 verifies the full Phase130 batch checksum and exact Phase125 match", () => {
  assert.equal(sha256(path.join(root, "docs", "handicap", "phase130", "rating_approval_batch_manifest.json")), "52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B")
  assert.equal(sha256(path.join(root, "docs", "handicap", "phase121", "rating_approval_manifest.json")), "09382A8C7901F549377ADE119E3DF5068CD40A9C8FF9629F572DA5FE7EFB22A6")
  assert.equal(owner.exact_match.exact_match, true)
  assert.equal(owner.rows.length, 73)
  assert.equal(new Set(owner.rows.map((row) => row.snapshot_id)).size, 73)
  assert.equal(owner.rows.every((row) => row.production_decision === "ACCEPT" && row.production_recorded === false), true)
})

test("Phase132 preserves source values, dependencies, five prior approvals, and catalog holds", () => {
  const p125ById = new Map(phase125.rows.map((row) => [row.snapshot_id, row]))
  for (const row of owner.rows) {
    const source = p125ById.get(row.snapshot_id)
    assert.ok(source)
    for (const key of ["course_id", "difficulty", "course_rating", "slope", "sample_size", "distinct_players", "maximum_player_concentration", "rating_confidence", "source_scope", "weekly_rows_used", "referenced_index_candidates", "referenced_best_five_candidates"]) {
      assert.deepEqual(row[key], source[key], `${row.snapshot_id}:${key}`)
    }
  }
  assert.deepEqual(owner.prior_approvals_preserved.map((row) => row.course_id), [
    "Bogey's Bonanza_hard", "Forgotten Fairyland_easy", "Original Gothic_easy", "Raptor Cliff's_hard", "Shangri-La_easy",
  ])
  assert.deepEqual(owner.explicit_catalog_holds.map((row) => [row.course_id, row.status]), [
    ["Hollywood_easy", "HOLD_PROVISIONAL"],
    ["Hollywood_hard", "HOLD_PROVISIONAL"],
    ["Gloop Lair_easy", "HOLD_UNRATED"],
    ["Gloop Lair_hard", "HOLD_UNRATED"],
  ])
})

test("Phase132 installation is append-only decision metadata and cannot publish ratings or indexes", () => {
  const sql = fs.readFileSync(path.join(dir, "production_rating_decision_installation.sql"), "utf8")
  const preflight = fs.readFileSync(path.join(dir, "production_rating_decision_preflight.sql"), "utf8")
  const postflight = fs.readFileSync(path.join(dir, "production_rating_decision_postflight.sql"), "utf8")
  assert.equal((sql.match(/'SOURCE_RECORD'/g) ?? []).length, 146)
  assert.equal((sql.match(/insert into public\.handicap_review_evidence/g) ?? []).length, 1)
  assert.equal((sql.match(/insert into public\.handicap_review_decisions/g) ?? []).length, 1)
  assert.equal(sql.includes("on conflict"), false)
  assert.equal(sql.includes("update "), false)
  assert.equal(sql.includes("delete "), false)
  assert.equal(sql.includes("truncate"), false)
  assert.equal(sql.includes("'PUBLISHED'"), false)
  assert.equal(sql.includes("handicap_index_snapshots"), true)
  assert.equal(sql.includes("insert into public.handicap_index_snapshots"), false)
  assert.equal(sql.includes("insert into public.handicap_rating_snapshots"), false)
  assert.equal(sql.includes("pg_advisory_xact_lock"), true)
  assert.equal(preflight.includes("has_table_privilege('anon'"), true)
  assert.equal(postflight.includes("has_table_privilege('authenticated'"), true)
  assert.equal(preflight.includes("set transaction read only"), true)
  assert.equal(postflight.includes("set transaction read only"), true)
  assert.equal(Object.keys(checksums.files).length, 7)
  for (const [name, expected] of Object.entries(checksums.files)) assert.equal(sha256(path.join(dir, name)), expected, name)
})
