import assert from "node:assert/strict"
import test from "node:test"
import {
  currentDashboardLeagues,
  selectedDashboardLeague,
  type DashboardLeagueStates,
  type MatchDashboardLeague,
} from "./playerDashboard.ts"

function matchState(rostered: boolean): MatchDashboardLeague {
  return {
    rostered,
    season_number: rostered ? 58 : null,
    season_due_date: null,
    division_number: rostered ? 1 : null,
    starting_rank: rostered ? 1 : null,
    current_rank: null,
    displayed_rank: rostered ? 1 : null,
    results_started: false,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    holes_won: 0,
    remaining_count: 0,
    assignments: [],
    results: [],
  }
}

test("multiple current memberships produce a switcher containing only rostered leagues", () => {
  const leagues: DashboardLeagueStates = {
    match: matchState(true),
    stroke: { rostered: true },
    pyp: { rostered: false },
    doubles: { rostered: false },
  }

  assert.deepEqual(currentDashboardLeagues(leagues), [
    { key: "match", label: "Match Play" },
    { key: "stroke", label: "Stroke" },
  ])
})

test("one current membership is selected automatically", () => {
  const available = currentDashboardLeagues({ match: matchState(true) })

  assert.equal(selectedDashboardLeague(null, available), "match")
})

test("zero current memberships produce no selected league for the Join Now state", () => {
  const available = currentDashboardLeagues({ match: matchState(false) })

  assert.deepEqual(available, [])
  assert.equal(selectedDashboardLeague(null, available), null)
})

test("absent Match membership does not hide another authoritative league state", () => {
  const leagues: DashboardLeagueStates = {
    match: matchState(false),
    stroke: { rostered: true },
  }

  assert.deepEqual(currentDashboardLeagues(leagues), [{ key: "stroke", label: "Stroke" }])
})

test("league switching is constrained to authenticated payload options", () => {
  const available = currentDashboardLeagues({
    match: matchState(true),
    pyp: { rostered: true },
  })

  assert.equal(selectedDashboardLeague("pyp", available), "pyp")
  assert.equal(selectedDashboardLeague("skins", available), "match")
})
