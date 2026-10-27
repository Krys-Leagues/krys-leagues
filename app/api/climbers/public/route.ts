import { createClient } from "@supabase/supabase-js"

type PublicEvent = {
  id: string
  season_id: string
  player_id: string
  points: number
  created_at: string
  voided_at: string | null
  player: { id: string; screen_name: string | null } | Array<{ id: string; screen_name: string | null }> | null
}

type PublicSeason = {
  id: string
  label: string
  starts_at: string
  ends_at: string
  status: "upcoming" | "active" | "awaiting_finalization" | "finalized"
}

function publicClimbersClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Public Climbers server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function buildStandings(season: PublicSeason, events: PublicEvent[]) {
  const totals = new Map<string, { player_id: string; screen_name: string; points: number; event_count: number }>()
  for (const event of events.filter((item) => item.season_id === season.id && !item.voided_at)) {
    const relatedPlayer = Array.isArray(event.player) ? event.player[0] : event.player
    const current = totals.get(event.player_id) ?? {
      player_id: event.player_id,
      screen_name: relatedPlayer?.screen_name || "Unknown canonical player",
      points: 0,
      event_count: 0,
    }
    current.points += event.points
    current.event_count += 1
    totals.set(event.player_id, current)
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || a.screen_name.localeCompare(b.screen_name))
}

export async function GET() {
  try {
    const supabase = publicClimbersClient()
    const [seasonsResult, eventsResult] = await Promise.all([
      supabase.from("climbers_seasons").select("id,label,starts_at,ends_at,status").order("starts_at", { ascending: false }),
      supabase.from("climbers_events").select("id,season_id,player_id,points,created_at,voided_at,player:players!climbers_events_player_id_fkey(id,screen_name)").order("created_at", { ascending: true }),
    ])
    if (seasonsResult.error) throw seasonsResult.error
    if (eventsResult.error) throw eventsResult.error

    const seasons = (seasonsResult.data ?? []) as PublicSeason[]
    const events = (eventsResult.data ?? []) as PublicEvent[]
    const enriched = seasons.map((season) => {
      const standings = buildStandings(season, events)
      const winnerPoints = season.status === "finalized" ? standings[0]?.points ?? null : null
      return {
        ...season,
        standings,
        winner_names: winnerPoints === null ? [] : standings.filter((row) => row.points === winnerPoints).map((row) => row.screen_name),
      }
    })
    const current = enriched.find((season) => season.status === "active") ?? enriched.find((season) => season.status === "awaiting_finalization") ?? enriched[0] ?? null
    return Response.json({ current_season_id: current?.id ?? null, seasons: enriched }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
  } catch (caught) {
    console.error("[public-climbers] read failed", caught)
    const message = caught instanceof Error ? caught.message : "Public Climbers could not be loaded."
    return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
