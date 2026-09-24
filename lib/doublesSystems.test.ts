import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import { boardRetry, buildDoublesBoardGame, buildFinalSnapshot, buildLeagueRoleDesiredState, canFinalizeDoublesSeason, canFixtureParticipant, fixtureParticipantIds, intersectAvailability, nextArrangeState, reminderRecipients, roleSyncKey } from "./doublesSystems.ts"

const sql = fs.readFileSync(new URL("../doubles_nonproduction_systems.sql", import.meta.url), "utf8")

test("four-player Arrange only exposes all-four availability overlap", () => {
  assert.deepEqual(intersectAvailability([
    [{ startMinute: 540, endMinute: 720 }],
    [{ startMinute: 600, endMinute: 780 }],
    [{ startMinute: 630, endMinute: 690 }],
    [{ startMinute: 660, endMinute: 700 }],
  ]), [{ startMinute: 660, endMinute: 690 }])
  assert.deepEqual(intersectAvailability([[{ startMinute: 540, endMinute: 550 }], [{ startMinute: 560, endMinute: 570 }]]), [])
})

test("Arrange state, participant privacy, and four-recipient reminder are explicit", () => {
  assert.equal(nextArrangeState("NOT ARRANGED", "propose"), "PROPOSED")
  assert.equal(nextArrangeState("PROPOSED", "counter"), "COUNTERED")
  assert.equal(nextArrangeState("COUNTERED", "accept"), "ACCEPTED")
  assert.equal(canFixtureParticipant("p4", ["p1", "p2", "p3", "p4"]), true)
  assert.equal(canFixtureParticipant("outsider", ["p1", "p2", "p3", "p4"]), false)
  assert.deepEqual(reminderRecipients(["p1", "p2", "p3", "p4", "p4"], new Date("2026-09-24T20:00:00Z")), { eligibleAt: new Date("2026-09-24T19:40:00Z"), recipients: ["p1", "p2", "p3", "p4"] })
})

test("fixture authorization requires four distinct canonical participants", () => {
  assert.deepEqual(fixtureParticipantIds({ homePlayer1Id: "p1", homePlayer2Id: "p2", awayPlayer1Id: "p3", awayPlayer2Id: "p4" }), ["p1", "p2", "p3", "p4"])
  assert.equal(fixtureParticipantIds({ homePlayer1Id: "p1", homePlayer2Id: "p2", awayPlayer1Id: "p3", awayPlayer2Id: "p3" }), null)
  assert.equal(canFixtureParticipant("p1", ["p1", "p2", "p3"]), false)
})

test("board failure handling never creates an automatic replacement board", () => {
  assert.deepEqual(boardRetry(0, "temporary"), { state: "RETRYABLE", delayMs: 60000 })
  assert.deepEqual(boardRetry(0, "not_found"), { state: "NOT_FOUND", delayMs: null })
  assert.deepEqual(boardRetry(5, "temporary"), { state: "EXHAUSTED", delayMs: null })
  assert.equal(boardRetry(0, "not_found").state, "NOT_FOUND")
})

test("snapshot and role sync contracts preserve team history and league isolation", () => {
  const snapshot = buildFinalSnapshot({ seasonId: "s1", division: "D1", teams: [{ id: "t1" }], fixtures: [], results: [], standings: [] })
  assert.equal(snapshot.seasonId, "s1")
  assert.equal(roleSyncKey("p1", "doubles", "GRANTED"), "p1:doubles:GRANTED")
  assert.match(sql, /doubles_arrangements/)
  assert.match(sql, /doubles_board_mappings/)
  assert.match(sql, /doubles_final_snapshots/)
  assert.match(sql, /league_discord_role_sync_outbox/)
  assert.match(sql, /revoke all on table public\.doubles_arrangements/)
})

test("team-based board payload preserves Home/Away identity and state", () => {
  assert.deepEqual(buildDoublesBoardGame({ gameNumber: 1, homeTeamName: "Pink", homePlayers: ["A", "B"], awayTeamName: "Chaos", awayPlayers: ["C", "D"], course: "North", hasAuthoritativeResult: false }), {
    gameNumber: 1,
    home: { teamName: "Pink", players: ["A", "B"] },
    away: { teamName: "Chaos", players: ["C", "D"] },
    course: "North",
    state: "NOT PLAYED",
  })
})

test("role desired state is league-scoped and idempotent", () => {
  assert.deepEqual(buildLeagueRoleDesiredState({ activeMemberships: [{ playerId: "p1", leagueKey: "doubles" }, { playerId: "p1", leagueKey: "stroke" }], leagueKey: "doubles", knownPlayerIds: ["p1", "p2"] }), [
    { playerId: "p1", leagueKey: "doubles", desiredState: "GRANTED", idempotencyKey: "p1:doubles:GRANTED" },
    { playerId: "p2", leagueKey: "doubles", desiredState: "REVOKED", idempotencyKey: "p2:doubles:REVOKED" },
  ])
})

test("finalization guard does not invent a Final Scorecard prerequisite", () => {
  assert.equal(canFinalizeDoublesSeason({ managed: true, rosterApproved: true, fixturesCount: 4, incompleteFixtures: 0, finalScorecardRequired: false, finalScorecardApproved: false, existingSnapshot: false }), true)
  assert.equal(canFinalizeDoublesSeason({ managed: true, rosterApproved: true, fixturesCount: 4, incompleteFixtures: 1, finalScorecardRequired: false, finalScorecardApproved: false, existingSnapshot: false }), false)
})
