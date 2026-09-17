import "server-only"

import type { MatchDiscordSnapshot } from "./matchDiscord"

const MATCH_DISCORD_WEBHOOKS = {
  1: "DISCORD_WEBHOOK_MATCH_D1",
  2: "DISCORD_WEBHOOK_MATCH_D2",
  3: "DISCORD_WEBHOOK_MATCH_D3",
  4: "DISCORD_WEBHOOK_MATCH_D4",
  5: "DISCORD_WEBHOOK_MATCH_D5",
} as const

export type MatchDiscordDivision = keyof typeof MATCH_DISCORD_WEBHOOKS

export function isMatchDiscordDivision(value: unknown): value is MatchDiscordDivision {
  return typeof value === "number" && Number.isInteger(value) && value in MATCH_DISCORD_WEBHOOKS
}

export function getMatchDiscordWebhookUrl(divisionNumber: MatchDiscordDivision) {
  return process.env[MATCH_DISCORD_WEBHOOKS[divisionNumber]]?.trim() || null
}

export async function postMatchDivisionImage(options: {
  webhookUrl: string
  snapshot: MatchDiscordSnapshot
  png: ArrayBuffer
}) {
  const requestUrl = new URL(options.webhookUrl)
  requestUrl.searchParams.set("wait", "true")

  const form = new FormData()
  form.append("payload_json", JSON.stringify({
    username: "Krys League Bot",
    content: `Match Division ${options.snapshot.division_number} · Season ${options.snapshot.season_number}`,
  }))
  form.append(
    "files[0]",
    new Blob([options.png], { type: "image/png" }),
    `match-season-${options.snapshot.season_number}-division-${options.snapshot.division_number}.png`,
  )

  const response = await fetch(requestUrl, { method: "POST", body: form })
  if (!response.ok) {
    throw new Error(`Discord returned status ${response.status}.`)
  }

  const body = await response.json().catch(() => null)
  return typeof body?.id === "string" ? body.id : null
}
