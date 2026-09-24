import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import { boardRetry, buildFinalSnapshot, canFixtureParticipant, intersectAvailability, nextArrangeState, reminderRecipients, roleSyncKey } from "./doublesSystems.ts"

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
