import Link from "next/link"
import RegisterForTournamentButton from "./RegisterForTournamentButton"
import MatchCenter, { ScorecardWorkspace } from "./MatchCenter"

import { isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"

export const dynamic = "force-dynamic"

export default async function PublicTournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const client = trustedTournamentClient()
  const { data: tournament, error } = await client.from("tournaments").select("id,name,slug,status,bracket_size,format,registration_capacity").eq("slug", slug).in("status", ["registration_open", "registration_closed", "live", "completed"]).maybeSingle()
  if (error && !isMissingTournamentSchema(error)) throw new Error(error.message)
  if (error || !tournament) return <main style={page}><div style={shell}><h1>Public tournament bracket</h1><p>This bracket is not available yet. An authorized operator must complete setup before it can be published.</p><Link href="/tournaments" style={link}>← Tournaments</Link></div></main>
  const [{ data: matches }, { data: registrations }] = await Promise.all([
    client.from("tournament_matches").select("id,round_number,match_number,status,player_a_id,player_b_id,winner_player_id").eq("tournament_id", tournament.id).order("round_number").order("match_number"),
    client.from("tournament_registrations").select("id,player_id,status").eq("tournament_id", tournament.id).eq("status", "confirmed"),
  ])
  const playerIds = [...new Set([
    ...(matches ?? []).flatMap((match) => [match.player_a_id, match.player_b_id, match.winner_player_id].filter((value): value is string => Boolean(value))),
    ...(registrations ?? []).map((registration) => registration.player_id),
  ])]
  const { data: players } = playerIds.length ? await client.from("players").select("id,screen_name").in("id", playerIds) : { data: [] }
  const names = new Map((players ?? []).map((player) => [player.id, player.screen_name]))
  const byRound = new Map<number, typeof matches>()
  for (const match of matches ?? []) byRound.set(match.round_number, [...(byRound.get(match.round_number) ?? []), match])
  return <main style={page}><div style={shell}><Link href="/tournaments/current" style={link}>← Live Brackets</Link><p style={eyebrow}>Krys Leagues public tournament</p><h1>{tournament.name}</h1><p style={muted}>{tournament.bracket_size}-player single elimination · {tournament.status.replaceAll("_", " ")}</p>{tournament.status === "registration_open" && <><p style={capacity}><strong>{registrations?.length ?? 0}</strong> confirmed · <strong>{Math.max(tournament.registration_capacity - (registrations?.length ?? 0), 0)}</strong> places remaining</p><RegisterForTournamentButton tournamentId={tournament.id} /></>}<section style={roster}><h2>REGISTERED PLAYERS</h2>{(registrations ?? []).length === 0 ? <p style={muted}>No players have registered yet. Sign in to confirm your place.</p> : <ol>{(registrations ?? []).map((registration) => <li key={registration.id}>{names.get(registration.player_id) ?? "Confirmed player"}</li>)}</ol>}</section><section style={grid}>{[...byRound.entries()].map(([round, roundMatches]) => <article style={roundCard} key={round}><h2>{round === Math.log2(tournament.bracket_size) ? "Final" : `Round ${round}`}</h2>{(roundMatches ?? []).map((match) => <div style={matchCard} key={match.id}><strong>{names.get(match.player_a_id ?? "") ?? "Waiting"}</strong><span>vs</span><strong>{names.get(match.player_b_id ?? "") ?? "Waiting"}</strong><small>{match.status === "completed" ? `Winner: ${names.get(match.winner_player_id ?? "") ?? "Verified"}` : match.status}</small><MatchCenter tournamentId={tournament.id} matchId={match.id} playerAId={match.player_a_id} playerBId={match.player_b_id} playerAName={names.get(match.player_a_id ?? "") ?? "Player A"} playerBName={names.get(match.player_b_id ?? "") ?? "Player B"} status={match.status} />{match.player_a_id && match.player_b_id && <ScorecardWorkspace tournamentId={tournament.id} matchId={match.id} />}</div>)}</article>)}</section></div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#05070b", color: "white", padding: "30px 16px 80px" }
const shell: React.CSSProperties = { maxWidth: 1250, margin: "0 auto" }
const eyebrow: React.CSSProperties = { marginTop: 28, color: "#f0abfc", textTransform: "uppercase", letterSpacing: ".16em", fontWeight: 800, fontSize: 12 }
const muted: React.CSSProperties = { color: "#cbd5e1" }
const capacity: React.CSSProperties = { color: "#cbd5e1", marginTop: 16 }
const roster: React.CSSProperties = { marginTop: 24, padding: 18, borderRadius: 16, border: "1px solid #334155", background: "#101722", color: "#e2e8f0" }
const link: React.CSSProperties = { color: "#f0abfc", textDecoration: "none", fontWeight: 800 }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 28, overflowX: "auto" }
const roundCard: React.CSSProperties = { minWidth: 220, padding: 14, border: "1px solid #334155", borderRadius: 16, background: "#101722" }
const matchCard: React.CSSProperties = { display: "grid", gap: 4, padding: 11, marginTop: 10, borderRadius: 10, background: "#0b111c", color: "#e2e8f0" }
