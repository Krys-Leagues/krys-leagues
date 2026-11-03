import "server-only"

import { NextResponse } from "next/server"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { trustedTournamentClient } from "@/lib/tournaments/server"
import { createTournamentDiscordAdapter } from "@/lib/tournaments/discordServer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TOURNAMENT_ID = "061208d4-1374-40f5-a56e-e1e3aa5f6159"
const TOURNAMENT_SLUG = "5-4-3-2-1"
const STANDALONE_ORIGIN = "https://54321.krysleagues.com"
const ADMIN_SCREEN_NAMES = ["PRINCESS_BANKSHOT", "TRICKYDICKY", "DawnSophia (Spicy)", "lynniebodd"] as const

type Authorization = { authorized: true; supabase: SupabaseClient; user: User } | { authorized: false; response: Response }
type MatchRow = { id: string; tournament_id: string; round_number: number; match_number: number; player_a_id: string | null; player_b_id: string | null }
type PlayerRow = { id: string; screen_name: string; discord_id: string | null }

function text(value: unknown) { return typeof value === "string" ? value.trim() : "" }

async function authorizeBridge(request: Request): Promise<Authorization> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!bearer) return authorizeSiteAdminMutation()
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${bearer}` } } })
  const { data, error } = await client.auth.getUser(bearer)
  if (error || !data.user) return { authorized: false, response: NextResponse.json({ authorized: false, error: "authentication_required" }, { status: 401 }) }
  const { data: siteAdmin, error: authorizationError } = await client.rpc("is_current_user_site_admin")
  if (authorizationError) return { authorized: false, response: NextResponse.json({ authorized: false, error: "authorization_check_failed" }, { status: 503 }) }
  if (!siteAdmin) return { authorized: false, response: NextResponse.json({ authorized: false, error: "site_admin_required" }, { status: 403 }) }
  return { authorized: true, supabase: client, user: data.user }
}

async function loadConfirmedRoster(client: ReturnType<typeof trustedTournamentClient>) {
  const registrations = await client.from("tournament_registrations").select("player_id").eq("tournament_id", TOURNAMENT_ID).eq("status", "confirmed").is("withdrawn_at", null)
  if (registrations.error) throw registrations.error
  const playerIds = [...new Set((registrations.data || []).map((row) => row.player_id as string).filter(Boolean))]
  const players = playerIds.length ? await client.from("players").select("id,screen_name,discord_id").in("id", playerIds) : { data: [], error: null }
  if (players.error) throw players.error
  return (players.data || []) as PlayerRow[]
}

async function loadAdmins(client: ReturnType<typeof trustedTournamentClient>) {
  const result = await client.from("players").select("id,screen_name,discord_id").in("screen_name", [...ADMIN_SCREEN_NAMES])
  if (result.error) throw result.error
  const rows = (result.data || []) as PlayerRow[]
  return ADMIN_SCREEN_NAMES.map((name) => rows.find((row) => row.screen_name === name)).filter((row): row is PlayerRow => Boolean(row))
}

async function loadMatch(client: ReturnType<typeof trustedTournamentClient>, matchId: string) {
  const result = await client.from("tournament_matches").select("id,tournament_id,round_number,match_number,player_a_id,player_b_id").eq("id", matchId).eq("tournament_id", TOURNAMENT_ID).maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error("The match is not in 5-4-3-2-1.")
  return result.data as MatchRow
}

export async function POST(request: Request) {
  const authorization = await authorizeBridge(request)
  if (!authorization.authorized) return authorization.response
  const body = await request.json().catch(() => null) as { action?: unknown; tournamentId?: unknown; matchId?: unknown } | null
  const action = text(body?.action)
  const requestedTournamentId = text(body?.tournamentId)
  if (requestedTournamentId && requestedTournamentId !== TOURNAMENT_ID) return NextResponse.json({ error: "Unsupported tournament." }, { status: 403 })
  if (!["verify", "create_thread"].includes(action)) return NextResponse.json({ error: "Unsupported tournament Discord action." }, { status: 400 })

  try {
    const client = trustedTournamentClient()
    const [roster, admins] = await Promise.all([loadConfirmedRoster(client), loadAdmins(client)])
    const playerIds = roster.map((row) => row.discord_id).filter((id): id is string => /^\d+$/.test(id || ""))
    const adminIds = admins.map((row) => row.discord_id).filter((id): id is string => /^\d+$/.test(id || ""))
    const adapter = createTournamentDiscordAdapter({ adminIds })

    if (action === "verify") {
      const verified = await adapter.verifyConnection({ playerIds, adminIds })
      const rosterByDiscordId = new Map(roster.filter((row) => /^\d+$/.test(row.discord_id || "")).map((row) => [row.discord_id as string, row]))
      const adminsByDiscordId = new Map(admins.filter((row) => /^\d+$/.test(row.discord_id || "")).map((row) => [row.discord_id as string, row]))
      const memberDiagnostics = (verified.memberResults || []).map((result) => {
        const rosterRow = rosterByDiscordId.get(result.discordId)
        const adminRow = adminsByDiscordId.get(result.discordId)
        const canonicalRow = rosterRow || adminRow
        return {
          identity: canonicalRow?.screen_name || "Unmatched configured Discord identity",
          canonicalPlayerId: canonicalRow?.id || null,
          administrator: Boolean(adminRow),
          discordId: result.discordId,
          classification: result.classification,
          httpStatus: result.httpStatus,
          discordCode: result.discordCode ?? null,
          retryAfterMs: result.retryAfterMs ?? null,
          globalRateLimit: result.globalRateLimit ?? false,
          detail: result.detail || null,
        }
      })
      return NextResponse.json({
        tournamentId: TOURNAMENT_ID,
        tournamentSlug: TOURNAMENT_SLUG,
        guildId: "1036296151651074168",
        status: verified.status,
        expectedPlayerCount: roster.length,
        verifiedPlayerCount: verified.verifiedPlayerCount || 0,
        expectedAdminCount: ADMIN_SCREEN_NAMES.length,
        verifiedAdminCount: verified.verifiedAdminCount || 0,
        missingAdmins: ADMIN_SCREEN_NAMES.filter((name) => !admins.some((row) => row.screen_name === name)),
        botUserConfigured: verified.botUserConfigured || false,
        botCheck: verified.botCheck || null,
        channelsCheck: verified.channelsCheck || null,
        rolesCheck: verified.rolesCheck || null,
        categoryFound: verified.categoryFound || false,
        matchChannelFound: verified.matchChannelFound || false,
        playerRoleFound: verified.playerRoleFound || false,
        memberResults: memberDiagnostics,
        reason: verified.reason,
      }, { headers: { "Cache-Control": "no-store" } })
    }

    if (process.env.TOURNAMENT_DISCORD_BRIDGE_CREATE_ENABLED !== "true") return NextResponse.json({ error: "Discord resource creation is disabled until final activation approval." }, { status: 423 })
    const matchId = text(body?.matchId)
    if (!matchId) return NextResponse.json({ error: "A match is required." }, { status: 400 })
    const match = await loadMatch(client, matchId)
    const players = [match.player_a_id, match.player_b_id].filter((id): id is string => Boolean(id))
    if (players.length !== 2) return NextResponse.json({ error: "Both match participants must be assigned." }, { status: 400 })
    const playerRows = await client.from("players").select("id,screen_name,discord_id").in("id", players)
    if (playerRows.error) throw playerRows.error
    const participants = (playerRows.data || []) as PlayerRow[]
    if (participants.length !== 2 || participants.some((row) => !/^\d+$/.test(row.discord_id || ""))) return NextResponse.json({ error: "Both match participants need verified Discord identities." }, { status: 400 })
    const existing = await client.from("tournament_discord_threads").select("id,discord_thread_id,status").eq("match_id", matchId).in("status", ["active", "cleanup_pending"]).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) return NextResponse.json({ status: "already_exists", threadId: existing.data.discord_thread_id })
    const room = await client.schema("five_four_three_two_one").from("match_room_assignments").select("room_name").eq("match_id", matchId).eq("tournament_id", TOURNAMENT_ID).maybeSingle()
    if (room.error) throw room.error
    if (!room.data?.room_name) return NextResponse.json({ error: "Assign the approved Walkabout room before creating the thread." }, { status: 409 })
    const verified = await adapter.verifyConnection({ playerIds: participants.map((row) => row.discord_id as string), adminIds })
    if (verified.status !== "ready" || !verified.parentChannelId) return NextResponse.json({ error: verified.reason || "Discord guild resources or members are not verified." }, { status: 409 })
    const directMatchCenter = `${STANDALONE_ORIGIN}/tournaments/${TOURNAMENT_SLUG}/matches/${encodeURIComponent(matchId)}`
    const threadBody = [`5, 4, 3, 2, 1 · Round ${match.round_number} · Match ${match.match_number}`, `${participants[0].screen_name} vs ${participants[1].screen_name}`, `Walkabout room: ${room.data.room_name}`, `Match Center: ${directMatchCenter}`, "Krys Leagues Match Center is the authoritative schedule and result record."].join("\n")
    const created = await adapter.createPrivateThread({ parentChannelId: verified.parentChannelId, matchId, playerIds: participants.map((row) => row.discord_id as string), adminIds, body: threadBody })
    if (created.status !== "sent" || !created.id) return NextResponse.json({ error: created.reason || "Discord thread was not created." }, { status: 502 })
    const saved = await authorization.supabase.rpc("five_four_three_two_one_admin_record_discord_thread", { p_match_id: matchId, p_discord_thread_id: created.id })
    if (saved.error) throw saved.error
    return NextResponse.json({ status: saved.data?.outcome === "already_exists" ? "already_exists" : "created", threadId: saved.data?.discord_thread_id || created.id }, { status: saved.data?.outcome === "already_exists" ? 200 : 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tournament Discord bridge failed." }, { status: 503 })
  }
}
