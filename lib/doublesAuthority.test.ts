import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { fixtureParticipants, resultForTeamScores, validateDoublesTeam } from "./doublesAuthority.ts"

const migration = fs.readFileSync(new URL("../doubles_authoritative_foundation.sql", import.meta.url), "utf8")

test("Doubles team authority requires two distinct canonical players", () => {
  assert.equal(validateDoublesTeam({ id: "team-1", name: "Pink", player1Id: "p1", player2Id: "p2" }), true)
  assert.equal(validateDoublesTeam({ id: "team-1", name: "Pink", player1Id: "p1", player2Id: "p1" }), false)
})

test("fixture authority preserves explicit Home/Away team membership", () => {
  const fixture = { id: "f1", seasonId: "s1", division: "D1", gameNumber: 1, homeTeamId: "home", awayTeamId: "away", homeTeamName: "Pink", awayTeamName: "Chaos" }
  const teams = [
    { id: "home", name: "Pink", player1Id: "p1", player2Id: "p2" },
    { id: "away", name: "Chaos", player1Id: "p3", player2Id: "p4" },
  ]
  assert.deepEqual(fixtureParticipants(fixture, teams), ["p1", "p2", "p3", "p4"])
})

test("current proven Doubles scoring remains lower total wins, with draw points", () => {
  assert.deepEqual(resultForTeamScores(10, 12), { outcome: "HOME_WIN", homePoints: 3, awayPoints: 0 })
  assert.deepEqual(resultForTeamScores(12, 10), { outcome: "AWAY_WIN", homePoints: 0, awayPoints: 3 })
  assert.deepEqual(resultForTeamScores(10, 10), { outcome: "DRAW", homePoints: 1, awayPoints: 1 })
})

test("local foundation enforces team-owned authority and protected replacement", () => {
  assert.match(migration, /create table if not exists public\.doubles_global_teams/)
  assert.match(migration, /create table if not exists public\.doubles_managed_season_teams/)
  assert.match(migration, /unique \(season_id, global_team_id\)/)
  assert.match(migration, /doubles_one_active_player_per_season/)
  assert.match(migration, /home_season_team_id uuid/)
  assert.match(migration, /away_season_team_id uuid/)
  assert.match(migration, /create table if not exists public\.doubles_managed_results/)
  assert.match(migration, /create table if not exists public\.doubles_managed_standings/)
  assert.match(migration, /save_doubles_managed_result/)
  assert.match(migration, /rebuild_doubles_managed_standings/)
  assert.match(migration, /on conflict \(fixture_id\) do update/)
  assert.match(migration, /replace_doubles_season_member/)
  assert.match(migration, /is_current_user_site_admin\(\)/)
  assert.match(migration, /revoke all on table public\.doubles_managed_season_teams/)
})
