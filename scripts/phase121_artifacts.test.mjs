import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import Papa from "papaparse"

const root = process.cwd()
const dir = path.join(root, "docs", "handicap", "phase121")
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package_manifest.json"), "utf8"))
const checksums = JSON.parse(fs.readFileSync(path.join(dir, "package_checksums.json"), "utf8"))

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase()
const rows = (name) => Papa.parse(fs.readFileSync(path.join(dir, name), "utf8"), { header: true, skipEmptyLines: true }).data

test("Phase 121 manifest hashes and counts are deterministic", () => {
  assert.equal(manifest.status, "DRAFT_QUARANTINED_UNPUBLISHED")
  assert.equal(manifest.counts.rating_candidates, 78)
  assert.equal(manifest.counts.index_candidates, 166)
  assert.equal(manifest.counts.reviewed_course_entries, 82)
  assert.equal(manifest.counts.weekly_rows_used_in_indexes, 0)
  assert.equal(rows("rating_snapshot_candidates.csv").length, 78)
  assert.equal(rows("player_index_candidates.csv").length, 166)
  assert.equal(rows("rating_review_dispositions.csv").length, 82)

  for (const [relative, expected] of Object.entries(checksums)) {
    const file = relative.startsWith("supabase/") ? path.join(root, relative) : path.join(dir, relative)
    assert.equal(fs.existsSync(file), true, `missing artifact: ${relative}`)
    assert.equal(sha256(file), expected, `checksum mismatch: ${relative}`)
  }
})

test("Phase 121 candidates remain KWT-only and unpublished", () => {
  const indexes = rows("player_index_candidates.csv")
  assert.equal(indexes.every((row) => row.source_scope === "KWT_ONLY"), true)
  assert.equal(indexes.every((row) => row.weekly_rows_used === "0"), true)
  assert.equal(indexes.every((row) => row.publication_status === "UNPUBLISHED"), true)

  const ratings = rows("rating_snapshot_candidates.csv")
  assert.equal(ratings.every((row) => row.source_scope === "KWT_ONLY"), true)
  assert.equal(ratings.every((row) => row.publication_status === "UNPUBLISHED"), true)
})

test("Phase 123 owner rating approvals clear only the approved diagnostic blockers", () => {
  assert.equal(manifest.counts.indexes_with_rating_review_blockers, 0)
  assert.deepEqual(manifest.owner_rating_approvals.map((row) => row.course_id), [
    "Bogey's Bonanza_hard",
    "Forgotten Fairyland_easy",
    "Original Gothic_easy",
    "Raptor Cliff's_hard",
    "Shangri-La_easy",
  ])
  assert.equal(manifest.owner_rating_approvals.every((row) => row.reviewer === "Krys" && row.decision_date === "2026-10-21" && row.recorded_at === null && row.reviewer_uuid === null), true)
  assert.equal(rows("player_index_candidates.csv").every((row) => row.rating_review_blockers === ""), true)
  const dispositions = rows("rating_review_dispositions.csv")
  for (const course of manifest.owner_rating_approvals.map((row) => row.course_id)) {
    const disposition = dispositions.find((row) => row.course_id === course)
    assert.equal(disposition.formal_approval, "OWNER_APPROVED")
    assert.equal(disposition.publication_status, "UNPUBLISHED")
  }
  assert.equal(dispositions.find((row) => row.course_id === "Hollywood_easy")?.formal_review_disposition, "HOLD_PROVISIONAL")
  assert.equal(dispositions.find((row) => row.course_id === "Gloop Lair_hard")?.formal_review_disposition, "HOLD_UNRATED")
})
