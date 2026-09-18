import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  StrokeDiscordAssignmentSource,
  StrokeDiscordSnapshot,
  StrokeDiscordSource,
  StrokeDiscordStandingSource,
} from "./strokeDiscord"

const STROKE_DISCORD_CHANNELS = {
  1: "DISCORD_STROKE_D1_CHANNEL_ID",
  2: "DISCORD_STROKE_D2_CHANNEL_ID",
  3: "DISCORD_STROKE_D3_CHANNEL_ID",
  4: "DISCORD_STROKE_D4_CHANNEL_ID",
  5: "DISCORD_STROKE_D5_CHANNEL_ID",
} as const

const DISCORD_API_BASE = "https://discord.com/api/v10"

export type StrokeDiscordDivision = keyof typeof STROKE_DISCORD_CHANNELS

export function isStrokeDiscordDivision(value: unknown): value is StrokeDiscordDivision {
  return typeof value === "number" && Number.isInteger(value) && value in STROKE_DISCORD_CHANNELS
}

export function getStrokeDiscordBotToken() {
  return process.env.DISCORD_BOT_TOKEN?.trim() || null
}

export function getStrokeDiscordChannelId(divisionNumber: StrokeDiscordDivision) {
  const channelId = process.env[STROKE_DISCORD_CHANNELS[divisionNumber]]?.trim()
  return channelId && /^\d+$/.test(channelId) ? channelId : null
}

type SeasonRow = {
  id: string
  season_number: number
}

type RosterRow = {
  id: string
  season_id: string
  division_count: number
  created_at: string
}

type SlotRow = {
  division_number: number
  slot_number: number
  player_id: string
  player_screen_name: string | null
}

type FixtureRow = {
  id: string
  division_number: number
  game_number: number
  player1_id: string
  player2_id: string
  player1_name: string | null
  player2_name: string | null
  course: string | null
}

type ResultRow = {
  schedule_id: string
  player1_score: number | null
  player2_score: number | null
}

type StandingRow = {
  player_id: string
  division: string
  rank: number | null
  wins: number | null
  losses: number | null
  ties: number | null
  points: number | null
  strokes: number | null
}

type PlayerRow = {
  id: string
  screen_name: string
}

export async function loadCurrentStrokeDiscordSource(
  supabase: SupabaseClient,
): Promise<StrokeDiscordSource> {
  const { data: seasonData, error: seasonError } = await supabase
    .from("seasons")
    .select("id, season_number")
    .eq("league_type", "stroke")
    .is("division", null)
    .order("is_active", { ascending: false })
    .order("season_number", { ascending: false })

  if (seasonError) throw new Error("STROKE_DISCORD_SEASONS_FAILED")
  const seasons = (seasonData || []) as SeasonRow[]
  if (seasons.length === 0) throw new Error("STROKE_DISCORD_CURRENT_SEASON_UNAVAILABLE")

  const { data: rosterData, error: rosterError } = await supabase
    .from("stroke_roster_versions")
    .select("id, season_id, division_count, created_at")
    .in("season_id", seasons.map((season) => season.id))
    .eq("status", "approved")
    .order("created_at", { ascending: false })

  if (rosterError) throw new Error("STROKE_DISCORD_ROSTERS_FAILED")
  const rosters = (rosterData || []) as RosterRow[]
  const season = seasons.find((candidate) => rosters.some((roster) => roster.season_id === candidate.id))
  const roster = season
    ? rosters.find((candidate) => candidate.season_id === season.id) || null
    : null
  if (!season || !roster) throw new Error("STROKE_DISCORD_CURRENT_ROSTER_UNAVAILABLE")

  const [{ data: slotData, error: slotError }, { data: fixtureData, error: fixtureError }, { data: standingData, error: standingError }] = await Promise.all([
    supabase
      .from("stroke_division_roster_slots")
      .select("division_number, slot_number, player_id, player_screen_name")
      .eq("roster_version_id", roster.id)
      .not("player_id", "is", null)
      .order("division_number", { ascending: true })
      .order("slot_number", { ascending: true }),
    supabase
      .from("schedule")
      .select("id, division_number, game_number, player1_id, player2_id, player1_name, player2_name, course")
      .eq("league_type", "stroke")
      .eq("season_id", season.id)
      .eq("roster_version_id", roster.id)
      .not("division_number", "is", null)
      .not("game_number", "is", null)
      .order("division_number", { ascending: true })
      .order("game_number", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("season_standings")
      .select("player_id, division, rank, wins, losses, ties, points, strokes")
      .eq("league_type", "stroke")
      .eq("season_number", season.season_number),
  ])

  if (slotError) throw new Error("STROKE_DISCORD_ROSTER_SLOTS_FAILED")
  if (fixtureError) throw new Error("STROKE_DISCORD_FIXTURES_FAILED")
  if (standingError) throw new Error("STROKE_DISCORD_STANDINGS_FAILED")

  const slots = (slotData || []) as SlotRow[]
  const fixtures = (fixtureData || []) as FixtureRow[]
  const standings = (standingData || []) as StandingRow[]
  const fixtureIds = fixtures.map((fixture) => fixture.id)

  const { data: resultData, error: resultError } = fixtureIds.length > 0
    ? await supabase
        .from("results")
        .select("schedule_id, player1_score, player2_score")
        .eq("league_type", "stroke")
        .in("schedule_id", fixtureIds)
    : { data: [], error: null }
  if (resultError) throw new Error("STROKE_DISCORD_RESULTS_FAILED")

  const playerIds = Array.from(new Set([
    ...slots.map((slot) => slot.player_id),
    ...fixtures.flatMap((fixture) => [fixture.player1_id, fixture.player2_id]),
  ].filter(Boolean)))
  const { data: playerData, error: playerError } = playerIds.length > 0
    ? await supabase.from("players").select("id, screen_name").in("id", playerIds)
    : { data: [], error: null }
  if (playerError) throw new Error("STROKE_DISCORD_PLAYER_NAMES_FAILED")

  const playersById = new Map(((playerData || []) as PlayerRow[]).map((player) => [player.id, player.screen_name]))
  const standingsByPlayer = new Map(standings.map((standing) => [standing.player_id, standing]))
  const resultsBySchedule = new Map(((resultData || []) as ResultRow[]).map((result) => [result.schedule_id, result]))

  const standingRows: StrokeDiscordStandingSource[] = slots.map((slot) => {
    const standing = standingsByPlayer.get(slot.player_id)
    return {
      division_number: slot.division_number,
      slot_number: slot.slot_number,
      player_screen_name: playersById.get(slot.player_id) || slot.player_screen_name || "Player unavailable",
      rank: standing?.division === `Stroke D${slot.division_number}` ? standing.rank : null,
      wins: Number(standing?.wins || 0),
      losses: Number(standing?.losses || 0),
      ties: Number(standing?.ties || 0),
      points: Number(standing?.points || 0),
      strokes: Number(standing?.strokes || 0),
    }
  })

  const assignmentRows: StrokeDiscordAssignmentSource[] = fixtures.map((fixture) => {
    const result = resultsBySchedule.get(fixture.id)
    return {
      division_number: fixture.division_number,
      game_number: fixture.game_number,
      player1_display_name: playersById.get(fixture.player1_id) || fixture.player1_name || "Player 1",
      player2_display_name: playersById.get(fixture.player2_id) || fixture.player2_name || "Player 2",
      course: fixture.course,
      player1_score: result?.player1_score ?? null,
      player2_score: result?.player2_score ?? null,
    }
  })

  return {
    season_number: season.season_number,
    division_count: roster.division_count,
    standings: standingRows,
    assignments: assignmentRows,
  }
}

export async function postStrokeDivisionImage(options: {
  botToken: string
  channelId: string
  snapshot: StrokeDiscordSnapshot
  png: ArrayBuffer
}) {
  const reminder = options.snapshot.mode === "reminder"
  const label = reminder ? "Game Reminder" : "Division Update"
  const filename = `stroke-season-${options.snapshot.season_number}-division-${options.snapshot.division_number}-${reminder ? "reminder" : "update"}.png`
  const form = new FormData()
  form.append("payload_json", JSON.stringify({
    content: `Stroke Season ${options.snapshot.season_number} — Division ${options.snapshot.division_number} — ${label}`,
    allowed_mentions: { parse: [] },
    attachments: [{
      id: 0,
      filename,
      description: reminder
        ? `Stroke Division ${options.snapshot.division_number} remaining game assignments`
        : `Stroke Division ${options.snapshot.division_number} assignments, results, and standings`,
    }],
  }))
  form.append("files[0]", new Blob([options.png], { type: "image/png" }), filename)

  const response = await fetch(
    `${DISCORD_API_BASE}/channels/${encodeURIComponent(options.channelId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bot ${options.botToken}` },
      body: form,
    },
  )
  if (!response.ok) throw new Error(`Discord returned status ${response.status}.`)

  const body = await response.json().catch(() => null)
  return typeof body?.id === "string" ? body.id : null
}
