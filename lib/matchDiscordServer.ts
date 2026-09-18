import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  MatchDiscordAssignmentResult,
  MatchDiscordSnapshot,
} from "./matchDiscord"

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

type ManagedSeasonRow = { id: string }
type ManagedRosterRow = {
  id: string
  status: "approved" | "locked"
  created_at: string
}
type ManagedFixtureRow = {
  id: string
  division_number: number
  game_number: number
  player1_name: string | null
  player2_name: string | null
  course: string | null
}
type ManagedResultRow = {
  schedule_id: string
  player1_hw: number | null
  player2_hw: number | null
}

export async function loadMatchDiscordAssignmentResults(options: {
  supabase: SupabaseClient
  seasonNumber: number
  divisionNumber: MatchDiscordDivision
}): Promise<MatchDiscordAssignmentResult[]> {
  const { data: seasonData, error: seasonError } = await options.supabase
    .from("seasons")
    .select("id")
    .eq("league_type", "match")
    .eq("season_number", options.seasonNumber)
    .is("division", null)
    .limit(1)

  const season = (seasonData?.[0] || null) as ManagedSeasonRow | null
  if (seasonError || !season) throw new Error("MATCH_DISCORD_MANAGED_SEASON_FAILED")

  const { data: rosterData, error: rosterError } = await options.supabase
    .from("match_roster_versions")
    .select("id, status, created_at")
    .eq("season_id", season.id)
    .in("status", ["approved", "locked"])
    .order("created_at", { ascending: false })

  if (rosterError) throw new Error("MATCH_DISCORD_MANAGED_ROSTER_FAILED")
  const roster = ([...(rosterData || [])] as ManagedRosterRow[]).sort((left, right) => {
    const leftPriority = left.status === "approved" ? 0 : 1
    const rightPriority = right.status === "approved" ? 0 : 1
    return leftPriority - rightPriority || right.created_at.localeCompare(left.created_at)
  })[0]
  if (!roster) throw new Error("MATCH_DISCORD_MANAGED_ROSTER_FAILED")

  const { data: fixtureData, error: fixtureError } = await options.supabase
    .from("schedule")
    .select("id, division_number, game_number, player1_name, player2_name, course")
    .eq("league_type", "match")
    .eq("season_id", season.id)
    .eq("match_roster_version_id", roster.id)
    .eq("division_number", options.divisionNumber)
    .not("game_number", "is", null)
    .order("game_number", { ascending: true })
    .order("id", { ascending: true })

  if (fixtureError) throw new Error("MATCH_DISCORD_MANAGED_FIXTURES_FAILED")
  const fixtures = (fixtureData || []) as ManagedFixtureRow[]
  if (fixtures.length === 0) return []

  const { data: resultData, error: resultError } = await options.supabase
    .from("results")
    .select("schedule_id, player1_hw, player2_hw")
    .eq("league_type", "match")
    .in("schedule_id", fixtures.map((fixture) => fixture.id))

  if (resultError) throw new Error("MATCH_DISCORD_MANAGED_RESULTS_FAILED")
  const resultsBySchedule = new Map(
    ((resultData || []) as ManagedResultRow[]).map((result) => [result.schedule_id, result]),
  )

  return fixtures.map((fixture) => {
    const result = resultsBySchedule.get(fixture.id)
    return {
      division_number: fixture.division_number,
      game_number: fixture.game_number,
      player1_display_name: fixture.player1_name,
      player2_display_name: fixture.player2_name,
      course: fixture.course,
      player1_holes_won: result?.player1_hw ?? null,
      player2_holes_won: result?.player2_hw ?? null,
    }
  })
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
