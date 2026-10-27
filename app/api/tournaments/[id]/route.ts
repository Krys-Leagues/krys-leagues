import { NextResponse } from "next/server"

import { isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const client = trustedTournamentClient()
  const { data: tournament, error } = await client.from("tournaments").select("id,name,slug,status,bracket_size,format,registration_capacity,registration_open_at,registration_closed_at,started_at,completed_at,artwork_path").eq("id", id).in("status", ["registration_open", "registration_closed", "live", "completed"]).maybeSingle()
  if (error) return NextResponse.json({ error: isMissingTournamentSchema(error) ? "Tournament Builder schema is not installed in this environment." : error.message }, { status: 503 })
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 })
  const [rounds, matches, registrations] = await Promise.all([
    client.from("tournament_rounds").select("round_number,name,course_config,scoring_rules,tiebreaker_rules,is_final").eq("tournament_id", id).order("round_number"),
    client.from("tournament_matches").select("id,round_number,match_number,status,player_a_id,player_b_id,winner_player_id").eq("tournament_id", id).order("round_number").order("match_number"),
    client.from("tournament_registrations").select("id,player_id,status").eq("tournament_id", id).eq("status", "confirmed").order("registered_at"),
  ])
  if (rounds.error || matches.error || registrations.error) return NextResponse.json({ error: rounds.error?.message || matches.error?.message || registrations.error?.message }, { status: 503 })
  const playerIds = [...new Set([
    ...(matches.data ?? []).flatMap((match) => [match.player_a_id, match.player_b_id, match.winner_player_id].filter((value): value is string => Boolean(value))),
    ...(registrations.data ?? []).map((registration) => registration.player_id),
  ])]
  const players = playerIds.length ? await client.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
  const names = new Map((players.data ?? []).map((player) => [player.id, player.screen_name]))
  return NextResponse.json({
    tournament,
    registrations: (registrations.data ?? []).map((registration) => ({ ...registration, screen_name: names.get(registration.player_id) ?? null })),
    rounds: rounds.data ?? [],
    matches: (matches.data ?? []).map((match) => ({
      id: match.id,
      round_number: match.round_number,
      match_number: match.match_number,
      status: match.status,
      player_a_name: match.player_a_id ? names.get(match.player_a_id) ?? null : null,
      player_b_name: match.player_b_id ? names.get(match.player_b_id) ?? null : null,
      winner_name: match.winner_player_id ? names.get(match.winner_player_id) ?? null : null,
    })),
  }, { headers: { "Cache-Control": "no-store" } })
}
