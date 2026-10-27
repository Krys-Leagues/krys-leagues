import type { DiscordResult, TournamentDiscordAdapter } from "./workflow"

const DISCORD_API_BASE = "https://discord.com/api/v10"
const MAX_RETRIES = 2

type DiscordResponse = { id?: unknown; message?: unknown; code?: unknown }

function compactReason(body: DiscordResponse | null, fallback: string) {
  return typeof body?.message === "string" && body.message.trim() ? body.message.trim().slice(0, 300) : fallback
}

export function getTournamentDiscordConfig() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim() || null
  const parentChannelId = process.env.TOURNAMENT_DISCORD_PARENT_CHANNEL_ID?.trim() || null
  const adminIds = (process.env.TOURNAMENT_DISCORD_ADMIN_IDS || "").split(",").map((value) => value.trim()).filter((value) => /^\d+$/.test(value))
  return { token, parentChannelId, adminIds }
}

export function createTournamentDiscordAdapter(options: { token?: string | null; parentChannelId?: string | null; adminIds?: string[]; fetchImpl?: typeof fetch } = {}): TournamentDiscordAdapter {
  const config = getTournamentDiscordConfig()
  const token = options.token === undefined ? config.token : options.token
  const parentChannelId = options.parentChannelId === undefined ? config.parentChannelId : options.parentChannelId
  const adminIds = options.adminIds || config.adminIds
  const fetchImpl = options.fetchImpl || fetch

  async function request(path: string, init: RequestInit = {}) {
    if (!token) return { response: null, body: null as DiscordResponse | null, error: "Discord bot credentials are not configured" }
    let lastStatus = 0
    let lastBody: DiscordResponse | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
      })
      const raw = await response.text().catch(() => "")
      try { lastBody = raw ? JSON.parse(raw) as DiscordResponse : null } catch { lastBody = null }
      if (response.ok) return { response, body: lastBody, error: null as string | null }
      lastStatus = response.status
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_RETRIES) break
      const retryAfter = Number(response.headers.get("retry-after") || "0")
      if (retryAfter > 0 && retryAfter < 5) await new Promise((resolve) => setTimeout(resolve, Math.ceil(retryAfter * 1000)))
    }
    return { response: null, body: lastBody, error: compactReason(lastBody, `Discord returned status ${lastStatus}`) }
  }

  async function createPrivateThread(input: { matchId: string; playerIds: string[]; body: string }): Promise<DiscordResult> {
    if (!token || !parentChannelId) return { status: "not_configured", reason: "Discord bot credentials or tournament parent channel is not configured" }
    const created = await request(`/channels/${encodeURIComponent(parentChannelId)}/threads`, { method: "POST", body: JSON.stringify({ name: `match-${input.matchId.slice(0, 8)}`, type: 12, invitable: false, auto_archive_duration: 1440 }) })
    if (created.error || typeof created.body?.id !== "string") return { status: "failed", reason: created.error || "Discord did not return a thread id" }
    const threadId = created.body.id
    const memberIds = [...new Set([...input.playerIds, ...adminIds])]
    for (const memberId of memberIds) {
      const added = await request(`/channels/${encodeURIComponent(threadId)}/thread-members/${encodeURIComponent(memberId)}`, { method: "PUT" })
      if (added.error) {
        await request(`/channels/${encodeURIComponent(threadId)}`, { method: "DELETE" })
        return { status: "failed", reason: `Discord could not add an authorized thread member: ${added.error}` }
      }
    }
    const message = await request(`/channels/${encodeURIComponent(threadId)}/messages`, { method: "POST", body: JSON.stringify({ content: input.body, allowed_mentions: { parse: [] } }) })
    if (message.error) {
      await request(`/channels/${encodeURIComponent(threadId)}`, { method: "DELETE" })
      return { status: "failed", reason: `Discord could not post the match instructions: ${message.error}` }
    }
    return { status: "sent", id: threadId }
  }

  async function sendReminder(input: { matchId: string; playerIds: string[]; body: string }): Promise<DiscordResult> {
    if (!token) return { status: "not_configured", reason: "Discord bot credentials are not configured" }
    const messageIds: string[] = []
    for (const playerId of [...new Set(input.playerIds)]) {
      const dm = await request("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: playerId }) })
      if (dm.error || typeof dm.body?.id !== "string") return { status: "failed", reason: dm.error || "Discord did not return a direct-message channel" }
      const sent = await request(`/channels/${encodeURIComponent(dm.body.id)}/messages`, { method: "POST", body: JSON.stringify({ content: input.body, allowed_mentions: { parse: [] } }) })
      if (sent.error || typeof sent.body?.id !== "string") return { status: "failed", reason: sent.error || "Discord did not return a reminder message id" }
      messageIds.push(sent.body.id)
    }
    return { status: "sent", id: messageIds[0] }
  }

  async function sendThreadMessage(input: { threadId: string; body: string }): Promise<DiscordResult> {
    if (!token) return { status: "not_configured", reason: "Discord bot credentials are not configured" }
    const sent = await request(`/channels/${encodeURIComponent(input.threadId)}/messages`, { method: "POST", body: JSON.stringify({ content: input.body, allowed_mentions: { parse: [] } }) })
    return sent.error || typeof sent.body?.id !== "string" ? { status: "failed", reason: sent.error || "Discord did not return a thread message id" } : { status: "sent", id: sent.body.id }
  }

  async function deleteThread(threadId: string): Promise<DiscordResult> {
    if (!token) return { status: "not_configured", reason: "Discord bot credentials are not configured" }
    const deleted = await request(`/channels/${encodeURIComponent(threadId)}`, { method: "DELETE" })
    return deleted.error ? { status: "failed", reason: deleted.error } : { status: "sent", id: threadId }
  }

  return { createPrivateThread, sendReminder, sendThreadMessage, deleteThread }
}
