import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  DISCORD_BOARD_MANUAL_RETRY_AT,
  classifyDiscordBoardSyncError,
  discordBoardFailureUpdate,
  discordBoardRetryAt,
} from "./discordBoardReliability.ts"

test("Discord Unknown Message is terminal until an explicit rebind", () => {
  assert.equal(classifyDiscordBoardSyncError("NotFound: 404 code 10008 Unknown Message"), "not_found")
  assert.deepEqual(discordBoardFailureUpdate({ attemptCount: 2, error: "NotFound" }), {
    kind: "not_found",
    manualRetryRequired: true,
    reason: "board_rebind_required",
    syncState: "failed",
    nextAttemptAt: DISCORD_BOARD_MANUAL_RETRY_AT,
    lastError: "Discord message not found; explicit board rebind required. NotFound",
  })
})

test("temporary failures back off and stop after five automatic attempts", () => {
  const now = Date.UTC(2026, 8, 30, 12, 0, 0)
  assert.equal(discordBoardRetryAt(1, now), "2026-09-30T12:01:00.000Z")
  assert.equal(discordBoardRetryAt(4, now), "2026-09-30T12:08:00.000Z")
  const retry = discordBoardFailureUpdate({ attemptCount: 4, error: "Gateway timeout", now })
  assert.equal(retry.manualRetryRequired, false)
  assert.equal(retry.nextAttemptAt, "2026-09-30T12:08:00.000Z")
  const exhausted = discordBoardFailureUpdate({ attemptCount: 5, error: "Gateway timeout", now })
  assert.equal(exhausted.manualRetryRequired, true)
  assert.equal(exhausted.reason, "board_retry_exhausted")
  assert.equal(exhausted.nextAttemptAt, DISCORD_BOARD_MANUAL_RETRY_AT)
})

test("Stroke coordinator persists bounded failure state and explicit retry resets the outbox", async () => {
  const [route, server] = await Promise.all([
    readFile("app/api/internal/scorecards/stroke/boards/route.ts", "utf8"),
    readFile("lib/scorecards/strokeBoardServer.ts", "utf8"),
  ])
  assert.match(route, /discordBoardFailureUpdate/)
  assert.match(route, /attemptCount: Number\(activeClaim\.data\.attempt_count/)
  assert.doesNotMatch(route, /Date\.now\(\) \+ 60_000/)
  assert.match(server, /attempt_count: 0/)
  assert.match(server, /claim_token: null/)
  assert.match(server, /last_error: null/)
})
