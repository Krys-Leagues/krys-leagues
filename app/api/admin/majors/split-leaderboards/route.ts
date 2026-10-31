import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { buildMastersSplitLeaderboards, type MastersSplitPlayer, type MastersSplitRoundNumber } from "@/lib/mastersSplitLeaderboards"

export const runtime = "nodejs"

type Hole = { hole_number: number; par: number; strokes: number }
type Scorecard = {
  entry_id: string
  play_day_id: string
  player_id: string
  player_screen_name_snapshot: string
  status: string
  major_player_scorecard_holes?: Hole[] | null
}

const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

function blankRounds(): MastersSplitPlayer["rounds"] {
  return {
    1: { score: null, status: null },
    2: { score: null, status: null },
    3: { score: null, status: null },
    4: { score: null, status: null },
  }
}

function scoreToPar(holes: Hole[] | null | undefined) {
  if (!holes || holes.length !== 18) return null
  return holes.reduce((total, hole) => total + hole.strokes - hole.par, 0)
}

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const service = createScorecardServiceClient()
  const eventResult = await service.from("major_events").select("id,slug,name,year").eq("slug", "masters").maybeSingle()
  if (eventResult.error) return response({ error: eventResult.error.message }, 500)
  if (!eventResult.data) return response({ error: "Masters event not found." }, 404)

  const [entriesResult, daysResult, cardsResult] = await Promise.all([
    service.from("major_entries").select("id,player_id,player_screen_name_snapshot,status").eq("major_event_id", eventResult.data.id).in("status", ["registered", "confirmed", "withdrawn"]),
    service.from("major_play_days").select("id,day_number").eq("major_event_id", eventResult.data.id).order("day_number"),
    service.from("major_player_scorecards").select("entry_id,play_day_id,player_id,player_screen_name_snapshot,status,major_player_scorecard_holes(hole_number,par,strokes)").eq("major_event_id", eventResult.data.id).in("status", ["submitted", "verified"]),
  ])
  const queryError = entriesResult.error || daysResult.error || cardsResult.error
  if (queryError) return response({ error: queryError.message }, 500)

  const dayNumberById = new Map((daysResult.data || []).map((day) => [day.id, day.day_number as MastersSplitRoundNumber]))
  const players = new Map<string, MastersSplitPlayer>()
  for (const entry of entriesResult.data || []) {
    players.set(entry.id, {
      entryId: entry.id,
      playerId: entry.player_id,
      name: entry.player_screen_name_snapshot,
      entryStatus: entry.status,
      rounds: blankRounds(),
    })
  }

  for (const card of (cardsResult.data || []) as Scorecard[]) {
    const dayNumber = dayNumberById.get(card.play_day_id)
    if (!dayNumber) continue
    const current = players.get(card.entry_id) || {
      entryId: card.entry_id,
      playerId: card.player_id,
      name: card.player_screen_name_snapshot,
      entryStatus: null,
      rounds: blankRounds(),
    }
    const score = scoreToPar(card.major_player_scorecard_holes)
    const existing = current.rounds[dayNumber]
    if (existing.score === null || card.status === "verified") {
      current.rounds[dayNumber] = { score, status: card.status }
    }
    current.name = card.player_screen_name_snapshot
    current.playerId = card.player_id
    players.set(card.entry_id, current)
  }

  const leaderboards = buildMastersSplitLeaderboards([...players.values()])
  return response({
    event: eventResult.data,
    ...leaderboards,
    generatedAt: new Date().toISOString(),
  })
}
