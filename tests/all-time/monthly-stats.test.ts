import assert from "node:assert/strict"
import { test } from "node:test"
import { calculateMonthlyCareerStats, monthlyCourseMapName, uniqueMonthlyPeriodRecords, type MonthlyPresentationRow } from "../../lib/monthlyPresentation.ts"

const row = (overrides: Partial<MonthlyPresentationRow> = {}): MonthlyPresentationRow => ({
  canonicalPlayerId: "player-1",
  playerName: "Player One",
  year: 2026,
  month: 7,
  division: "Elite",
  courseName: "Gardens of Babylon",
  difficulty: "easy",
  score: -28,
  holeInOnes: 4,
  coursePlacement: 2,
  coursePoints: 176,
  overallPlacement: 2,
  coursesPlayed: 2,
  totalStrokes: -50,
  overallHoleInOnes: 7,
  overallPoints: 348,
  ...overrides,
})

test("Monthly career stats count period-level values once and course scores independently", () => {
  const rows = [
    row(),
    row({ courseName: "Gardens of Babylon Hard", difficulty: "hard", score: -22, holeInOnes: 3, coursePlacement: 3, coursePoints: 172 }),
    row({ month: 6, courseName: "Mars Gardens", score: -25, holeInOnes: null, coursePlacement: 1, coursePoints: 205, overallPlacement: 1, coursesPlayed: 1, totalStrokes: -25, overallHoleInOnes: null, overallPoints: 205 }),
  ]

  assert.deepEqual(calculateMonthlyCareerStats(rows), {
    eventsPlayed: 2,
    scoredCourses: 3,
    averageCourseScore: -25,
    bestCourseScore: -28,
    totalHoleInOnes: 7,
    averageHoleInOnes: 3.5,
    bestOverallFinish: 1,
    wins: 1,
    topThreeFinishes: 2,
    totalPoints: 553,
    averagePoints: 276.5,
    bestTotalStrokes: -50,
    averageTotalStrokes: -37.5,
  })
  assert.equal(uniqueMonthlyPeriodRecords(rows).length, 2)
})

test("Monthly course cards use the map name while preserving Easy and Hard distinctions", () => {
  assert.equal(monthlyCourseMapName("Gardens of Babylon"), "Gardens of Babylon")
  assert.equal(monthlyCourseMapName("Gardens of Babylon Hard"), "Gardens of Babylon")
  assert.equal(monthlyCourseMapName("Mars Gardens Easy"), "Mars Gardens")
})
