import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { resolveMastersVerificationContext, syncMastersVerificationDiscordRoom } from "@/lib/mastersDiscordServer"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

type Entry = { id: string; player_id: string; player_screen_name_snapshot: string; status: string }
type Day = { id: string; day_number: 1 | 2 | 3 | 4; play_date: string; scoring_finalized_at: string | null }
type Group = { id: string; play_day_id: string; time_slot_id: string; group_label: string; is_published: boolean }
type Member = { group_id: string; play_day_id: string; entry_id: string }
type Slot = { id: string; starts_at: string }
type Scorecard = { id: string; entry_id: string; play_day_id: string; status: string; major_player_scorecard_holes?: Array<{ hole_number: number; par: number; strokes: number }> }
type Reopen = { entry_id: string; play_day_id: string; expires_at: string | null }

async function actorContext(user: { id: string; user_metadata?: Record<string, unknown> }) {
  const service = createScorecardServiceClient()
  const providerId = [user.user_metadata?.provider_id, user.user_metadata?.sub]
    .find((value): value is string => typeof value === "string" && /^\d+$/.test(value))
  if (!providerId) return { service, actorPlayerId: null, actorName: "Authorized site admin" }
  const players = await service.from("players").select("id,screen_name").eq("discord_id", providerId).limit(2)
  if (players.error) throw new Error(players.error.message)
  if (players.data.length !== 1) return { service, actorPlayerId: null, actorName: "Authorized site admin" }
  return { service, actorPlayerId: players.data[0].id as string, actorName: players.data[0].screen_name as string }
}

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const eventId = new URL(request.url).searchParams.get("eventId") || ""
  if (!UUID.test(eventId)) return response({ error: "A valid Masters event is required." }, 400)

  const { service } = await actorContext(authorization.user)
  const [eventResult, entriesResult, daysResult, groupsResult, membersResult, scorecardsResult, reopensResult] = await Promise.all([
    service.from("major_events").select("id,name,slug,schedule_timezone").eq("id", eventId).maybeSingle(),
    service.from("major_entries").select("id,player_id,player_screen_name_snapshot,status").eq("major_event_id", eventId).in("status", ["registered", "confirmed"]).order("player_screen_name_snapshot"),
    service.from("major_play_days").select("id,day_number,play_date,scoring_finalized_at").eq("major_event_id", eventId).order("day_number"),
    service.from("major_schedule_groups").select("id,play_day_id,time_slot_id,group_label,is_published").eq("major_event_id", eventId).eq("is_published", true),
    service.from("major_schedule_group_members").select("group_id,play_day_id,entry_id").eq("major_event_id", eventId),
    service.from("major_player_scorecards").select("id,entry_id,play_day_id,status,major_player_scorecard_holes(hole_number,par,strokes)").eq("major_event_id", eventId),
    service.from("major_score_entry_admin_actions").select("entry_id,play_day_id,expires_at").eq("major_event_id", eventId).eq("action", "admin_score_entry_reopen").order("created_at", { ascending: false }),
  ])
  const error = eventResult.error || entriesResult.error || daysResult.error || groupsResult.error || membersResult.error || scorecardsResult.error || reopensResult.error
  if (error) return response({ error: error.message }, 500)
  if (!eventResult.data) return response({ error: "Masters event not found." }, 404)
  if (eventResult.data.slug !== "masters") return response({ error: "This tool is restricted to the Masters event." }, 400)

  const entries = (entriesResult.data || []) as Entry[]
  const days = (daysResult.data || []) as Day[]
  const groups = (groupsResult.data || []) as Group[]
  const members = (membersResult.data || []) as Member[]
  const scorecards = (scorecardsResult.data || []) as Scorecard[]
  const reopens = (reopensResult.data || []) as Reopen[]
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const groupMembers = new Map<string, Member[]>()
  for (const member of members) groupMembers.set(member.group_id, [...(groupMembers.get(member.group_id) || []), member])
  const completeGroups = groups.filter((group) => {
    const activeCount = (groupMembers.get(group.id) || []).filter((member) => entryById.has(member.entry_id)).length
    return activeCount >= 2 && activeCount <= 4
  })
  const slotIds = [...new Set(completeGroups.map((group) => group.time_slot_id))]
  const slotsResult = slotIds.length
    ? await service.from("major_time_slots").select("id,starts_at").in("id", slotIds)
    : { data: [] as Slot[], error: null }
  if (slotsResult.error) return response({ error: slotsResult.error.message }, 500)
  const slots = (slotsResult.data || []) as Slot[]
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const closeByDay = new Map<string, string>()
  for (const day of days) {
    const starts = completeGroups
      .filter((group) => group.play_day_id === day.id)
      .map((group) => slotById.get(group.time_slot_id)?.starts_at)
      .filter((value): value is string => Boolean(value))
    if (starts.length) closeByDay.set(day.id, new Date(Math.max(...starts.map(Date.parse)) + 3 * 60 * 60_000).toISOString())
  }
  const scorecardByScope = new Map(scorecards.map((card) => [`${card.entry_id}:${card.play_day_id}`, card]))
  const reopenByScope = new Map<string, Reopen>()
  for (const reopen of reopens) {
    const key = `${reopen.entry_id}:${reopen.play_day_id}`
    if (!reopenByScope.has(key)) reopenByScope.set(key, reopen)
  }

  const rows = completeGroups.flatMap((group) => {
    const day = days.find((candidate) => candidate.id === group.play_day_id)
    const slot = slotById.get(group.time_slot_id)
    const closesAt = closeByDay.get(group.play_day_id)
    if (!day || !slot || !closesAt) return []
    return (groupMembers.get(group.id) || []).flatMap((member) => {
      const entry = entryById.get(member.entry_id)
      if (!entry) return []
      const key = `${entry.id}:${day.id}`
      const card = scorecardByScope.get(key)
      return [{
        eventId,
        entryId: entry.id,
        playerId: entry.player_id,
        playerName: entry.player_screen_name_snapshot,
        playDayId: day.id,
        dayNumber: day.day_number,
        playDate: day.play_date,
        roomId: group.id,
        roomLabel: group.group_label,
        scheduledAt: slot.starts_at,
        normalClosesAt: closesAt,
        scoringFinalizedAt: day.scoring_finalized_at,
        scorecardId: card?.id || null,
        scorecardStatus: card?.status || null,
        holes: card?.major_player_scorecard_holes || [],
        reopenedUntil: reopenByScope.get(key)?.expires_at || null,
      }]
    })
  }).toSorted((left, right) => left.playerName.localeCompare(right.playerName) || left.dayNumber - right.dayNumber)

  return response({ event: eventResult.data, rows })
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as null | Record<string, unknown>
  const action = body?.action === "reopen" || body?.action === "admin_entry" ? body.action : ""
  const eventId = typeof body?.eventId === "string" ? body.eventId : ""
  const playDayId = typeof body?.playDayId === "string" ? body.playDayId : ""
  const entryId = typeof body?.entryId === "string" ? body.entryId : ""
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (!action || ![eventId, playDayId, entryId].every((value) => UUID.test(value)) || reason.length > 1000) {
    return response({ error: "A valid player, round, and late-score action are required." }, 400)
  }

  const { service, actorPlayerId, actorName } = await actorContext(authorization.user)
  if (action === "reopen") {
    const result = await service.rpc("admin_reopen_major_score_entry_service", {
      p_major_event_id: eventId,
      p_play_day_id: playDayId,
      p_entry_id: entryId,
      p_actor_user_id: authorization.user.id,
      p_actor_player_id: actorPlayerId,
      p_actor_screen_name: actorName,
      p_reason: reason || null,
    })
    if (result.error) return response({ error: result.error.message }, 409)
    return response({ reopenedUntil: result.data })
  }

  const holes = Array.isArray(body?.holes) ? body.holes : []
  if (holes.length !== 18) return response({ error: "Enter all 18 hole scores." }, 400)
  const result = await service.rpc("admin_submit_major_scorecard_service", {
    p_major_event_id: eventId,
    p_play_day_id: playDayId,
    p_entry_id: entryId,
    p_holes: holes,
    p_actor_user_id: authorization.user.id,
    p_actor_player_id: actorPlayerId,
    p_actor_screen_name: actorName,
    p_reason: reason || null,
  })
  if (result.error) return response({ error: result.error.message }, 409)

  const scorecardId = String(result.data)
  try {
    const context = await resolveMastersVerificationContext(service, scorecardId)
    const sync = await syncMastersVerificationDiscordRoom({ service, context })
    return response({ scorecardId, verificationAlert: sync.status || sync.reason })
  } catch (caught) {
    return response({
      scorecardId,
      verificationAlert: "failed",
      warning: caught instanceof Error ? caught.message : "The score was submitted, but the Discord verification alert needs retrying.",
    })
  }
}
