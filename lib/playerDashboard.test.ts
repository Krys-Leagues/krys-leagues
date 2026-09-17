import assert from "node:assert/strict"
import test from "node:test"
import {
  currentDashboardLeagues,
  dashboardMembershipView,
  hasAuthoritativeGlobalMembershipCoverage,
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

test("absence from Match alone does not claim authoritative zero membership", () => {
  const available = currentDashboardLeagues({ match: matchState(false) })

  assert.deepEqual(available, [])
  assert.equal(selectedDashboardLeague(null, available), null)
  assert.equal(hasAuthoritativeGlobalMembershipCoverage({ match: matchState(false) }), false)
  assert.equal(dashboardMembershipView({ match: matchState(false) }), "coverage-pending")
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

test("Join Now requires authoritative zero membership across every supported league", () => {
  const leagues: DashboardLeagueStates = {
    match: matchState(false),
    stroke: { rostered: false },
    pyp: { rostered: false },
    "amateur-pro": { rostered: false },
    doubles: { rostered: false },
    skins: { rostered: false },
  }

  assert.equal(hasAuthoritativeGlobalMembershipCoverage(leagues), true)
  assert.equal(dashboardMembershipView(leagues), "authoritative-empty")
})

test("a Match membership keeps the Match dashboard available", () => {
  assert.equal(dashboardMembershipView({ match: matchState(true) }), "available")
  assert.deepEqual(currentDashboardLeagues({ match: matchState(true) }), [{ key: "match", label: "Match Play" }])
})
