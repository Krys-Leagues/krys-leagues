import assert from "node:assert/strict"
import test from "node:test"
import { KWT_NET_DIVISION_FILTERS, KWT_OFFICIAL_POINTS, KWT_SEASON_15_WEEKS, filterKwtDivision, pointsForKwtRank } from "./kwtSeason15Competition.ts"

test("Season 15 has the approved twelve-week course order", () => {
  assert.equal(KWT_SEASON_15_WEEKS.length, 12)
  assert.deepEqual(KWT_SEASON_15_WEEKS.map((week) => week.courseName), [
    "Raptor Cliffs", "Wallace & Gromit", "Myst", "Around the World", "Viva Las Elvis", "Gloop Lair",
    "20,000 Leagues", "Escape from Planet Xylodon", "Holiday Hideaway", "Original Gothic", "Crystal Lair", "Labyrinth",
  ])
  assert.equal(KWT_SEASON_15_WEEKS[0].eventIdentifier, "KWTS15W01")
})

test("KWT points preserve ties and the official 9-to-1 continuation", () => {
  assert.equal(KWT_OFFICIAL_POINTS.length, 19)
  assert.equal(pointsForKwtRank(1), 25)
  assert.equal(pointsForKwtRank(10), 10)
  assert.equal(pointsForKwtRank(11), 9)
  assert.equal(pointsForKwtRank(19), 1)
  assert.equal(pointsForKwtRank(20), 0)
  assert.equal(pointsForKwtRank(0), null)
})

test("division filtering keeps provisional players separate", () => {
  const rows = [{ division: "PRO" }, { division: "PROVISIONAL" }, { division: "AMATEUR" }]
  assert.deepEqual(filterKwtDivision(rows, "PROVISIONAL"), [{ division: "PROVISIONAL" }])
  assert.equal(KWT_NET_DIVISION_FILTERS.at(-1), "PROVISIONAL")
})
