import { createHmac, timingSafeEqual } from "node:crypto"
import { DISCORD_DOUBLES_ELITE_CHANNEL_ID } from "./discordPreviewSender.ts"

export const NEXT_SEASON_DOUBLES_DISCORD_ENABLED = false
export const DOUBLES_DISCORD_INTERACTION_PREFIX = "preview:next-season:doubles:"
export const DOUBLES_DISCORD_TEST_CHANNEL_ID = DISCORD_DOUBLES_ELITE_CHANNEL_ID

export type DivisionDiscordMapping = {
  seasonId: string
  division: string
  arrangeChannelId: string | null
  arrangeMessageId: string | null
  boardChannelId: string | null
  boardMessageId: string | null
  status: "ACTIVE" | "HISTORICAL" | "FAILED" | "TEST"
}

export type FixtureDiscordMapping = {
  fixtureId: string
  threadId: string | null
  threadChannelId: string | null
  starterMessageId: string | null
  matchImageMessageId: string | null
  submitComponentMessageId: string | null
  state: "PENDING" | "MATCH_SET" | "COMPLETED" | "ARCHIVED" | "FAILED" | "TEST"
}

export function currentSeasonGate(input: { currentSeasonId: string; targetSeasonId: string; explicitEnable?: string }) {
  return NEXT_SEASON_DOUBLES_DISCORD_ENABLED && input.currentSeasonId !== input.targetSeasonId && input.explicitEnable === "true"
}

export function validatePreviewChannel(channelId: string) {
  return channelId === DOUBLES_DISCORD_TEST_CHANNEL_ID
}

export function arrangeMessagePlan(mapping: DivisionDiscordMapping | null, channelId: string) {
  if (!validatePreviewChannel(channelId)) throw new Error("Doubles Discord routing is locked to the approved Elite test channel")
  return mapping?.arrangeMessageId
    ? { operation: "EDIT" as const, messageId: mapping.arrangeMessageId, channelId }
    : { operation: "CREATE" as const, messageId: null, channelId }
}

export function boardMessagePlan(mapping: DivisionDiscordMapping | null, channelId: string) {
  if (!validatePreviewChannel(channelId)) throw new Error("Doubles Discord routing is locked to the approved Elite test channel")
  return mapping?.boardMessageId
    ? { operation: "EDIT" as const, messageId: mapping.boardMessageId, channelId }
    : { operation: "CREATE" as const, messageId: null, channelId }
}

export function boardReplacementPlan(input: { existingMessageId: string | null; newMessageId: string; newMessageCreated: boolean }) {
  if (!input.newMessageCreated) return { deleteOld: false, mappingMessageId: input.existingMessageId }
  return { deleteOld: Boolean(input.existingMessageId && input.existingMessageId !== input.newMessageId), mappingMessageId: input.newMessageId }
}

export function fixtureThreadPlan(input: { arrangementState: string; mapping: FixtureDiscordMapping | null }) {
  if (input.mapping?.threadId) return { operation: "REUSE" as const, threadId: input.mapping.threadId }
  if (input.arrangementState !== "ACCEPTED" && input.arrangementState !== "MATCH SET") return { operation: "WAIT" as const, threadId: null }
  return { operation: "CREATE" as const, threadId: null }
}

export function completeFixtureThread(mapping: FixtureDiscordMapping) {
  return { ...mapping, state: "ARCHIVED" as const, submitComponentMessageId: null }
}

export function validatePreviewInteraction(customId: string) {
  if (!customId.startsWith(DOUBLES_DISCORD_INTERACTION_PREFIX)) return null
  const action = customId.slice(DOUBLES_DISCORD_INTERACTION_PREFIX.length)
  if (!["availability", "propose", "counter", "accept", "scorecard"].includes(action)) return null
  return { action }
}

export function createSignedInteractionId(input: { fixtureId: string; action: "propose" | "counter" | "accept" | "scorecard"; expiresAt: number; proposedFor?: string }, secret: string) {
  const payload = Buffer.from(JSON.stringify(input)).toString("base64url")
  const signature = createHmac("sha256", secret).update(payload).digest("base64url")
  return `doubles:live:${payload}.${signature}`
}

export function verifySignedInteractionId(customId: string, secret: string, now = Date.now()) {
  if (!customId.startsWith("doubles:live:") || !secret) return null
  const encoded = customId.slice("doubles:live:".length)
  const [payload, signature] = encoded.split(".")
  if (!payload || !signature) return null
  const expected = createHmac("sha256", secret).update(payload).digest("base64url")
  const left = Buffer.from(expected)
  const right = Buffer.from(signature)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { fixtureId?: string; action?: string; expiresAt?: number }
    if (!parsed.fixtureId || !parsed.expiresAt || parsed.expiresAt < now || !["propose", "counter", "accept", "scorecard"].includes(parsed.action || "")) return null
    return parsed as { fixtureId: string; action: "propose" | "counter" | "accept" | "scorecard"; expiresAt: number; proposedFor?: string }
  } catch {
    return null
  }
}

export function previewInteractionResponse(customId: string) {
  const interaction = validatePreviewInteraction(customId)
  if (!interaction) return null
  return { type: 4, data: { content: "Preview only — no league data changed.", flags: 64 } }
}

export function verifyInteractionSignature(body: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false
  const expected = createHmac("sha256", secret).update(body).digest("hex")
  const left = Buffer.from(expected)
  const right = Buffer.from(signature)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function cleanupTestArtifacts(rows: Array<{ channelId: string; testKey: string; messageId?: string | null; threadId?: string | null }>, channelId: string) {
  if (!validatePreviewChannel(channelId)) throw new Error("Test cleanup is locked to the approved Elite channel")
  return rows.filter((row) => row.channelId === channelId && row.testKey.startsWith("next-season:doubles:test:"))
}
