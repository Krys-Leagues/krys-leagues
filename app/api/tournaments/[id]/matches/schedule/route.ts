import { NextResponse } from "next/server"
import { getCourseChallengeIdentity } from "@/lib/courseChallenges/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { trustedTournamentClient } from "@/lib/tournaments/server"
import { formatLocalDateTime } from "@/lib/tournaments/schedule"

export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await getCourseChallengeIdentity()
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  const { id } = await context.params
  const matchId = new URL(request.url).searchParams.get("matchId")
  if (!matchId) return NextResponse.json({ error: "A match is required." }, { status: 400 })
  const client = trustedTournamentClient()
  const { data: match, error: matchError } = await client.from("tournament_matches").select("id,tournament_id,player_a_id,player_b_id").eq("id", matchId).eq("tournament_id", id).maybeSingle()
  if (matchError || !match || ![match.player_a_id, match.player_b_id].includes(identity.playerId)) return NextResponse.json({ error: "This match is not available to this player." }, { status: 403 })
  const { data, error } = await client.from("tournament_match_schedule_offers").select("id,proposed_by,starts_at,proposed_timezone,status,created_at,responded_at").eq("match_id", matchId).order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 503 })
  const playerIds = [match.player_a_id, match.player_b_id].filter((value): value is string => Boolean(value))
  const { data: registrations, error: registrationError } = await client.from("tournament_registrations").select("player_id,player_timezone").eq("tournament_id", id).in("player_id", playerIds)
  if (registrationError) return NextResponse.json({ error: registrationError.message }, { status: 503 })
  const zones = new Map((registrations ?? []).map((registration) => [registration.player_id, registration.player_timezone]))
  const playerATimeZone = zones.get(match.player_a_id ?? "")
  const playerBTimeZone = zones.get(match.player_b_id ?? "")
  const offers = (data ?? []).map((offer) => ({
    ...offer,
    is_current_user_proposer: offer.proposed_by === identity.playerId,
    player_a_local_time: playerATimeZone ? formatLocalDateTime(offer.starts_at, playerATimeZone) : null,
    player_b_local_time: playerBTimeZone ? formatLocalDateTime(offer.starts_at, playerBTimeZone) : null,
  }))
  return NextResponse.json({ offers }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await getCourseChallengeIdentity()
  if (!identity) return NextResponse.json({ error: "Sign in with a linked canonical player before scheduling." }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { action?: unknown; offerId?: unknown; startsAt?: unknown; timeZone?: unknown; idempotencyKey?: unknown } | null
  const action = typeof body?.action === "string" ? body.action : ""
  if (!["propose", "accept", "counter", "withdraw"].includes(action)) return NextResponse.json({ error: "Unsupported schedule action." }, { status: 400 })
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc("player_match_schedule_action", { p_match_id: id, p_action: action, p_offer_id: typeof body?.offerId === "string" ? body.offerId : null, p_starts_at: typeof body?.startsAt === "string" ? body.startsAt : null, p_proposed_timezone: typeof body?.timeZone === "string" ? body.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone, p_idempotency_key: typeof body?.idempotencyKey === "string" ? body.idempotencyKey : crypto.randomUUID() })
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 })
  return NextResponse.json({ result: data })
}
