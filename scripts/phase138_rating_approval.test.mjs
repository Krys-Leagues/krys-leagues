import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const root = process.cwd()
const dir = path.join(root, "docs", "handicap", "phase138")
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("hex").toUpperCase()
const json = file => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))

test("Phase 138 package has 73 exact unique Production targets", () => {
  const manifest = json("rating_owner_decision_manifest.json")
  const mapping = Papa.parse(fs.readFileSync(path.join(dir, "owner_rating_snapshot_mapping.csv"), "utf8"), { header: true, skipEmptyLines: true }).data
  assert.equal(manifest.rows.length, 73)
  assert.equal(mapping.length, 73)
  assert.equal(new Set(mapping.map(row => row.target_snapshot_id)).size, 73)
  assert.equal(new Set(mapping.map(row => row.approved_local_snapshot_id)).size, 73)
  assert.ok(mapping.every(row => row.review_scope === "KWT_ONLY" && row.model_version === "krys-course-rating-elite-lowest-12-v1"))
  assert.ok(mapping.every(row => Number(row.approved_slope) > 0.01))
  assert.equal(mapping.filter(row => row.target_kind === "PHASE136_SUCCESSOR").length, 15)
  assert.equal(mapping.filter(row => row.target_kind === "EXISTING_PRODUCTION").length, 58)
})

test("Phase 138 preserves owner decision boundaries", () => {
  const manifest = json("rating_owner_decision_manifest.json")
  assert.equal(manifest.status, "LOCAL_OWNER_APPROVED_NOT_PRODUCTION")
  assert.equal(manifest.owner_decision.owner, "Krys")
  assert.equal(manifest.owner_decision.decision, "APPROVE_ALL_73_FOR_FORMAL_RATING_DECISION_INSTALLATION")
  assert.equal(manifest.owner_decision.recorded_at, null)
  assert.equal(manifest.owner_decision.reviewer_uuid, null)
  assert.equal(manifest.owner_decision.signature, null)
  assert.deepEqual(manifest.explicit_holds, ["Hollywood Easy", "Hollywood Hard", "Gloop Lair Easy", "Gloop Lair Hard"])
})

test("Phase 138 installer is append-only, atomic, and publication-neutral", () => {
  const sql = fs.readFileSync(path.join(dir, "production_rating_decision_installation.sql"), "utf8")
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('phase138-rating-decision-installation'/)
  assert.match(sql, /insert into public\.handicap_review_evidence/i)
  assert.match(sql, /insert into public\.handicap_review_decisions/i)
  assert.equal((sql.match(/insert into public\.handicap_review_evidence/gi) ?? []).length, 1)
  assert.equal((sql.match(/insert into public\.handicap_review_decisions/gi) ?? []).length, 1)
  assert.doesNotMatch(sql, /update\s+public\.|delete\s+from\s+public\.|truncate\s+public\./i)
  assert.doesNotMatch(sql, /on\s+conflict/i)
  assert.doesNotMatch(sql, /insert into public\.(handicap_rating_snapshots|handicap_index_snapshots|handicap_calculation_runs|handicap_source_provenance)/i)
  assert.match(sql, /publication_status_remains/i)
  assert.match(sql, /commit;/i)
})

test("Phase 138 generated checksums agree with package files", () => {
  const checksums = json("checksums.json").files
  for (const [file, expected] of Object.entries(checksums)) assert.equal(sha(file), expected, file)
  assert.equal(json("checksums.json").owner_batch_sha256, "52D2D88FD821F231148FCCC1C90C85BF32D34FA9156C2A8C2F3D75CD2CF53C0B")
})

test("Phase 138 read-only gates assert client denial and empty publication views", () => {
  const pre = fs.readFileSync(path.join(dir, "production_rating_decision_preflight.sql"), "utf8")
  const post = fs.readFileSync(path.join(dir, "production_rating_decision_postflight.sql"), "utf8")
  for (const sql of [pre, post]) {
    assert.match(sql, /has_table_privilege\('anon'/)
    assert.match(sql, /has_table_privilege\('authenticated'/)
    assert.match(sql, /handicap_publishable_rating_snapshots/)
    assert.match(sql, /handicap_publishable_index_snapshots/)
    assert.match(sql, /set transaction read only/i)
  }
})
