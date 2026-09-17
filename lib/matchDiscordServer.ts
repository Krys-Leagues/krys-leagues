import "server-only"

import type { MatchDiscordSnapshot } from "./matchDiscord"

const MATCH_DISCORD_CHANNELS = {
  1: "DISCORD_MATCH_D1_CHANNEL_ID",
  2: "DISCORD_MATCH_D2_CHANNEL_ID",
  3: "DISCORD_MATCH_D3_CHANNEL_ID",
  4: "DISCORD_MATCH_D4_CHANNEL_ID",
  5: "DISCORD_MATCH_D5_CHANNEL_ID",
} as const

const DISCORD_API_BASE = "https://discord.com/api/v10"

export type MatchDiscordDivision = keyof typeof MATCH_DISCORD_CHANNELS

export function isMatchDiscordDivision(value: unknown): value is MatchDiscordDivision {
  return typeof value === "number" && Number.isInteger(value) && value in MATCH_DISCORD_CHANNELS
}

export function getDiscordBotToken() {
  return process.env.DISCORD_BOT_TOKEN?.trim() || null
}

export function getMatchDiscordChannelId(divisionNumber: MatchDiscordDivision) {
  const channelId = process.env[MATCH_DISCORD_CHANNELS[divisionNumber]]?.trim()
  return channelId && /^\d+$/.test(channelId) ? channelId : null
}

export async function postMatchDivisionImage(options: {
  botToken: string
  channelId: string
  snapshot: MatchDiscordSnapshot
  png: ArrayBuffer
}) {
  const form = new FormData()
  form.append("payload_json", JSON.stringify({
    content: `Match Season ${options.snapshot.season_number} — Division ${options.snapshot.division_number}`,
    allowed_mentions: { parse: [] },
    attachments: [{
      id: 0,
      filename: `match-season-${options.snapshot.season_number}-division-${options.snapshot.division_number}.png`,
      description: `Match Division ${options.snapshot.division_number} course assignments and current standings`,
    }],
  }))
  form.append(
    "files[0]",
    new Blob([options.png], { type: "image/png" }),
    `match-season-${options.snapshot.season_number}-division-${options.snapshot.division_number}.png`,
  )

  const response = await fetch(
    `${DISCORD_API_BASE}/channels/${encodeURIComponent(options.channelId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bot ${options.botToken}` },
      body: form,
    },
  )
  if (!response.ok) {
    throw new Error(`Discord returned status ${response.status}.`)
  }

  const body = await response.json().catch(() => null)
  return typeof body?.id === "string" ? body.id : null
}
