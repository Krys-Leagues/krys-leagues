import assert from "node:assert/strict"
import test from "node:test"

import { classifyHistoricalPypPreflight, type HistoricalPypPreflightSourceRow, type HistoricalPypProductionRow } from "./historicalPypPreflight.ts"

function source(overrides: Partial<HistoricalPypPreflightSourceRow> = {}): HistoricalPypPreflightSourceRow {
  return {
    seasonNumber: 1,
    seasonLabel: "Season 1",
    sourceEra: "legacy_aggregate",
    division: "1",
    historicalPlayerName: "PLAYER",
    publishedPlacement: "1st",
    gameNumber: 1,
    course1HolesWon: null,
    course2HolesWon: null,
    totalHolesWon: 6,
    course1Raw: "",
    course2Raw: "",
    totalRaw: "6",
    wins: 1,
    losses: 0,
    draws: 0,
    points: 3,
    sourceState: "PLAYED",
    sourceStateEvidence: "NUMERIC_TOTAL",
    sourceSide: "R",
    sourceRow: 10,
    sourceCells: "I10",
    totalCell: "I10",
    wldCells: "J10:L10",
    sourceWorkbook: "PYP",
    sourceTab: "S1",
    sourceUrl: "https://example.test/source",
    sourceRange: "I10:L10",
    sourceFingerprint: "source-fingerprint",
    pairingState: "UNKNOWN",
    opponentHistoricalPlayerName: null,
    candidateOpponentHistoricalPlayerNames: [],
    pairingEvidence: "UNKNOWN — NON-BLOCKING",
    pairingSourceRange: null,
    pairingSourceCells: null,
    pairingSourceUrl: null,
    pairingReviewRequired: false,
    importable: true,
    canonicalPlayerId: "player-id",
    canonicalOpponentPlayerId: null,
    identityStatus: "resolved",
    ...overrides,
  }
}

function production(overrides: Partial<HistoricalPypProductionRow> = {}): HistoricalPypProductionRow {
  return {
    source_fingerprint: "production-fingerprint",
    season_number: 1,
    division: "1",
    game_number: 1,
    historical_player_name: "PLAYER",
    canonical_player_id: "player-id",
    course_1_holes_won: null,
    course_2_holes_won: null,
    total_holes_won: 6,
    wins: 1,
    losses: 0,
    draws: 0,
    points: 3,
    published_placement: "1st",
    source_state: "PLAYED",
    opponent_historical_player_name: null,
    opponent_canonical_player_id: null,
    ...overrides,
  }
}

test("preflight treats a provenance-only change as an exact duplicate", () => {
  const result = classifyHistoricalPypPreflight([source()], [production()])
  assert.equal(result.items[0]?.classification, "EXACT DUPLICATE")
  assert.equal(result.conflicts.length, 0)
})

test("preflight reports missing and Production-only observations", () => {
  const result = classifyHistoricalPypPreflight([source({ sourceFingerprint: "missing" })], [production({ source_fingerprint: "production-only", season_number: 2 })])
  assert.deepEqual(result.items.map((item) => item.classification), ["MISSING FROM PRODUCTION", "PRODUCTION-ONLY"])
})

test("preflight reports a true logical score/state conflict with details", () => {
  const result = classifyHistoricalPypPreflight([source()], [production({ total_holes_won: 7 })])
  assert.equal(result.items[0]?.classification, "TRUE CONFLICT")
  assert.deepEqual(result.conflicts[0]?.conflictFields, ["total_holes_won"])
})
