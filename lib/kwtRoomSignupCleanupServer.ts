import "server-only"

import { createClient } from "@supabase/supabase-js"

import {
  KWT_ROOM_SIGNUP_CHANNEL_ID,
  KWT_ROOM_SIGNUP_GUILD_ID,
  type KwtDiscordDeleteTransport,
  type KwtDiscordMessage,
} from "./kwtRoomSignupCleanup"

const DISCORD_API_BASE = "https://discord.com/api/v10"
const MAX_MESSAGE_PAGES = 20

class DiscordCleanupError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getKwtDiscordBotToken() {
  return process.env.DISCORD_BOT_TOKEN?.trim() || null
}

export function createKwtCleanupAuditClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("KWT cleanup audit access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function discordRequest(token: string, path: string, init?: RequestInit) {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bot ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new DiscordCleanupError(response.status, `Discord returned status ${response.status}.`)
  }
  return response.status === 204 ? null : response.json()
}

export async function loadKwtRoomSignupChannel(token: string) {
  const channel = await discordRequest(token, `/channels/${KWT_ROOM_SIGNUP_CHANNEL_ID}`) as {
    id?: string
    guild_id?: string
    type?: number
  }
  if (
    channel.id !== KWT_ROOM_SIGNUP_CHANNEL_ID
    || channel.guild_id !== KWT_ROOM_SIGNUP_GUILD_ID
    || channel.type !== 0
  ) {
    throw new Error("KWT room signup channel identity did not match the protected configuration.")
  }
  return channel
}

export async function loadKwtRoomSignupMessages(token: string) {
  const pinned = await discordRequest(
    token,
    `/channels/${KWT_ROOM_SIGNUP_CHANNEL_ID}/pins`,
  ) as KwtDiscordMessage[]
  const messages: KwtDiscordMessage[] = []
  let before: string | null = null

  for (let pageNumber = 0; pageNumber < MAX_MESSAGE_PAGES; pageNumber += 1) {
    const query = new URLSearchParams({ limit: "100" })
    if (before) query.set("before", before)
    const page = await discordRequest(
      token,
      `/channels/${KWT_ROOM_SIGNUP_CHANNEL_ID}/messages?${query}`,
    ) as KwtDiscordMessage[]
    messages.push(...page)
    if (page.length < 100) {
      return { messages, pinnedIds: new Set(pinned.map((message) => message.id)) }
    }
    before = page.at(-1)?.id ?? null
  }

  throw new Error("KWT cleanup stopped because the channel exceeded the bounded inspection limit.")
}

export function createKwtDiscordDeleteTransport(token: string): KwtDiscordDeleteTransport {
  return {
    async bulkDelete(messageIds) {
      await discordRequest(token, `/channels/${KWT_ROOM_SIGNUP_CHANNEL_ID}/messages/bulk-delete`, {
        method: "POST",
        body: JSON.stringify({ messages: messageIds }),
      })
    },
    async deleteOne(messageId) {
      if (!/^\d+$/.test(messageId)) throw new Error("Invalid Discord message identifier.")
      await discordRequest(
        token,
        `/channels/${KWT_ROOM_SIGNUP_CHANNEL_ID}/messages/${messageId}`,
        { method: "DELETE" },
      )
    },
  }
}
