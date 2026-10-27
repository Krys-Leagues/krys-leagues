import assert from "node:assert/strict"
import test from "node:test"
import { buildOfficialKwtCsvFingerprint, buildOfficialKwtCsvProvenance, validateOfficialKwtCsvFingerprint, type KwtCsvPairEvidence } from "./phase112KwtCsv.ts"

const pair: KwtCsvPairEvidence = {
  season: 14,
  week: 6,
  eventId: "KWT14W06",
  player: "plucky¿",
  canonicalPlayerId: "11111111-1111-4111-8111-111111111111",
  easyCode: "BHE",
  hardCode: "BHH",
  easyScore: -14,
  hardScore: 1,
  totalScore: -13,
  detailFile: "kwt14w06_ful_results.csv",
  detailFileSha256: "A".repeat(64),
  detailRow: 40,
  summaryFile: "weekly_results (9).csv",
  summaryFileSha256: "B".repeat(64),
  summaryRow: 40,
  zipSha256: "C".repeat(64),
}

test("CSV fingerprints are deterministic, five-part, and distinct by difficulty", () => {
  const easy = buildOfficialKwtCsvFingerprint(pair, "easy")
  const hard = buildOfficialKwtCsvFingerprint(pair, "hard")
  assert.equal(easy, buildOfficialKwtCsvFingerprint(pair, "easy"))
  assert.notEqual(easy, hard)
  assert.equal(easy.split("|").length, 5)
  assert.equal(validateOfficialKwtCsvFingerprint(easy), true)
  assert.equal(validateOfficialKwtCsvFingerprint(easy.replace("OFFICIAL_KWT_CSV", "OTHER")), false)
})

test("CSV provenance preserves exact names, negative scores, and non-authoritative ID kinds", () => {
  const row = buildOfficialKwtCsvProvenance(pair, "hard")
  assert.equal(row.originalPlayerName, "plucky¿")
  assert.equal(row.score, 1)
  assert.equal(row.metadata.source_player_id_kind, "CSV_PARTICIPANT_KEY_NOT_KWT_NUMERIC_ID")
  assert.equal(row.metadata.round_id_kind, "CSV_ROW_EVIDENCE_KEY_NOT_KWT_NUMERIC_ID")
  assert.equal(row.metadata.personal_handicap_eligible, true)
})

test("changing immutable source evidence changes the fingerprint instead of colliding", () => {
  const original = buildOfficialKwtCsvFingerprint(pair, "easy")
  const changed = buildOfficialKwtCsvFingerprint({ ...pair, detailRow: pair.detailRow + 1 }, "easy")
  assert.notEqual(original, changed)
})

