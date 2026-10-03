import test from "node:test"
import assert from "node:assert/strict"
import { dispatchDoublesDiscordEvent, eventIdempotencyKey, processNextDoublesDiscordEvent, type DoublesDiscordEventStore } from "./doublesDiscordEventDispatcher.ts"
import type { DiscordWorkerStore, DiscordWorkerTransport } from "./doublesDiscordWorker.ts"

const mappingStore: DiscordWorkerStore = { getDivision: async () => null, saveDivision: async () => undefined, getFixture: async () => null, saveFixture: async () => undefined }
const transport: DiscordWorkerTransport = { createMessage: async () => ({ messageId: "message", channelId: "1335848394081570911" }), editMessage: async () => undefined, createThread: async () => ({ threadId: "thread", channelId: "1335848394081570911" }), sendThreadStarter: async () => ({ messageId: "starter" }), archiveThread: async () => undefined, deleteMessage: async () => undefined }

test("event enqueue is idempotently keyed by canonical event scope", async () => {
  const event = { eventType: "ARRANGE_UPDATED" as const, seasonId: "next", division: "ELITE", channelId: "1335848394081570911" }
  assert.equal(eventIdempotencyKey(event), "ARRANGE_UPDATED:next:ELITE:division")
  let queued = ""
  const eventStore: DoublesDiscordEventStore = { enqueue: async (value) => { queued = value.eventId || ""; return { id: "1" } }, claim: async () => null, ack: async () => undefined, fail: async () => undefined, recoverStale: async () => undefined }
  await dispatchDoublesDiscordEvent({ eventStore, mappingStore, transport, event, enabled: true })
  assert.equal(queued, eventIdempotencyKey(event))
})

test("disabled dispatcher never enqueues a real-season event", async () => {
  let enqueued = false
  const eventStore: DoublesDiscordEventStore = { enqueue: async () => { enqueued = true; return { id: "1" } }, claim: async () => null, ack: async () => undefined, fail: async () => undefined, recoverStale: async () => undefined }
  const result = await dispatchDoublesDiscordEvent({ eventStore, mappingStore, transport, event: { eventType: "BOARD_REFRESH", seasonId: "current", division: "ELITE", channelId: "1335848394081570911" }, enabled: false })
  assert.deepEqual(result, { status: "DISABLED" })
  assert.equal(enqueued, false)
})

test("dispatcher acks successful worker processing", async () => {
  let acked = false
  const claimed = true
  const eventStore: DoublesDiscordEventStore = { enqueue: async () => ({ id: "1" }), claim: async () => claimed ? { id: "1", attempts: 0, eventType: "BOARD_REFRESH", seasonId: "next", division: "ELITE", channelId: "1335848394081570911", testMode: true, boardPayload: { content: "board" } } : null, ack: async () => { acked = true }, fail: async () => undefined, recoverStale: async () => undefined }
  const result = await processNextDoublesDiscordEvent({ eventStore, mappingStore, transport, enabled: true })
  assert.equal(result.status, "ACKED")
  assert.equal(acked, true)
})
