import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs", "handicap", "phase99", "rating_approval_manifest.json"), "utf8"))
const rows = fs.readFileSync(path.join(root, "docs", "handicap", "phase99", "rating_approval_review.csv"), "utf8").trim().split(/\r?\n/)

test("Phase 99 reviews all KWT-only ratings without approving or publishing them", () => {
  assert.equal(manifest.ratings.totalKwtOnly, 78)
  assert.equal(manifest.ratings.statisticallyReady, 72)
  assert.equal(manifest.ratings.provisional, 6)
  assert.equal(manifest.ratings.recommendedApprove, 0)
  assert.equal(manifest.allRatingsRemainUnpublished, true)
  assert.equal(rows.length, 79)
})

test("Phase 99 review keeps the approved model and Weekly exclusion explicit", () => {
  assert.equal(manifest.referenceSlope, 8.515)
  assert.equal(manifest.differentialModelVersion, "krys-handicap-candidate-a-v1")
  assert.equal(manifest.evidence.weeklyRowsInPersonalPackage, 0)
  assert.equal(manifest.evidence.effectiveDatesInvented, false)
})
