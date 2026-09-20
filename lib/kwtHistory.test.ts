import assert from "node:assert/strict"
import test from "node:test"
import {
  buildPublicKwtHistoryRows,
  filterPublicKwtHistoryRows,
  formatKwtPlacement,
  type KwtHistorySourceRow,
} from "./kwtHistory.ts"

const rows: KwtHistorySourceRow[] = [
  {
    season_number: 14,
    week_number: 2,
    historical_player_name: "Old Name",
    canonical_player_id: "player-1",
    easy_course_code: "TTE",
    easy_score: -18,
    hard_course_code: "TTH",
    hard_score: -11,
    total_score: -29,
    placement: 1,
  },
  {
    season_number: 13,
    week_number: 8,
    historical_player_name: "Historical Player",
    canonical_player_id: "player-2",
    easy_course_code: "GBE",
    easy_score: -8,
    hard_course_code: "GBH",
    hard_score: -4,
    total_score: -12,
    placement: null,
  },
]

test("KWT history preserves negative scores and prefers canonical display names", () => {
  const result = buildPublicKwtHistoryRows(
    rows,
    new Map([["player-1", "Current_Name"]]),
    new Map([["TTE", "Tourist Trap Easy"], ["TTH", "Tourist Trap Hard"]]),
  )

  assert.equal(result[0].playerName, "Current_Name")
  assert.equal(result[0].easyScore, -18)
  assert.equal(result[0].hardScore, -11)
  assert.equal(result[0].totalScore, -29)
  assert.equal(result[1].playerName, "Historical Player")
  assert.equal(result[1].easyCourse, "GBE")
})

test("KWT history filters by season, week, player, and course", () => {
  const result = buildPublicKwtHistoryRows(rows, new Map(), new Map([
    ["TTE", "Tourist Trap Easy"],
    ["TTH", "Tourist Trap Hard"],
  ]))

  assert.equal(filterPublicKwtHistoryRows(result, { season: 14 }).length, 1)
  assert.equal(filterPublicKwtHistoryRows(result, { week: 8 }).length, 1)
  assert.equal(filterPublicKwtHistoryRows(result, { search: "tourist" }).length, 1)
  assert.equal(filterPublicKwtHistoryRows(result, { search: "historical player" }).length, 1)
})

test("KWT placement formatting is ordinal and absence remains explicit", () => {
  assert.equal(formatKwtPlacement(1), "1st")
  assert.equal(formatKwtPlacement(2), "2nd")
  assert.equal(formatKwtPlacement(13), "13th")
  assert.equal(formatKwtPlacement(null), "—")
})
