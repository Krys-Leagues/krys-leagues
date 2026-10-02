import { KRYS_LEAGUES_DISCORD_GUILD_ID } from "./krysLeaguesDiscord.ts"

export const KWT_ROOM_SIGNUP_CHANNEL_ID = "1270449279340904518"
export const KWT_ROOM_SIGNUP_GUILD_ID = KRYS_LEAGUES_DISCORD_GUILD_ID
export const KWT_ROOM_SIGNUP_BOT_ID = "1273873359121289216"

const DISCORD_BULK_DELETE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const BULK_DELETE_SAFETY_MARGIN_MS = 5 * 60 * 1000
const MAX_BULK_DELETE_MESSAGES = 100

export type KwtDiscordMessage = {
  id: string
  timestamp: string
  pinned?: boolean
  type?: number
  author?: { id?: string; bot?: boolean }
  content?: string
  embeds?: Array<{ title?: string; description?: string }>
  components?: unknown[]
  attachments?: unknown[]
}

export type KwtCleanupProtectedCounts = {
  pinned: number
  humanAdmin: number
  unrelatedBot: number
  total: number
}

export type KwtCleanupPlan = {
  candidates: KwtDiscordMessage[]
  protected: KwtCleanupProtectedCounts
}

export type KwtCleanupFailure = { messageId: string; status: number | null }

export type KwtCleanupDeletionResult = {
  deletedCount: number
  failures: KwtCleanupFailure[]
  method: "none" | "bulk" | "individual" | "bulk_and_individual"
}

export type KwtDiscordDeleteTransport = {
  bulkDelete(messageIds: string[]): Promise<void>
  deleteOne(messageId: string): Promise<void>
}

const titlePattern = /^(KWT\d+[A-Z]?) - <t:(\d+):F>$/
const descriptionPattern = /^## ([^\r\n]{1,200})(?:\r\n|\r|\n)## ROOM (KWT\d+[A-Z]?)(?:\r\n|\r|\n)-# React below to sign-up\.$/

export function isObsoleteKwtRoomSignupMessage(
  message: KwtDiscordMessage,
  pinnedIds: ReadonlySet<string>,
  nowMs: number,
) {
  if (message.pinned || pinnedIds.has(message.id)) return false
  if (message.type !== undefined && message.type !== 0) return false
  if (message.author?.id !== KWT_ROOM_SIGNUP_BOT_ID || message.author.bot !== true) return false
  if ((message.content ?? "") !== "") return false
  if ((message.embeds ?? []).length !== 1) return false
  if ((message.components ?? []).length !== 0) return false
  if ((message.attachments ?? []).length !== 0) return false

  const embed = message.embeds![0]
  const title = titlePattern.exec(embed.title ?? "")
  const description = descriptionPattern.exec(embed.description ?? "")
  if (!title || !description || title[1] !== description[2]) return false

  const scheduledAtMs = Number(title[2]) * 1000
  return Number.isSafeInteger(scheduledAtMs) && scheduledAtMs < nowMs
}

export function planKwtRoomSignupCleanup(
  messages: KwtDiscordMessage[],
  pinnedIds: ReadonlySet<string>,
  nowMs = Date.now(),
): KwtCleanupPlan {
  const candidates = messages.filter((message) =>
    isObsoleteKwtRoomSignupMessage(message, pinnedIds, nowMs),
  )
  const candidateIds = new Set(candidates.map((message) => message.id))
  const protectedMessages = messages.filter((message) => !candidateIds.has(message.id))
  const isPinned = (message: KwtDiscordMessage) => message.pinned || pinnedIds.has(message.id)

  return {
    candidates,
    protected: {
      pinned: protectedMessages.filter(isPinned).length,
      humanAdmin: protectedMessages.filter(
        (message) => !isPinned(message) && message.author?.bot !== true,
      ).length,
      unrelatedBot: protectedMessages.filter(
        (message) => !isPinned(message) && message.author?.bot === true,
      ).length,
      total: protectedMessages.length,
    },
  }
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function statusFromError(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    && typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : null
}

export async function deleteKwtRoomSignupMessages(options: {
  candidates: KwtDiscordMessage[]
  transport: KwtDiscordDeleteTransport
  nowMs?: number
}): Promise<KwtCleanupDeletionResult> {
  const nowMs = options.nowMs ?? Date.now()
  const cutoff = nowMs - DISCORD_BULK_DELETE_WINDOW_MS + BULK_DELETE_SAFETY_MARGIN_MS
  const bulkEligible = options.candidates.filter((message) => Date.parse(message.timestamp) >= cutoff)
  const individual = options.candidates.filter((message) => Date.parse(message.timestamp) < cutoff)
  const failures: KwtCleanupFailure[] = []
  let deletedCount = 0

  for (const group of chunks(bulkEligible, MAX_BULK_DELETE_MESSAGES)) {
    if (group.length === 1) {
      individual.push(group[0])
      continue
    }
    try {
      await options.transport.bulkDelete(group.map((message) => message.id))
      deletedCount += group.length
    } catch (error) {
      failures.push(...group.map((message) => ({ messageId: message.id, status: statusFromError(error) })))
    }
  }

  for (const message of individual) {
    try {
      await options.transport.deleteOne(message.id)
      deletedCount += 1
    } catch (error) {
      failures.push({ messageId: message.id, status: statusFromError(error) })
    }
  }

  const usedBulk = bulkEligible.length > 1
  const usedIndividual = individual.length > 0
  const method = usedBulk && usedIndividual
    ? "bulk_and_individual"
    : usedBulk
      ? "bulk"
      : usedIndividual
        ? "individual"
        : "none"

  return { deletedCount, failures, method }
}

let cleanupInFlight = false

export async function runKwtRoomSignupCleanupExclusive<T>(operation: () => Promise<T>) {
  if (cleanupInFlight) return { status: "in-flight" as const }
  cleanupInFlight = true
  try {
    return { status: "completed" as const, value: await operation() }
  } finally {
    cleanupInFlight = false
  }
}
