import Link from "next/link"
import { ARCHIVED_TOURNAMENTS, fetchTourneyBotPreview } from "@/lib/tourneyBot"

export const revalidate = 60

export default async function TournamentHistoryPage() {
  const tournaments = await Promise.all(ARCHIVED_TOURNAMENTS.map(fetchTourneyBotPreview))
  return <main style={{ minHeight: "100vh", padding: "32px 18px", background: "#020617", color: "white" }}><div style={{ width: "min(100%, 980px)", margin: "0 auto" }}><Link href="/tournaments" style={{ color: "#cbd5e1", fontWeight: 800 }}>← Bracket Tournaments</Link><h1>Past Tournament Winners</h1><p>Archived public Tourney Bot tournament records.</p>{tournaments.map((tournament) => <article key={tournament.id} style={{ marginTop: 18, padding: 20, border: "1px solid #31598a", borderRadius: 16, background: "#07152d" }}><h2>{tournament.name}</h2><p>{tournament.available ? tournament.status : tournament.error}</p>{tournament.standings.length > 0 ? <ol>{tournament.standings.map((entry, index) => <li key={`${entry.name}-${index}`}>{entry.name}{entry.score ? ` · ${entry.score}` : ""}</li>)}</ol> : null}<a href={tournament.url} target="_blank" rel="noopener noreferrer" style={{ color: "#7dd3fc", fontWeight: 800 }}>View Full Bracket →</a></article>)}</div></main>
}
