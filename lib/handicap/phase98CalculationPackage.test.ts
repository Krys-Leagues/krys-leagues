import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = path.resolve(process.cwd())
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/handicap/phase98/calculation_run_manifest.json"), "utf8"))

test("Phase 98 package is deterministic, unpublished, and KWT-only", () => {
  assert.equal(manifest.calculationRun.chronologyPolicy, "OFFICIAL_KWT_SEQUENCE")
  assert.equal(manifest.calculationRun.publicationEligibility, "QUARANTINED")
  assert.equal(manifest.calculationRun.metadata.allow_official_kwt_sequence_publication, true)
  assert.equal(manifest.evidence.correctedKwtRows, 13_550)
  assert.equal(manifest.evidence.completePairs, 6_774)
  assert.equal(manifest.ratingEligibility.readyForPersonalIndexes, 72)
  assert.equal(manifest.evidence.roundsWithReadyRatings, 13_260)
  assert.equal(manifest.indexCandidates.length, 157)
  assert.ok(manifest.indexCandidates.every((snapshot: { publicationStatus: string; chronologyConfidence: string }) =>
    snapshot.publicationStatus === "UNPUBLISHED" && snapshot.chronologyConfidence === "OFFICIAL_KWT_SEQUENCE"))
  assert.equal(manifest.publication.allIndexSnapshotsUnpublished, true)
  assert.equal(manifest.evidence.weeklyRowsExcludedFromPersonalIndexes, 844)
  assert.ok(manifest.indexCandidates.every((snapshot: { sourceRoundIds: string[] }) =>
    snapshot.sourceRoundIds.every((source) => source.startsWith("KWT|"))))
})

test("Phase 98 package keeps approved policy parameters explicit", () => {
  assert.equal(manifest.policy.referenceSlope, 8.515)
  assert.equal(manifest.policy.latestRoundLimit, 10)
  assert.equal(manifest.policy.bestRoundLimit, 5)
  assert.equal(manifest.policy.minimumIndexRounds, 5)
  assert.equal(manifest.policy.chronologyOrdering, "Season -> Week -> Easy -> Hard")
})
