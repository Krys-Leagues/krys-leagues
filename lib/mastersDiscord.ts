import { createHash } from "node:crypto"

export const MASTERS_VERIFICATION_DISCORD_CHANNEL_ID = "1555012516625653840"

export const MASTERS_ADMIN_LOOKUPS = [
  { label: "Krys", lookupName: "PRINCESS_BANKSHOT" },
  { label: "Tricky", lookupName: "trickydicky" },
  { label: "Dawn", lookupName: "spicy" },
  { label: "Lynn", lookupName: "LYNNIEBODD" },
] as const

export type MastersAdminDmRecipient = {
  label: string
  lookup_name: string
  canonical_player_id: string
  canonical_screen_name: string
  discord_user_id: string
}

export type MastersAdminHelpContext = {
  request_id: string
  player_id: string
  player_screen_name: string
  event_name: string
  round_number: number
  room_label: string
  scheduled_start: string
  local_display_time: string | null
  category: string
  message: string
  submitted_at: string
  other_room: null | { room_label: string; players: string[] }
}

export type MastersAdminDmDelivery = MastersAdminDmRecipient & {
  status: "sent" | "failed"
  discord_channel_id: string | null
  discord_message_id: string | null
  error: string | null
}

export type MastersVerificationRoomState = {
  major_event_id: string
  play_day_id: string
  schedule_group_id: string
  round_number: number
  room_label: string
  room_scorecard_uploaded: boolean
  roster_size: number
  submitted_count: number
  correction_count: number
  verified_count: number
  action_required_count: number
}

type DiscordFetch = typeof fetch

export class DiscordApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Discord returned status ${status}.`)
    this.status = status
  }
}

export function validateMastersAdminRecipients(rows: MastersAdminDmRecipient[]) {
  const expectedLabels = new Set(MASTERS_ADMIN_LOOKUPS.map((admin) => admin.label))
  const labels = new Set(rows.map((row) => row.label))
  const playerIds = new Set(rows.map((row) => row.canonical_player_id))
  const discordIds = new Set(rows.map((row) => row.discord_user_id))
  const valid = rows.length === MASTERS_ADMIN_LOOKUPS.length
    && expectedLabels.size === labels.size
    && [...expectedLabels].every((label) => labels.has(label))
    && playerIds.size === rows.length
    && discordIds.size === rows.length
    && rows.every((row) => /^\d+$/.test(row.discord_user_id) && Boolean(row.canonical_player_id))
  if (!valid) throw new Error("MASTERS_ADMIN_DISCORD_IDENTITIES_AMBIGUOUS")
  return rows
}

export function formatMastersAdminDm(context: MastersAdminHelpContext) {
  const otherRoom = context.other_room
    ? `\n\n**ANOTHER ROOM IS RUNNING**\nRoom: ${context.other_room.room_label}\nPlayers:\n${context.other_room.players.map((name) => `• ${name}`).join("\n")}`
    : "\n\n**NO OTHER MASTERS ROOM RUNNING AT THIS TIME**"
  const noShowContext = context.category === "PLAYER NO-SHOW" ? otherRoom : ""
  const localTime = context.local_display_time ? `\nPlayer local display: ${context.local_display_time}` : ""
  return `**MASTERS ADMIN ALERT**\n**NEEDS ADMIN DECISION**\n\nPlayer: ${context.player_screen_name}\nCanonical player ID: ${context.player_id}\nRoom: ${context.room_label}\nRound: ${context.round_number}\nScheduled room time: ${context.scheduled_start}${localTime}\nIssue category: ${context.category}\nPlayer message: ${context.message}\nSubmitted: ${context.submitted_at}${noShowContext}`
}

export async function deliverMastersAdminDms(options: {
  botToken: string
  recipients: MastersAdminDmRecipient[]
  content: string
  fetchImpl?: DiscordFetch
}) {
  const recipients = validateMastersAdminRecipients(options.recipients)
  const fetchImpl = options.fetchImpl || fetch
  return Promise.all(recipients.map(async (recipient): Promise<MastersAdminDmDelivery> => {
    let channelId: string | null = null
    try {
      const channelResponse = await fetchImpl("https://discord.com/api/v10/users/@me/channels", {
        method: "POST",
        headers: { Authorization: `Bot ${options.botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: recipient.discord_user_id }),
      })
      if (!channelResponse.ok) throw new DiscordApiError(channelResponse.status)
      const channel = await channelResponse.json() as { id?: string }
      channelId = typeof channel.id === "string" && /^\d+$/.test(channel.id) ? channel.id : null
      if (!channelId) throw new Error("Discord did not return a direct-message channel.")

      const messageResponse = await fetchImpl(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${options.botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: options.content, allowed_mentions: { parse: [] } }),
      })
      if (!messageResponse.ok) throw new DiscordApiError(messageResponse.status)
      const message = await messageResponse.json() as { id?: string }
      return {
        ...recipient,
        status: "sent",
        discord_channel_id: channelId,
        discord_message_id: typeof message.id === "string" ? message.id : null,
        error: null,
      }
    } catch (caught) {
      return {
        ...recipient,
        status: "failed",
        discord_channel_id: channelId,
        discord_message_id: null,
        error: caught instanceof Error ? caught.message.slice(0, 500) : "Discord delivery failed.",
      }
    }
  }))
}

export function hasMastersVerificationWork(state: MastersVerificationRoomState) {
  return state.action_required_count > 0
}

export function formatMastersVerificationAlert(state: MastersVerificationRoomState, reviewUrl: string) {
  const correctionLine = state.correction_count > 0
    ? `\n**${state.correction_count} NEEDS CORRECTION**`
    : ""
  const heading = state.correction_count > 0 || state.verified_count > 0
    ? "🟡 **MASTERS VERIFICATION**"
    : "🔴 **MASTERS SCORES NEED VERIFICATION**"
  return `${heading}\n\n**Round ${state.round_number} · ${state.room_label}**\nRoom Scorecard: ${state.room_scorecard_uploaded ? "Uploaded" : "Missing"}\n\n**${state.submitted_count} ${state.submitted_count === 1 ? "SCORE" : "SCORES"} WAITING**${correctionLine}\n**${state.verified_count} / ${state.roster_size} VERIFIED**\n\n[REVIEW NOW](${reviewUrl})`
}

export function mastersVerificationPayloadHash(state: MastersVerificationRoomState, content: string) {
  return createHash("sha256").update(JSON.stringify({ state, content })).digest("hex")
}

export async function createDiscordMessage(options: {
  botToken: string
  channelId: string
  content: string
  fetchImpl?: DiscordFetch
}) {
  const response = await (options.fetchImpl || fetch)(`https://discord.com/api/v10/channels/${encodeURIComponent(options.channelId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${options.botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: options.content, allowed_mentions: { parse: [] } }),
  })
  if (!response.ok) throw new DiscordApiError(response.status)
  const body = await response.json() as { id?: string }
  if (!body.id) throw new Error("Discord did not return a message ID.")
  return body.id
}

export async function updateDiscordMessage(options: {
  botToken: string
  channelId: string
  messageId: string
  content: string
  fetchImpl?: DiscordFetch
}) {
  const response = await (options.fetchImpl || fetch)(`https://discord.com/api/v10/channels/${encodeURIComponent(options.channelId)}/messages/${encodeURIComponent(options.messageId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${options.botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: options.content, allowed_mentions: { parse: [] } }),
  })
  if (!response.ok) throw new DiscordApiError(response.status)
}

export async function deleteDiscordMessage(options: {
  botToken: string
  channelId: string
  messageId: string
  fetchImpl?: DiscordFetch
}) {
  const response = await (options.fetchImpl || fetch)(`https://discord.com/api/v10/channels/${encodeURIComponent(options.channelId)}/messages/${encodeURIComponent(options.messageId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${options.botToken}` },
  })
  if (!response.ok && response.status !== 404) throw new DiscordApiError(response.status)
}
