import { boardRetry, classifyDoublesDiscordFailure } from "./doublesSystems.ts"
import { DoublesDiscordWorker, type DiscordWorkerStore, type DiscordWorkerTransport, type WorkerEvent } from "./doublesDiscordWorker.ts"
import { DOUBLES_DISCORD_TEST_CHANNEL_ID } from "./doublesDiscordRuntime.ts"
import { resolveDoublesDiscordChannel } from "./doublesDiscordTransport.ts"

export type DoublesDiscordEvent = {
  eventId?: string
  eventType: WorkerEvent
  seasonId: string
  division: string
  channelId: string
  fixtureId?: string
  arrangementState?: string
  boardPayload?: unknown
  arrangePayload?: unknown
  threadPayload?: unknown
  threadName?: string
  testMode?: boolean
}

export type DoublesDiscordEventStore = {
  enqueue: (event: DoublesDiscordEvent) => Promise<{ id: string }>
  claim: () => Promise<(DoublesDiscordEvent & { id: string; attempts: number }) | null>
  ack: (id: string) => Promise<void>
  fail: (id: string, state: "RETRYABLE" | "EXHAUSTED" | "NOT_FOUND", error: string, availableAt: string) => Promise<void>
  recoverStale: () => Promise<void>
}

export async function enqueueDoublesDiscordEvent(input: { eventStore: DoublesDiscordEventStore; event: DoublesDiscordEvent; enabled: boolean }) {
  const expectedChannel = input.event.testMode ? DOUBLES_DISCORD_TEST_CHANNEL_ID : resolveDoublesDiscordChannel(input.event.division)
  if (input.event.channelId !== expectedChannel) throw new Error("Doubles Discord event destination does not match the authoritative division route")
  if (!input.enabled && !input.event.testMode) return { status: "DISABLED" as const }
  return input.eventStore.enqueue({ ...input.event, eventId: input.event.eventId || eventIdempotencyKey(input.event) })
}

export function eventIdempotencyKey(event: DoublesDiscordEvent) {
  return [event.eventType, event.seasonId, event.division, event.fixtureId || "division"].join(":")
}

export async function dispatchDoublesDiscordEvent(input: { eventStore: DoublesDiscordEventStore; mappingStore: DiscordWorkerStore; transport: DiscordWorkerTransport; event: DoublesDiscordEvent; enabled: boolean }) {
  return enqueueDoublesDiscordEvent(input)
}

export async function processNextDoublesDiscordEvent(input: { eventStore: DoublesDiscordEventStore; mappingStore: DiscordWorkerStore; transport: DiscordWorkerTransport; enabled: boolean; now?: Date }) {
  if (!input.enabled) return { status: "DISABLED" as const }
  await input.eventStore.recoverStale()
  const event = await input.eventStore.claim()
  if (!event) return { status: "EMPTY" as const }
  try {
    const worker = new DoublesDiscordWorker(input.mappingStore, input.transport)
    const result = await worker.process({ ...event, enabled: input.enabled }, event.eventType)
    await input.eventStore.ack(event.id)
    return { status: "ACKED" as const, event: event.eventType, result }
  } catch (error) {
    const failure = error as { status?: number; code?: string; message?: string }
    const kind = classifyDoublesDiscordFailure(failure)
    const retry = boardRetry(event.attempts, kind)
    const state = retry.state === "NOT_FOUND" ? "NOT_FOUND" : retry.state === "EXHAUSTED" ? "EXHAUSTED" : "RETRYABLE"
    const availableAt = retry.delayMs == null ? new Date().toISOString() : new Date((input.now ?? new Date()).getTime() + retry.delayMs).toISOString()
    await input.eventStore.fail(event.id, state, failure.message || "Discord event failed", availableAt)
    return { status: state, event: event.eventType, error: failure.message || "Discord event failed" }
  }
}
