import "server-only"

const DISCORD_API_BASE = "https://discord.com/api/v10"
const TOURNAMENT_GUILD_ID = "1036296151651074168"
const CATEGORY_NAME = "5-4-3-2-1 TOURNAMENT"
const PLAYER_ROLE_NAME = "5-4-3-2-1 Players"
const MATCH_CHANNEL_NAME = "MATCH THREADS"
const MAX_RETRIES = 2

type DiscordBody = { id?: unknown; message?: unknown; code?: unknown }
type GuildChannel = { id?: unknown; name?: unknown; type?: unknown; parent_id?: unknown }
type GuildRole = { id?: unknown; name?: unknown }

export type DiscordVerification = {
  status: "ready" | "mismatch" | "failed" | "not_configured"
  reason?: string
  botUserConfigured?: boolean
  categoryFound?: boolean
  matchChannelFound?: boolean
  playerRoleFound?: boolean
  verifiedPlayerCount?: number
  verifiedAdminCount?: number
  parentChannelId?: string | null
}

export type DiscordResult = { status: "sent" | "failed" | "not_configured"; id?: string; reason?: string }

function compactReason(body: DiscordBody | null, fallback: string) {
  return typeof body?.message === "string" && body.message.trim() ? body.message.trim().slice(0, 300) : fallback
}

function config() {
  return {
    token: process.env.DISCORD_BOT_TOKEN?.trim() || null,
    adminIds: (process.env.TOURNAMENT_DISCORD_ADMIN_IDS || "").split(",").map((value) => value.trim()).filter((value) => /^\d+$/.test(value)),
  }
}

export function createTournamentDiscordAdapter(options: { token?: string | null; adminIds?: string[]; fetchImpl?: typeof fetch } = {}) {
  const defaults = config()
  const token = options.token === undefined ? defaults.token : options.token
  const adminIds = options.adminIds || defaults.adminIds
  const fetchImpl = options.fetchImpl || fetch

  async function request(path: string, init: RequestInit = {}) {
    if (!token) return { body: null as DiscordBody | null, error: "Discord bot credentials are not configured" }
    let lastStatus = 0
    let lastBody: DiscordBody | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
      })
      const raw = await response.text().catch(() => "")
      try { lastBody = raw ? JSON.parse(raw) as DiscordBody : null } catch { lastBody = null }
      if (response.ok) return { body: lastBody, error: null as string | null }
      lastStatus = response.status
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_RETRIES) break
      const retryAfter = Number(response.headers.get("retry-after") || "0")
      if (retryAfter > 0 && retryAfter < 5) await new Promise((resolve) => setTimeout(resolve, Math.ceil(retryAfter * 1000)))
    }
    return { body: lastBody, error: compactReason(lastBody, `Discord returned status ${lastStatus}`) }
  }

  async function verifyConnection(input: { playerIds: string[]; adminIds: string[] }): Promise<DiscordVerification> {
    if (!token) return { status: "not_configured", reason: "Discord bot credentials are not configured" }
    const bot = await request("/users/@me")
    const channels = await request(`/guilds/${TOURNAMENT_GUILD_ID}/channels`)
    const roles = await request(`/guilds/${TOURNAMENT_GUILD_ID}/roles`)
    const ids = [...new Set([...input.playerIds, ...input.adminIds, ...adminIds])]
    const members = await Promise.all(ids.map((playerId) => request(`/guilds/${TOURNAMENT_GUILD_ID}/members/${encodeURIComponent(playerId)}`)))
    if (bot.error || channels.error || roles.error || members.some((member) => member.error)) {
      return { status: "failed", reason: bot.error || channels.error || roles.error || "One or more tournament members are not Discord guild members" }
    }
    const channelRows = Array.isArray(channels.body) ? channels.body as unknown as GuildChannel[] : []
    const roleRows = Array.isArray(roles.body) ? roles.body as unknown as GuildRole[] : []
    const category = channelRows.find((channel) => channel.name === CATEGORY_NAME && channel.type === 4)
    const matchChannel = channelRows.find((channel) => channel.name === MATCH_CHANNEL_NAME && channel.type === 0 && channel.parent_id === category?.id)
    const playerRole = roleRows.find((role) => role.name === PLAYER_ROLE_NAME)
    const verifiedPlayerCount = new Set(input.playerIds).size
    const verifiedAdminCount = new Set(input.adminIds).size
    return {
      status: category && matchChannel && playerRole ? "ready" : "mismatch",
      botUserConfigured: typeof bot.body?.id === "string",
      categoryFound: Boolean(category),
      matchChannelFound: Boolean(matchChannel),
      playerRoleFound: Boolean(playerRole),
      verifiedPlayerCount,
      verifiedAdminCount,
      parentChannelId: typeof matchChannel?.id === "string" ? matchChannel.id : null,
    }
  }

  async function createPrivateThread(input: { parentChannelId: string; matchId: string; playerIds: string[]; adminIds: string[]; body: string }): Promise<DiscordResult> {
    if (!token) return { status: "not_configured", reason: "Discord bot credentials are not configured" }
    const created = await request(`/channels/${encodeURIComponent(input.parentChannelId)}/threads`, { method: "POST", body: JSON.stringify({ name: `match-${input.matchId.slice(0, 8)}`, type: 12, invitable: false, auto_archive_duration: 1440 }) })
    if (created.error || typeof created.body?.id !== "string") return { status: "failed", reason: created.error || "Discord did not return a thread id" }
    const threadId = created.body.id
    const memberIds = [...new Set([...input.playerIds, ...input.adminIds])]
    for (const memberId of memberIds) {
      const added = await request(`/channels/${encodeURIComponent(threadId)}/thread-members/${encodeURIComponent(memberId)}`, { method: "PUT" })
      if (added.error) {
        await request(`/channels/${encodeURIComponent(threadId)}`, { method: "DELETE" })
        return { status: "failed", reason: `Discord could not add an authorized thread member: ${added.error}` }
      }
    }
    const message = await request(`/channels/${encodeURIComponent(threadId)}/messages`, { method: "POST", body: JSON.stringify({ content: input.body, allowed_mentions: { parse: [] } })
    })
    if (message.error) {
      await request(`/channels/${encodeURIComponent(threadId)}`, { method: "DELETE" })
      return { status: "failed", reason: `Discord could not post the match instructions: ${message.error}` }
    }
    return { status: "sent", id: threadId }
  }

  return { verifyConnection, createPrivateThread }
}
