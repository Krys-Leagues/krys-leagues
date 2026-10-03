import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createScorecardServiceClient } from "@/lib/scorecards/server"
import { buildMastersLiveStats, type MastersLiveStatsCard } from "@/lib/mastersLiveStats"

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const service = createScorecardServiceClient()
  const eventId = new URL(request.url).searchParams.get("eventId")
  let eventQuery = service.from("major_events").select("id,slug,name").eq("slug", "masters")
  if (eventId) eventQuery = eventQuery.eq("id", eventId)
  const eventResult = await eventQuery.maybeSingle()
  if (eventResult.error) return NextResponse.json({ error: eventResult.error.message }, { status: 500 })
  if (!eventResult.data) return NextResponse.json({ error: "Masters event not found" }, { status: 404 })
  const [daysResult, entriesResult] = await Promise.all([
    service.from("major_play_days").select("id,day_number").eq("major_event_id", eventResult.data.id),
    service.from("major_entries").select("id,player_id").eq("major_event_id", eventResult.data.id).in("status", ["registered", "confirmed"]),
  ])
  if (daysResult.error || entriesResult.error) return NextResponse.json({ error: daysResult.error?.message ?? entriesResult.error?.message }, { status: 500 })
  const days = (daysResult.data ?? []) as Array<{ id: string; day_number: 1 | 2 | 3 | 4 }>
  const entries = (entriesResult.data ?? []) as Array<{ id: string; player_id: string }>
  const dayIds = days.map((day) => day.id)
  const entryIds = entries.map((entry) => entry.id)
  const [slotsResult, choicesResult, cardsResult] = await Promise.all([
    dayIds.length ? service.from("major_time_slots").select("id,play_day_id,starts_at").in("play_day_id", dayIds) : Promise.resolve({ data: [], error: null }),
    entryIds.length ? service.from("major_entry_day_choices").select("entry_id,play_day_id,time_slot_id").in("entry_id", entryIds) : Promise.resolve({ data: [], error: null }),
    entryIds.length ? service.from("major_player_scorecards").select("id,entry_id,play_day_id,status,score_to_par").in("entry_id", entryIds).in("status", ["submitted", "verified"]) : Promise.resolve({ data: [], error: null }),
  ])
  if (slotsResult.error || choicesResult.error || cardsResult.error) return NextResponse.json({ error: slotsResult.error?.message ?? choicesResult.error?.message ?? cardsResult.error?.message }, { status: 500 })
  const cardsData = (cardsResult.data ?? []) as Array<{ id: string; entry_id: string; play_day_id: string; status: string; score_to_par: number | null }>
  const cardIds = cardsData.map((card) => card.id)
  const holesResult = cardIds.length ? await service.from("major_player_scorecard_holes").select("scorecard_id,hole_number,par,strokes").in("scorecard_id", cardIds) : { data: [], error: null }
  if (holesResult.error) return NextResponse.json({ error: holesResult.error.message }, { status: 500 })
  const playerIds = [...new Set(entries.map((entry) => entry.player_id))]
  const playersResult = playerIds.length ? await service.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
  if (playersResult.error) return NextResponse.json({ error: playersResult.error.message }, { status: 500 })
  const players = (playersResult.data ?? []) as Array<{ id: string; screen_name: string }>
  const nameByPlayerId = new Map(players.map((player) => [player.id, player.screen_name]))
  const entryRows = entries.map((entry) => ({ entryId: entry.id, playerId: entry.player_id, name: nameByPlayerId.get(entry.player_id) ?? "Unknown player" }))
  const holesByCard = new Map<string, { holeNumber: number; par: number; strokes: number }[]>()
  for (const hole of holesResult.data ?? []) holesByCard.set(hole.scorecard_id, [...(holesByCard.get(hole.scorecard_id) ?? []), { holeNumber: hole.hole_number, par: hole.par, strokes: hole.strokes }])
  const dayNumberById = new Map(days.map((day) => [day.id, day.day_number]))
  const cards: MastersLiveStatsCard[] = cardsData.map((card) => ({ entryId: card.entry_id, playDayId: card.play_day_id, dayNumber: dayNumberById.get(card.play_day_id) ?? 1, status: card.status as "submitted" | "verified", scoreToPar: card.score_to_par, holes: holesByCard.get(card.id) ?? [] }))
  const choices = (choicesResult.data ?? []) as Array<{ entry_id: string; play_day_id: string; time_slot_id: string }>
  const slots = (slotsResult.data ?? []) as Array<{ id: string; play_day_id: string; starts_at: string }>
  const stats = buildMastersLiveStats({ now: new Date(), cards, choices: choices.map((choice) => ({ entryId: choice.entry_id, playDayId: choice.play_day_id, timeSlotId: choice.time_slot_id })), timeSlots: slots.map((slot) => ({ id: slot.id, playDayId: slot.play_day_id, startsAt: slot.starts_at })), entries: entryRows })
  return NextResponse.json({ event: eventResult.data, generatedAt: new Date().toISOString(), stats }, { headers: { "Cache-Control": "no-store" } })
}
