import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const repairedRoot = "docs/historical-sources/monthly/repaired-history"
const manifest = JSON.parse(readFileSync(`${repairedRoot}/repaired-monthly-manifest.json`, "utf8")) as {
  import_ready: { total_logical_observations: number; played_scored: number; blank_unplayed: number; blank_unplayed_evidence_excluded: number; zero_scores: number; negative_scores: number; positive_scores: number; quarantined_rows: number; malformed: number; duplicate_fingerprints: number; legacy_august_excluded: number }; evidence: { blank_unplayed_evidence_rows: number }; finalization: { finalizedThrough: string; currentIncompletePeriod: string; currentPeriodReason: string }
}
const observations = readFileSync(`${repairedRoot}/repaired-monthly-observations.tsv`, "utf8").trimEnd().split(/\r?\n/)
const unplayedEvidence = readFileSync(`${repairedRoot}/repaired-monthly-unplayed-evidence.tsv`, "utf8").trimEnd().split(/\r?\n/)
const quarantine = readFileSync(`${repairedRoot}/repaired-monthly-review-quarantine.tsv`, "utf8")
const exclusions = readFileSync(`${repairedRoot}/repaired-monthly-exclusions.tsv`, "utf8")

test("repaired package preserves safe counts and excludes the quarantined row", () => {
  assert.equal(observations.length - 1, 17462)
  assert.equal(unplayedEvidence.length - 1, 4909)
  assert.equal(manifest.import_ready.total_logical_observations, 17462)
  assert.equal(manifest.import_ready.played_scored, 17462)
  assert.equal(manifest.import_ready.blank_unplayed, 0)
  assert.equal(manifest.import_ready.blank_unplayed_evidence_excluded, 4909)
  assert.equal(manifest.evidence.blank_unplayed_evidence_rows, 4909)
  assert.equal(manifest.import_ready.zero_scores, 95)
  assert.equal(manifest.import_ready.negative_scores, 16916)
  assert.equal(manifest.import_ready.positive_scores, 451)
  assert.equal(manifest.import_ready.legacy_august_excluded, 240)
  assert.equal(manifest.import_ready.quarantined_rows, 1)
  assert.equal(manifest.import_ready.malformed, 0)
  assert.equal(manifest.finalization.finalizedThrough, "2026 August")
  assert.equal(manifest.finalization.currentIncompletePeriod, "2026 September")
  assert.match(manifest.finalization.currentPeriodReason, /September 2026 is the active Monthly and is not finished/)
  assert.equal(manifest.import_ready.duplicate_fingerprints, 0)
  const zeroRows = observations.slice(1).map(line => line.split("\t")).filter(fields => fields[15] === "0")
  assert.ok(observations.slice(1).filter(line => line.split("	")[4] === "2026 August").every(line => line.split("	")[30] === "FRESH_PUBLIC"))
  assert.equal(observations.slice(1).filter(line => line.split("	")[4] === "2026 September").length, 0)
  assert.equal(zeroRows.length, 95)
  assert.ok(zeroRows.every(fields => fields[14] === "0" && fields[16] === "PLAYED"))
  assert.ok(observations.slice(1).every(line => line.split("\t")[16] === "PLAYED" && line.split("\t")[15] !== ""))
  assert.ok(unplayedEvidence.slice(1).every(line => line.split("\t")[16] === "UNPLAYED" && line.split("\t")[15] === ""))
  assert.match(quarantine, /PETERK9FLORIDA/)
  assert.match(quarantine, /-23/)
  assert.match(quarantine, /-26/)
})

test("repaired package does not fabricate pending divisions or unknown 2024 months", () => {
  assert.match(exclusions, /Amateur 1.*PENDING_SOURCE_ID/)
  assert.match(exclusions, /Amateur 2.*PENDING_SOURCE_ID/)
  assert.match(exclusions, /Amateur 3.*PENDING_SOURCE_ID/)
  assert.match(exclusions, /2024 January through 2024 July.*UNKNOWN_NO_OBSERVATIONS_IMPORTED/)
  assert.doesNotMatch(readFileSync(`${repairedRoot}/repaired-monthly-observations.tsv`, "utf8"), /Amateur [123]/)
})

test("repaired Monthly page uses the repaired finalization gate", () => {
  const page = readFileSync("app/admin/import/monthly/page.tsx", "utf8")
  const preflight = readFileSync("app/admin/import/monthly/RepairedMonthlyPreflight.tsx", "utf8")
  assert.match(page, /RepairedMonthlyPreflight/)
  assert.ok(preflight.includes("monthly-website-recovery/repaired-preview"))
  assert.match(preflight, /finalization.currentPeriodReason/)
  assert.doesNotMatch(preflight, /August 2026 is the active Monthly/)
})
test("public and Player Profile Monthlies remain wired to scored history", () => {
  const publicRoute = readFileSync("app/api/monthlies/public/route.ts", "utf8")
  const profile = readFileSync("app/players/[id]/page.tsx", "utf8")
  assert.match(publicRoute, /\.eq\("played_state", "PLAYED"\)/)
  assert.match(publicRoute, /historical_monthly_score_observations/)
  assert.match(profile, /\/api\/monthlies\/public\?playerId=/)
})

test("unexecuted Monthlies migration supports explicit played state and provenance", () => {
  const migration = readFileSync("historical_monthly_repaired_source_package.sql", "utf8")
  assert.doesNotMatch(migration, /alter column score drop not null/)
  assert.match(migration, /alter column score set not null/)
  assert.match(migration, /played_state text/)
  assert.match(migration, /logical_observation_key/)
  assert.match(migration, /historical_monthly_observation_provenance/)
  assert.match(migration, /source_score_text/)
  assert.match(migration, /commit_historical_monthly_preview/)
})
