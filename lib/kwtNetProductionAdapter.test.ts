import assert from "node:assert/strict"
import test from "node:test"
import { adaptProductionOperationalRows, eventIdentifierFor, selectFrozenPublishedHandicaps, validateVerifiedWeekSetup, type ProductionOperationalResult, type VerifiedWeekSetup } from "./kwtNetProductionAdapter.ts"

const setup: VerifiedWeekSetup = {
  eventIdentifier: "KWTS15W01",
  season: 15,
  week: 1,
  courseName: "Raptor Cliffs",
  easyCourseCode: "RCE",
  hardCourseCode: "RCH",
  easySlope: 8.515,
  hardSlope: 12.197,
  freezeCutoff: "2026-10-23T04:00:00Z",
}

const row = (overrides: Partial<ProductionOperationalResult> = {}): ProductionOperationalResult => ({
  season_number: 15,
  week_number: 1,
  player_id: "p1",
  division: "ELITE",
  easy_course_code: "RCE",
  hard_course_code: "RCH",
  easy_score: -24,
  hard_score: -21,
  total_score: -45,
  overall_placement: 1,
  points: 25,
  status: "VERIFIED",
  source_type: "KWT",
  source_reference: "KWTS15W01",
  ...overrides,
})

test("Production schema adapter maps gross results to canonical published Handicap inputs", () => {
  const result = adaptProductionOperationalRows([row()], [{ id: "p1", screen_name: "ZANETTI" }], [{ canonical_player_id: "p1", resulting_index: "4.04", handicap_status: "OFFICIAL_ELIGIBLE" }], setup)
  assert.equal(result.rejected.length, 0)
  assert.deepEqual(result.inputs[0], {
    playerId: "p1", screenName: "ZANETTI", easyGross: -24, hardGross: -21,
    handicapIndex: 4.04, handicapStatus: "OFFICIAL", resultStatus: "VERIFIED", division: "ELITE",
  })
})

test("adapter accepts the live Production KWT status, source, and division spellings", () => {
  const result = adaptProductionOperationalRows([row({ division: "Semi Pro", status: "official", source_type: "existing_kwt_website" })], [{ id: "p1", screen_name: "ZANETTI" }], [{ canonical_player_id: "p1", resulting_index: "4.04", handicap_status: "OFFICIAL_ELIGIBLE" }], setup)
  assert.equal(result.rejected.length, 0)
  assert.equal(result.inputs[0]?.division, "SEMI-PRO")
  assert.equal(result.inputs[0]?.resultStatus, "FINAL")
})

test("adapter rejects non-KWT, wrong-course, missing-identity, and missing-published-Handicap rows", () => {
  const result = adaptProductionOperationalRows([
    row({ player_id: "p1", source_type: "THE_WEEKLY" }),
    row({ player_id: "p2", easy_course_code: "OTHER" }),
    row({ player_id: "p3" }),
    row({ player_id: "p4" }),
  ], [
    { id: "p1", screen_name: "A" }, { id: "p2", screen_name: "B" }, { id: "p3", screen_name: null }, { id: "p4", screen_name: "D" },
  ], [{ canonical_player_id: "p4", resulting_index: null, handicap_status: "PROVISIONAL" }], setup)
  assert.equal(result.inputs.length, 0)
  assert.equal(result.rejected.length, 4)
})

test("frozen selection excludes snapshots created after the cutoff", () => {
  const rows = selectFrozenPublishedHandicaps([
    { canonical_player_id: "p1", resulting_index: 4.04, handicap_status: "OFFICIAL_ELIGIBLE", effective_from: "2026-10-22", created_at: "2026-10-22T12:00:00Z" },
    { canonical_player_id: "p1", resulting_index: 5.04, handicap_status: "OFFICIAL_ELIGIBLE", effective_from: "2026-10-24", created_at: "2026-10-24T12:00:00Z" },
  ], "2026-10-23T04:00:00Z")
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.resulting_index, 4.04)
})

test("Week Setup validation requires the derived event id, positive slopes, and an explicit UTC freeze cutoff", () => {
  assert.equal(eventIdentifierFor(15, 1), "KWTS15W01")
  assert.equal(validateVerifiedWeekSetup(setup), true)
  assert.equal(validateVerifiedWeekSetup({ ...setup, freezeCutoff: "" }), false)
  assert.equal(validateVerifiedWeekSetup({ ...setup, eventIdentifier: "KWTS15W1" }), false)
})

