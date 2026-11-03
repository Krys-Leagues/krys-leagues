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

export type DiscordMemberClassification =
  | "CHECK_OK"
  | "CONFIRMED_GUILD_MEMBER"
  | "NOT_IN_GUILD"
  | "UNKNOWN_DISCORD_USER"
  | "BOT_PERMISSION_FAILURE"
  | "BOT_AUTHENTICATION_FAILURE"
  | "DISCORD_RATE_LIMIT"
  | "DISCORD_API_FAILURE"
  | "UNKNOWN_VERIFICATION_ERROR"

export type DiscordCheck = {
  classification: DiscordMemberClassification
  httpStatus: number | null
  discordCode?: number | null
  detail?: string
}

export type DiscordMemberDiagnostic = DiscordCheck & { discordId: string }

export type DiscordVerification = {
  status: "ready" | "mismatch" | "failed" | "not_configured"
  reason?: string
  botCheck?: DiscordCheck
  channelsCheck?: DiscordCheck
  rolesCheck?: DiscordCheck
  memberResults?: DiscordMemberDiagnostic[]
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

function numericCode(body: DiscordBody | null) {
  return typeof body?.code === "number" ? body.code : null
}

function checkFromResponse(status: number, body: DiscordBody | null, okClassification: DiscordMemberClassification): DiscordCheck {
  const code = numericCode(body)
  if (status >= 200 && status < 300) return { classification: okClassification, httpStatus: status, discordCode: code }
  if (status === 401) return { classification: "BOT_AUTHENTICATION_FAILURE", httpStatus: status, discordCode: code, detail: compactReason(body, "Discord rejected the bot credential") }
  if (status === 403) return { classification: "BOT_PERMISSION_FAILURE", httpStatus: status, discordCode: code, detail: compactReason(body, "Discord denied the bot request") }
  if (status === 429) return { classification: "DISCORD_RATE_LIMIT", httpStatus: status, discordCode: code, detail: "Discord rate limited the read-only request" }
  if (status >= 500 && status <= 599) return { classification: "DISCORD_API_FAILURE", httpStatus: status, discordCode: code, detail: compactReason(body, "Discord returned a server error") }
  return { classification: "UNKNOWN_VERIFICATION_ERROR", httpStatus: status, discordCode: code, detail: compactReason(body, "Discord returned an unexpected response") }
}

function memberCheck(status: number, body: DiscordBody | null): DiscordCheck {
  const code = numericCode(body)
  if (status >= 200 && status < 300) return { classification: "CONFIRMED_GUILD_MEMBER", httpStatus: status, discordCode: code }
  if (status === 404 && code === 10007) return { classification: "NOT_IN_GUILD", httpStatus: status, discordCode: code, detail: "Discord reports Unknown Member for this guild" }
  if (status === 404 && code === 10013) return { classification: "UNKNOWN_DISCORD_USER", httpStatus: status, discordCode: code, detail: "Discord reports Unknown User for this ID" }
  return checkFromResponse(status, body, "CONFIRMED_GUILD_MEMBER")
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
    if (!token) return { body: null as DiscordBody | null, error: "Discord bot credentials are not configured", status: null as number | null }
    let lastStatus = 0
    let lastBody: DiscordBody | null = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
      })
      const raw = await response.text().catch(() => "")
      try { lastBody = raw ? JSON.parse(raw) as DiscordBody : null } catch { lastBody = null }
      if (response.ok) return { body: lastBody, error: null as string | null, status: response.status }
      lastStatus = response.status
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_RETRIES) break
      const retryAfter = Number(response.headers.get("retry-after") || "0")
      if (retryAfter > 0 && retryAfter < 5) await new Promise((resolve) => setTimeout(resolve, Math.ceil(retryAfter * 1000)))
    }
    return { body: lastBody, error: compactReason(lastBody, `Discord returned status ${lastStatus}`), status: lastStatus }
  }

  async function verifyConnection(input: { playerIds: string[]; adminIds: string[] }): Promise<DiscordVerification> {
    if (!token) return { status: "not_configured", reason: "Discord bot credentials are not configured", botCheck: { classification: "BOT_AUTHENTICATION_FAILURE", httpStatus: null, detail: "Discord bot credential is not configured" } }
    const bot = await request("/users/@me")
    const channels = await request(`/guilds/${TOURNAMENT_GUILD_ID}/channels`)
    const roles = await request(`/guilds/${TOURNAMENT_GUILD_ID}/roles`)
    const ids = [...new Set([...input.playerIds, ...input.adminIds, ...adminIds])]
    const members = await Promise.all(ids.map(async (playerId) => {
      const result = await request(`/guilds/${TOURNAMENT_GUILD_ID}/members/${encodeURIComponent(playerId)}`)
      const diagnostic = result.status === null
        ? { classification: "BOT_AUTHENTICATION_FAILURE" as const, httpStatus: null, detail: result.error || "Discord bot credential is not configured" }
        : memberCheck(result.status, result.body)
      return { discordId: playerId, ...diagnostic }
    }))
    const channelRows = Array.isArray(channels.body) ? channels.body as unknown as GuildChannel[] : []
    const roleRows = Array.isArray(roles.body) ? roles.body as unknown as GuildRole[] : []
    const category = channelRows.find((channel) => channel.name === CATEGORY_NAME && channel.type === 4)
    const matchChannel = channelRows.find((channel) => channel.name === MATCH_CHANNEL_NAME && channel.type === 0 && channel.parent_id === category?.id)
    const playerRole = roleRows.find((role) => role.name === PLAYER_ROLE_NAME)
    const confirmedIds = new Set(members.filter((member) => member.classification === "CONFIRMED_GUILD_MEMBER").map((member) => member.discordId))
    const verifiedPlayerCount = new Set(input.playerIds.filter((id) => confirmedIds.has(id))).size
    const verifiedAdminCount = new Set(input.adminIds.filter((id) => confirmedIds.has(id))).size
    const botCheck = bot.status === null
      ? { classification: "BOT_AUTHENTICATION_FAILURE" as const, httpStatus: null, detail: bot.error || "Discord bot credential is not configured" }
      : checkFromResponse(bot.status, bot.body, "CHECK_OK")
    const channelsCheck = channels.status === null
      ? { classification: "BOT_AUTHENTICATION_FAILURE" as const, httpStatus: null, detail: channels.error || "Discord bot credential is not configured" }
      : checkFromResponse(channels.status, channels.body, "CHECK_OK")
    const rolesCheck = roles.status === null
      ? { classification: "BOT_AUTHENTICATION_FAILURE" as const, httpStatus: null, detail: roles.error || "Discord bot credential is not configured" }
      : checkFromResponse(roles.status, roles.body, "CHECK_OK")
    const infrastructureFailed = [botCheck, channelsCheck, rolesCheck].some((check) => check.classification !== "CHECK_OK")
    const memberFailure = members.find((member) => member.classification !== "CONFIRMED_GUILD_MEMBER")
    return {
      status: infrastructureFailed ? "failed" : category && matchChannel && playerRole && !memberFailure ? "ready" : "mismatch",
      reason: botCheck.detail || channelsCheck.detail || rolesCheck.detail || memberFailure?.detail,
      botCheck,
      channelsCheck,
      rolesCheck,
      memberResults: members,
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
