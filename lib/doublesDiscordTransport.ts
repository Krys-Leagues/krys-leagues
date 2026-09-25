import { DISCORD_DOUBLES_ELITE_CHANNEL_ID } from "./discordPreviewSender.ts"
import type { DiscordWorkerTransport } from "./doublesDiscordWorker.ts"

export const DOUBLES_DISCORD_CHANNELS: Record<string, string> = {
  ELITE: DISCORD_DOUBLES_ELITE_CHANNEL_ID,
  D1: "1217979379691421827",
  D2: "1217979667408097434",
  D3: "1217980689786343494",
  D4: "1217981197792186508",
  D5: "1323942215524814928",
  D6: "1324239072138363011",
  D7: "1339282438194598071",
}

export function resolveDoublesDiscordChannel(division: string) {
  const key = division.trim().toUpperCase().replace("DOUBLES ", "")
  const channelId = DOUBLES_DISCORD_CHANNELS[key]
  if (!channelId) throw new Error("No authoritative Doubles Discord channel is configured for this division")
  return channelId
}

export class DiscordTransportError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = "DiscordTransportError"
    this.status = status
    this.code = code
  }
}

export function createDoublesDiscordTransport(input: { botToken?: string; fetchImpl?: typeof fetch } = {}): DiscordWorkerTransport & { fetchThread: (threadId: string) => Promise<unknown>; addThreadParticipant: (threadId: string, userId: string) => Promise<void>; unarchiveThread: (threadId: string) => Promise<void>; respondToInteraction: (interactionId: string, token: string, payload: unknown) => Promise<void> } {
  const token = input.botToken ?? process.env.DISCORD_BOT_TOKEN ?? ""
  const fetchImpl = input.fetchImpl ?? fetch
  if (!token.trim()) throw new Error("Discord bot token is required")
  const api = "https://discord.com/api/v10"
  const headers = { Authorization: `Bot ${token}` }

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetchImpl(`${api}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    const text = await response.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!response.ok) {
      const body = data as { message?: string; code?: string } | null
      throw new DiscordTransportError(response.status, body?.message || `Discord request failed (${response.status})`, body?.code)
    }
    return data
  }

  async function sendMessage(channelId: string, payload: unknown) {
    const isForm = typeof FormData !== "undefined" && payload instanceof FormData
    const response = await request(`/channels/${channelId}/messages`, { method: "POST", headers: isForm ? undefined : { "Content-Type": "application/json" }, body: isForm ? payload as FormData : JSON.stringify(payload) }) as { id?: string; channel_id?: string }
    if (!response.id || response.channel_id !== channelId) throw new Error("Discord returned an unexpected message destination")
    return { messageId: response.id, channelId: response.channel_id }
  }

  return {
    async createMessage(channelId, payload) { return sendMessage(channelId, payload) },
    async editMessage(channelId, messageId, payload) {
      const isForm = typeof FormData !== "undefined" && payload instanceof FormData
      await request(`/channels/${channelId}/messages/${messageId}`, { method: "PATCH", headers: isForm ? undefined : { "Content-Type": "application/json" }, body: isForm ? payload as FormData : JSON.stringify(payload) })
    },
    async createThread(channelId, name) {
      const thread = await request(`/channels/${channelId}/threads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, auto_archive_duration: 10080, type: 11, invitable: false }) }) as { id?: string; parent_id?: string }
      if (!thread.id || thread.parent_id !== channelId) throw new Error("Discord returned an unexpected thread destination")
      return { threadId: thread.id, channelId }
    },
    async sendThreadStarter(threadId, payload) { return sendMessage(threadId, payload).then(({ messageId }) => ({ messageId })) },
    async archiveThread(threadId) { await request(`/channels/${threadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: true, locked: false }) }) },
    async deleteMessage(channelId, messageId) { await request(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" }) },
    async fetchThread(threadId) { return request(`/channels/${threadId}`) },
    async addThreadParticipant(threadId, userId) { await request(`/channels/${threadId}/thread-members/${userId}`, { method: "PUT" }) },
    async unarchiveThread(threadId) { await request(`/channels/${threadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: false, locked: false }) }) },
    async respondToInteraction(interactionId, interactionToken, payload) { await fetchImpl(`${api}/interactions/${interactionId}/${interactionToken}/callback`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(async (response) => { if (!response.ok) throw new DiscordTransportError(response.status, "Discord interaction response failed") }) },
  }
}
