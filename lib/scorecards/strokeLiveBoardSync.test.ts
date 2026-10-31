import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { strokeBoardSyncCompleted, strokeBoardSyncPollDelay } from "./strokeLiveBoardSync.ts"

test("a completed live-board sync requires the outbox success and sync timestamp", () => {
  assert.equal(strokeBoardSyncCompleted({ syncState: "pending", lastSyncedAt: null }), false)
  assert.equal(strokeBoardSyncCompleted({ syncState: "succeeded", lastSyncedAt: null }), false)
  assert.equal(strokeBoardSyncCompleted({ syncState: "succeeded", lastSyncedAt: "2026-10-06T22:28:12.985Z" }), true)
})

test("live-board polling backs off without exceeding five seconds", () => {
  assert.equal(strokeBoardSyncPollDelay(1), 1_000)
  assert.equal(strokeBoardSyncPollDelay(3), 3_000)
  assert.equal(strokeBoardSyncPollDelay(9), 5_000)
})

test("Stroke review refresh uses the uncached workspace and waits for the board worker", async () => {
  const [client, reviewer] = await Promise.all([
    readFile("components/admin/scorecards/ManageStrokeSeasonClient.tsx", "utf8"),
    readFile("components/admin/scorecards/SharedScorecardReviewer.tsx", "utf8"),
  ])
  assert.match(client, /fetch\("\/api\/admin\/stroke\/manage", \{ cache: "no-store" \}\)/)
  assert.match(client, /strokeBoardSyncCompleted/)
  assert.match(client, /strokeBoardSyncPollDelay/)
  assert.match(reviewer, /boardSync\?: "queued" \| "retry_required"/)
})
