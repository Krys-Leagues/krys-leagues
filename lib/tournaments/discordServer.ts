import "server-only"

const DISCORD_API_BASE = "https://discord.com/api/v10"
const TOURNAMENT_GUILD_ID = "1036296151651074168"
const CATEGORY_NAME = "5-4-3-2-1 TOURNAMENT"
const PLAYER_ROLE_NAME = "5-4-3-2-1 Players"
const MATCH_CHANNEL_NAME = "MATCH THREADS"
const MAX_RETRIES = 2

type DiscordBody = { id?: unknown; message?: unknown; code?: unknown; retry_after?: unknown; global?: unknown }
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
  retryAfterMs?: number | null
  globalRateLimit?: boolean
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

export type DiscordResourceProvisioning = {
  status: "ready" | "created" | "failed" | "not_configured"
  categoryId?: string
  roleId?: string
  matchChannelId?: string
  created: { category: boolean; role: boolean; matchChannel: boolean }
  reason?: string
}

function compactReason(body: DiscordBody | null, fallback: string) {
  return typeof body?.message === "string" && body.message.trim() ? body.message.trim().slice(0, 300) : fallback
}

function numericCode(body: DiscordBody | null) {
  return typeof body?.code === "number" ? body.code : null
}

function rateLimitDelayMs(body: DiscordBody | null, headers: Headers) {
  const headerValue = headers.get("retry-after")
  const bodyValue = typeof body?.retry_after === "number" ? body.retry_after : null
  const fallbackValue = headers.get("x-ratelimit-reset-after")
  const seconds = headerValue !== null
    ? Number(headerValue)
    : bodyValue !== null
      ? bodyValue
      : fallbackValue !== null
        ? Number(fallbackValue)
        : 0
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : 0
}

function isGlobalRateLimit(body: DiscordBody | null, headers: Headers) {
  return body?.global === true || headers.get("x-ratelimit-global")?.toLowerCase() === "true"
}

function checkFromResponse(status: number, body: DiscordBody | null, okClassification: DiscordMemberClassification, headers = new Headers()): DiscordCheck {
  const code = numericCode(body)
  if (status >= 200 && status < 300) return { classification: okClassification, httpStatus: status, discordCode: code }
  if (status === 401) return { classification: "BOT_AUTHENTICATION_FAILURE", httpStatus: status, discordCode: code, detail: compactReason(body, "Discord rejected the bot credential") }
  if (status === 403) return { classification: "BOT_PERMISSION_FAILURE", httpStatus: status, discordCode: code, detail: compactReason(body, "Discord denied the bot request") }
  if (status === 429) return {
    classification: "DISCORD_RATE_LIMIT",
    httpStatus: status,
    discordCode: code,
    detail: "Discord rate limited the read-only request",
    retryAfterMs: rateLimitDelayMs(body, headers),
    globalRateLimit: isGlobalRateLimit(body, headers),
  }
  if (status >= 500 && status <= 599) return { classification: "DISCORD_API_FAILURE", httpStatus: status, discordCode: code, detail: compactReason(body, "Discord returned a server error") }
  return { classification: "UNKNOWN_VERIFICATION_ERROR", httpStatus: status, discordCode: code, detail: compactReason(body, "Discord returned an unexpected response") }
}

function memberCheck(status: number, body: DiscordBody | null, headers = new Headers()): DiscordCheck {
  const code = numericCode(body)
  if (status >= 200 && status < 300) return { classification: "CONFIRMED_GUILD_MEMBER", httpStatus: status, discordCode: code }
  if (status === 404 && code === 10007) return { classification: "NOT_IN_GUILD", httpStatus: status, discordCode: code, detail: "Discord reports Unknown Member for this guild" }
  if (status === 404 && code === 10013) return { classification: "UNKNOWN_DISCORD_USER", httpStatus: status, discordCode: code, detail: "Discord reports Unknown User for this ID" }
  return checkFromResponse(status, body, "CONFIRMED_GUILD_MEMBER", headers)
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
  const successfulResponses = new Map<string, { body: DiscordBody | null; error: string | null; status: number; headers: Headers }>()
  let globalCooldownUntil = 0

  async function request(path: string, init: RequestInit = {}) {
    if (!token) return { body: null as DiscordBody | null, error: "Discord bot credentials are not configured", status: null as number | null, headers: new Headers() }
    const method = (init.method || "GET").toUpperCase()
    if (method === "GET") {
      const cached = successfulResponses.get(path)
      if (cached) return cached
    }
    let lastStatus = 0
    let lastBody: DiscordBody | null = null
    let lastHeaders = new Headers()
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const remainingGlobalCooldown = globalCooldownUntil - Date.now()
      if (remainingGlobalCooldown > 0) await new Promise((resolve) => setTimeout(resolve, remainingGlobalCooldown))
      const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
      })
      lastHeaders = response.headers
      const raw = await response.text().catch(() => "")
      try { lastBody = raw ? JSON.parse(raw) as DiscordBody : null } catch { lastBody = null }
      if (response.ok) {
        const result = { body: lastBody, error: null as string | null, status: response.status, headers: lastHeaders }
        if (method === "GET") successfulResponses.set(path, result)
        return result
      }
      lastStatus = response.status
      if (response.status !== 429 && ![500, 502, 503, 504].includes(response.status)) break
      if (attempt === MAX_RETRIES) break
      const retryAfterMs = response.status === 429 ? rateLimitDelayMs(lastBody, lastHeaders) : 0
      if (response.status === 429 && isGlobalRateLimit(lastBody, lastHeaders)) globalCooldownUntil = Math.max(globalCooldownUntil, Date.now() + retryAfterMs)
      if (retryAfterMs > 0) await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
    }
    return { body: lastBody, error: compactReason(lastBody, `Discord returned status ${lastStatus}`), status: lastStatus, headers: lastHeaders }
  }

  async function verifyConnection(input: { playerIds: string[]; adminIds: string[] }): Promise<DiscordVerification> {
    if (!token) return { status: "not_configured", reason: "Discord bot credentials are not configured", botCheck: { classification: "BOT_AUTHENTICATION_FAILURE", httpStatus: null, detail: "Discord bot credential is not configured" } }
    const bot = await request("/users/@me")
    const channels = await request(`/guilds/${TOURNAMENT_GUILD_ID}/channels`)
    const roles = await request(`/guilds/${TOURNAMENT_GUILD_ID}/roles`)
    const ids = [...new Set([...input.playerIds, ...input.adminIds, ...adminIds])]
    const members: DiscordMemberDiagnostic[] = []
    for (const playerId of ids) {
      const result = await request(`/guilds/${TOURNAMENT_GUILD_ID}/members/${encodeURIComponent(playerId)}`)
      const diagnostic = result.status === null
        ? { classification: "BOT_AUTHENTICATION_FAILURE" as const, httpStatus: null, detail: result.error || "Discord bot credential is not configured" }
        : memberCheck(result.status, result.body, result.headers)
      members.push({ discordId: playerId, ...diagnostic })
    }
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
      : checkFromResponse(bot.status, bot.body, "CHECK_OK", bot.headers)
    const channelsCheck = channels.status === null
      ? { classification: "BOT_AUTHENTICATION_FAILURE" as const, httpStatus: null, detail: channels.error || "Discord bot credential is not configured" }
      : checkFromResponse(channels.status, channels.body, "CHECK_OK", channels.headers)
    const rolesCheck = roles.status === null
      ? { classification: "BOT_AUTHENTICATION_FAILURE" as const, httpStatus: null, detail: roles.error || "Discord bot credential is not configured" }
      : checkFromResponse(roles.status, roles.body, "CHECK_OK", roles.headers)
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

  async function ensureTournamentResources(): Promise<DiscordResourceProvisioning> {
    if (!token) return { status: "not_configured", created: { category: false, role: false, matchChannel: false }, reason: "Discord bot credentials are not configured" }

    const channelsResult = await request(`/guilds/${TOURNAMENT_GUILD_ID}/channels`)
    const rolesResult = await request(`/guilds/${TOURNAMENT_GUILD_ID}/roles`)
    if (channelsResult.error || rolesResult.error) {
      return { status: "failed", created: { category: false, role: false, matchChannel: false }, reason: channelsResult.error || rolesResult.error || "Discord resource lookup failed" }
    }

    const channelRows = Array.isArray(channelsResult.body) ? channelsResult.body as unknown as GuildChannel[] : []
    const roleRows = Array.isArray(rolesResult.body) ? rolesResult.body as unknown as GuildRole[] : []
    let category = channelRows.find((channel) => channel.name === CATEGORY_NAME && channel.type === 4)
    let role = roleRows.find((candidate) => candidate.name === PLAYER_ROLE_NAME)
    let matchChannel = category?.id
      ? channelRows.find((channel) => channel.name === MATCH_CHANNEL_NAME && channel.type === 0 && channel.parent_id === category?.id)
      : undefined
    const created = { category: false, role: false, matchChannel: false }

    if (!category) {
      const createdCategory = await request(`/guilds/${TOURNAMENT_GUILD_ID}/channels`, { method: "POST", body: JSON.stringify({ name: CATEGORY_NAME, type: 4 }) })
      if (createdCategory.error || typeof createdCategory.body?.id !== "string") {
        return { status: "failed", created, reason: createdCategory.error || "Discord did not return a category id" }
      }
      category = { id: createdCategory.body.id, name: CATEGORY_NAME, type: 4 }
      created.category = true
    }

    if (!role) {
      const createdRole = await request(`/guilds/${TOURNAMENT_GUILD_ID}/roles`, { method: "POST", body: JSON.stringify({ name: PLAYER_ROLE_NAME, permissions: "0", hoist: false, mentionable: false }) })
      if (createdRole.error || typeof createdRole.body?.id !== "string") {
        return { status: "failed", categoryId: typeof category.id === "string" ? category.id : undefined, created, reason: createdRole.error || "Discord did not return a player-role id" }
      }
      role = { id: createdRole.body.id, name: PLAYER_ROLE_NAME }
      created.role = true
    }

    if (!matchChannel && typeof category.id === "string") {
      const createdChannel = await request(`/guilds/${TOURNAMENT_GUILD_ID}/channels`, { method: "POST", body: JSON.stringify({ name: MATCH_CHANNEL_NAME, type: 0, parent_id: category.id }) })
      if (createdChannel.error || typeof createdChannel.body?.id !== "string") {
        return { status: "failed", categoryId: category.id, roleId: typeof role.id === "string" ? role.id : undefined, created, reason: createdChannel.error || "Discord did not return a match-channel id" }
      }
      matchChannel = { id: createdChannel.body.id, name: MATCH_CHANNEL_NAME, type: 0, parent_id: category.id }
      created.matchChannel = true
    }

    const complete = typeof category.id === "string" && typeof role.id === "string" && typeof matchChannel?.id === "string"
    return {
      status: complete ? (created.category || created.role || created.matchChannel ? "created" : "ready") : "failed",
      categoryId: typeof category.id === "string" ? category.id : undefined,
      roleId: typeof role.id === "string" ? role.id : undefined,
      matchChannelId: typeof matchChannel?.id === "string" ? matchChannel.id : undefined,
      created,
      reason: complete ? undefined : "Discord tournament resources are incomplete",
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

  return { verifyConnection, ensureTournamentResources, createPrivateThread }
}
