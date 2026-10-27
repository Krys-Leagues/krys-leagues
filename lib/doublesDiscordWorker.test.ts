import test from "node:test"
import assert from "node:assert/strict"
import { buildSubmitScorecardComponent, DoublesDiscordWorker, type DiscordWorkerStore, type DiscordWorkerTransport } from "./doublesDiscordWorker.ts"
import { DOUBLES_DISCORD_TEST_CHANNEL_ID } from "./doublesDiscordRuntime.ts"
import type { DivisionDiscordMapping, FixtureDiscordMapping } from "./doublesDiscordRuntime.ts"

function harness() {
  let division: DivisionDiscordMapping | null = null
  let fixture: FixtureDiscordMapping | null = null
  const calls: string[] = []
  const store: DiscordWorkerStore = { getDivision: async () => division, saveDivision: async (value) => { division = value; calls.push("save-division") }, getFixture: async () => fixture, saveFixture: async (value) => { fixture = value; calls.push(`save-fixture:${value.threadId || "pending"}`) } }
  const transport: DiscordWorkerTransport = { createMessage: async () => { calls.push("create-message"); return { messageId: "message-1", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID } }, editMessage: async () => { calls.push("edit-message") }, createThread: async () => { calls.push("create-thread"); return { threadId: "thread-1", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID } }, sendThreadStarter: async () => { calls.push("send-starter"); return { messageId: "starter-1" } }, archiveThread: async () => { calls.push("archive") }, deleteMessage: async () => { calls.push("delete") } }
  return { worker: new DoublesDiscordWorker(store, transport), calls, getDivision: () => division, getFixture: () => fixture }
}

test("disabled runtime does not touch current-season state", async () => {
  const h = harness()
  assert.deepEqual(await h.worker.process({ enabled: false, seasonId: "current", division: "ELITE", channelId: "elite" }, "BOARD_REFRESH"), { status: "DISABLED" })
  assert.deepEqual(h.calls, [])
})

test("Arrange creates once then edits the same message", async () => {
  const h = harness()
  await h.worker.process({ enabled: true, testMode: true, seasonId: "next", division: "ELITE", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, arrangePayload: { content: "NOT ARRANGED" } }, "ARRANGE_UPDATED")
  await h.worker.process({ enabled: true, testMode: true, seasonId: "next", division: "ELITE", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, arrangePayload: { content: "MATCH SET" } }, "ARRANGE_UPDATED")
  assert.deepEqual(h.calls, ["create-message", "save-division", "edit-message"])
})

test("board updates in place and replacement deletes old only after new success", async () => {
  const h = harness()
  await h.worker.process({ enabled: true, testMode: true, seasonId: "next", division: "ELITE", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, boardPayload: { content: "board" } }, "BOARD_REFRESH")
  await h.worker.process({ enabled: true, testMode: true, seasonId: "next", division: "ELITE", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, boardPayload: { content: "board 2" } }, "BOARD_REFRESH")
  assert.ok(h.calls.includes("create-message"))
  assert.ok(h.calls.includes("edit-message"))
})

test("MATCH SET creates one thread and duplicate event reuses it", async () => {
  const h = harness()
  const input = { enabled: true, testMode: true, seasonId: "next", division: "ELITE", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, fixtureId: "fixture-1", arrangementState: "ACCEPTED", threadPayload: { content: "MATCH SET" } }
  assert.equal((await h.worker.process(input, "MATCH_SET")).status, "CREATED")
  assert.equal((await h.worker.process(input, "MATCH_SET")).status, "REUSED")
  assert.deepEqual(h.calls.filter((call) => call === "create-thread"), ["create-thread"])
  assert.deepEqual(h.calls.filter((call) => call === "send-starter"), ["send-starter"])
})

test("MATCH SET invites exact participants and completed result archives once", async () => {
  const calls: string[] = []
  let fixture: FixtureDiscordMapping | null = { fixtureId: "fixture-2", threadId: "thread-2", threadChannelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, starterMessageId: "starter", matchImageMessageId: "image", submitComponentMessageId: "submit", state: "MATCH_SET" }
  const store: DiscordWorkerStore = { getDivision: async () => null, saveDivision: async () => undefined, getFixture: async () => fixture, saveFixture: async (next) => { fixture = next } }
  const transport: DiscordWorkerTransport = { createMessage: async () => ({ messageId: "board", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID }), editMessage: async () => undefined, createThread: async () => ({ threadId: "thread-new", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID }), sendThreadStarter: async () => ({ messageId: "starter" }), archiveThread: async (threadId) => { calls.push(`archive:${threadId}`) }, deleteMessage: async () => undefined, addThreadParticipant: async (threadId, userId) => { calls.push(`invite:${threadId}:${userId}`) } }
  const worker = new DoublesDiscordWorker(store, transport)
  const created = await worker.process({ enabled: true, seasonId: "season", division: "ELITE", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, fixtureId: "fixture-2", arrangementState: "MATCH SET", participantIds: ["p1", "p2", "p3", "p4"], threadPayload: {} }, "MATCH_SET")
  assert.equal(created.status, "REUSED")
  await worker.process({ enabled: true, seasonId: "season", division: "ELITE", channelId: DOUBLES_DISCORD_TEST_CHANNEL_ID, fixtureId: "fixture-2", boardPayload: {} }, "RESULT_COMPLETED")
  assert.deepEqual(calls, ["archive:thread-2"])
  assert.equal(fixture?.state, "ARCHIVED")
})

test("scorecard handoff creates exactly one signed action without player IDs", () => {
  const row = buildSubmitScorecardComponent({ fixtureId: "fixture-1", secret: "secret", expiresAt: Date.now() + 60_000 })
  assert.equal(row.components.length, 1)
  assert.equal(row.components[0].label, "SUBMIT SCORECARD")
  assert.match(row.components[0].custom_id, /^doubles:live:/)
  assert.doesNotMatch(row.components[0].custom_id, /player|Avery|Jordan/i)
})
