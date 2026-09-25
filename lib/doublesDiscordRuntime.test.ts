import test from "node:test"
import assert from "node:assert/strict"
import { DOUBLES_DISCORD_TEST_CHANNEL_ID, arrangeMessagePlan, boardMessagePlan, boardReplacementPlan, cleanupTestArtifacts, currentSeasonGate, fixtureThreadPlan, previewInteractionResponse, validatePreviewChannel, validatePreviewInteraction } from "./doublesDiscordRuntime.ts"

const mapping = { seasonId: "next", division: "ELITE", arrangeChannelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, arrangeMessageId: "arrange-1", boardChannelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, boardMessageId: "board-1", status: "TEST" as const }

test("current-season gate remains off even when an explicit flag is supplied", () => {
  assert.equal(currentSeasonGate({ currentSeasonId: "63", targetSeasonId: "64", explicitEnable: "true" }), false)
})

test("Arrange and board mappings update in place and do not fall back", () => {
  assert.deepEqual(arrangeMessagePlan(null, DOUBLES_DISCORD_TEST_CHANNEL_ID).operation, "CREATE")
  assert.deepEqual(arrangeMessagePlan(mapping, DOUBLES_DISCORD_TEST_CHANNEL_ID), { operation: "EDIT", messageId: "arrange-1", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID })
  assert.deepEqual(boardMessagePlan(mapping, DOUBLES_DISCORD_TEST_CHANNEL_ID).operation, "EDIT")
  assert.throws(() => boardMessagePlan(null, "1217979379691421827"), /locked/)
})

test("board replacement never deletes old message before new success", () => {
  assert.deepEqual(boardReplacementPlan({ existingMessageId: "old", newMessageId: "new", newMessageCreated: false }), { deleteOld: false, mappingMessageId: "old" })
  assert.deepEqual(boardReplacementPlan({ existingMessageId: "old", newMessageId: "new", newMessageCreated: true }), { deleteOld: true, mappingMessageId: "new" })
})

test("fixture thread waits for MATCH SET and reuses after duplicate finalize", () => {
  assert.equal(fixtureThreadPlan({ arrangementState: "PROPOSED", mapping: null }).operation, "WAIT")
  assert.equal(fixtureThreadPlan({ arrangementState: "ACCEPTED", mapping: null }).operation, "CREATE")
  assert.deepEqual(fixtureThreadPlan({ arrangementState: "ACCEPTED", mapping: { fixtureId: "f", threadId: "thread-1", threadChannelId: "c", starterMessageId: null, matchImageMessageId: null, submitComponentMessageId: "submit", state: "MATCH_SET" } }), { operation: "REUSE", threadId: "thread-1" })
})

test("preview interactions are safe and expose no player IDs", () => {
  assert.deepEqual(validatePreviewInteraction("preview:next-season:doubles:accept"), { action: "accept" })
  assert.equal(validatePreviewInteraction("preview:next-season:doubles:fixture-uuid:accept"), null)
  assert.deepEqual(previewInteractionResponse("preview:next-season:doubles:scorecard"), { type: 4, data: { content: "Preview only — no league data changed.", flags: 64 } })
})

test("cleanup is narrow to known next-season test artifacts", () => {
  const rows = [{ channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, testKey: "next-season:doubles:test:arrange" }, { channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, testKey: "live:season:63" }, { channelId: "other", testKey: "next-season:doubles:test:board" }]
  assert.equal(cleanupTestArtifacts(rows, DOUBLES_DISCORD_TEST_CHANNEL_ID).length, 1)
  assert.equal(validatePreviewChannel(DOUBLES_DISCORD_TEST_CHANNEL_ID), true)
})
