import "server-only"

import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createTournamentDiscordAdapter } from "@/lib/tournaments/discordServer"
import { isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type MatchRow = { id: string; tournament_id: string; player_a_id: string | null; player_b_id: string | null; status: string; winner_player_id: string | null }
type PlayerRow = { id: string; screen_name: string; discord_id: string | null }

function text(value: unknown) { return typeof value === "string" ? value.trim() : "" }

function failure(error: unknown) {
  const detail = error as { code?: string; message?: string } | null
  return NextResponse.json({ error: isMissingTournamentSchema(detail) ? "Tournament Builder schema is not installed in this environment." : error instanceof Error ? error.message : "Tournament Discord operation failed." }, { status: 503 })
}

async function loadMatch(client: ReturnType<typeof trustedTournamentClient>, matchId: string) {
  const result = await client.from("tournament_matches").select("id,tournament_id,player_a_id,player_b_id,status,winner_player_id").eq("id", matchId).maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error("Match was not found")
  return result.data as MatchRow
}

async function loadPlayers(client: ReturnType<typeof trustedTournamentClient>, match: MatchRow) {
  const ids = [match.player_a_id, match.player_b_id].filter((id): id is string => Boolean(id))
  if (ids.length !== 2) throw new Error("Both match participants must be assigned before Discord operations")
  const result = await client.from("players").select("id,screen_name,discord_id").in("id", ids)
  if (result.error) throw result.error
  const players = (result.data || []) as PlayerRow[]
  if (players.length !== 2 || players.some((player) => !/^\d+$/.test(player.discord_id || ""))) throw new Error("Both match participants need verified Discord identities before Discord operations")
  return players
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as { action?: unknown; matchId?: unknown; body?: unknown; reminderKind?: unknown; threadId?: unknown } | null
  const action = text(body?.action)
  const matchId = text(body?.matchId)
  if (!matchId || !["create_thread", "appointment_update", "reminder", "cleanup"].includes(action)) return NextResponse.json({ error: "A valid tournament Discord action and match ID are required." }, { status: 400 })

  try {
    const client = trustedTournamentClient()
    const match = await loadMatch(client, matchId)
    const adapter = createTournamentDiscordAdapter()

    if (action === "create_thread") {
      const existing = await client.from("tournament_discord_threads").select("id,discord_thread_id,status").eq("match_id", matchId).in("status", ["active", "cleanup_pending"]).maybeSingle()
      if (existing.error) throw existing.error
      if (existing.data) return NextResponse.json({ status: "already_exists", threadId: existing.data.discord_thread_id })
      const players = await loadPlayers(client, match)
      const tournament = await client.from("tournaments").select("name").eq("id", match.tournament_id).maybeSingle()
      if (tournament.error) throw tournament.error
      const origin = new URL(request.url).origin
      const customBody = text(body?.body)
      const instructions = `${customBody || `Tournament match for ${players[0].screen_name} vs ${players[1].screen_name}.`}\n\nALL OFFICIAL MATCH SCHEDULING MUST BE DONE ON KRYSLEAGUES.COM.\nMatch Center: ${origin}/tournaments/matches/${encodeURIComponent(matchId)}\nTournament: ${tournament.data?.name || "Krys Leagues tournament"}`
      const result = await adapter.createPrivateThread({ matchId, playerIds: players.map((player) => player.discord_id as string), body: instructions })
      if (result.status !== "sent" || !result.id) return NextResponse.json({ error: result.reason || "Discord thread was not created.", status: result.status }, { status: result.status === "not_configured" ? 503 : 502 })
      const saved = await client.from("tournament_discord_threads").insert({ match_id: matchId, discord_thread_id: result.id, status: "active" }).select("id,discord_thread_id,status").single()
      if (saved.error) {
        await adapter.deleteThread(result.id)
        throw saved.error
      }
      return NextResponse.json({ thread: saved.data }, { status: 201 })
    }

    const thread = await client.from("tournament_discord_threads").select("id,discord_thread_id,status").eq("match_id", matchId).in("status", ["active", "cleanup_pending"]).maybeSingle()
    if (thread.error) throw thread.error
    if (!thread.data) return NextResponse.json({ error: "No active private match thread exists." }, { status: 404 })

    if (action === "appointment_update") {
      const message = text(body?.body)
      if (!message) return NextResponse.json({ error: "A confirmed appointment message is required." }, { status: 400 })
      const result = await adapter.sendThreadMessage({ threadId: thread.data.discord_thread_id, body: `${message}\n\nMatch Center remains the official scheduling record.` })
      return result.status === "sent" ? NextResponse.json({ status: "sent" }) : NextResponse.json({ error: result.reason, status: result.status }, { status: 502 })
    }

    if (action === "reminder") {
      const kind = text(body?.reminderKind)
      if (!["player_1", "player_2", "both"].includes(kind)) return NextResponse.json({ error: "Reminder kind must be player_1, player_2, or both." }, { status: 400 })
      const players = await loadPlayers(client, match)
      const recipients = kind === "player_1" ? [players[0]] : kind === "player_2" ? [players[1]] : players
      const message = text(body?.body) || `Reminder: your Krys Leagues match is waiting. Match Center: ${new URL(request.url).origin}/tournaments/matches/${encodeURIComponent(matchId)}`
      const result = await adapter.sendReminder({ matchId, playerIds: recipients.map((player) => player.discord_id as string), body: message })
      await client.from("tournament_reminder_attempts").insert(recipients.map((player) => ({ match_id: matchId, recipient_player_id: player.id, reminder_kind: kind, outcome: result.status === "sent" ? "sent" : "failed", failure_reason: result.status === "sent" ? null : result.reason || "Discord reminder failed", sent_by: authorization.user.id })))
      return result.status === "sent" ? NextResponse.json({ status: "sent" }) : NextResponse.json({ error: result.reason, status: result.status }, { status: 502 })
    }

    if (match.status !== "completed" || !match.winner_player_id) return NextResponse.json({ error: "A match thread can only be deleted after verified winner advancement." }, { status: 409 })
    const result = await adapter.deleteThread(thread.data.discord_thread_id)
    if (result.status !== "sent") {
      await client.from("tournament_discord_threads").update({ status: "failed_cleanup" }).eq("id", thread.data.id)
      return NextResponse.json({ error: result.reason, status: result.status }, { status: 502 })
    }
    await client.from("tournament_discord_threads").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", thread.data.id)
    return NextResponse.json({ status: "deleted" })
  } catch (error) {
    return failure(error)
  }
}
