import Link from "next/link"
import type { PublicOpenTournament } from "@/lib/tournaments/public"

export default function InternalTournamentCards({ tournaments }: { tournaments: PublicOpenTournament[] }) {
  if (tournaments.length === 0) return null
  return <section aria-label="Open Krys Leagues tournaments" style={wrap}><h2 style={heading}>Open registration</h2><div style={grid}>{tournaments.map((tournament) => <article key={tournament.id} style={card}><strong>{tournament.name}</strong><span>{tournament.confirmed_count}/{tournament.registration_capacity} confirmed · {tournament.registration_capacity - tournament.confirmed_count} places remaining</span>{(tournament.has_artwork || tournament.has_rules) && <small>{[tournament.has_artwork && "Artwork available", tournament.has_rules && "Rules available"].filter(Boolean).join(" · ")}</small>}<Link href={`/tournaments/${tournament.slug}`} style={link}>Open signup →</Link></article>)}</div></section>
}

const wrap: React.CSSProperties = { margin: "22px auto", width: "min(100% - 32px, 1120px)", padding: 18, borderRadius: 16, background: "#020617dd", color: "white" }
const heading: React.CSSProperties = { margin: "0 0 12px", fontSize: 20 }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }
const card: React.CSSProperties = { display: "grid", gap: 6, padding: 14, border: "1px solid #475569", borderRadius: 12, background: "#111827" }
const link: React.CSSProperties = { color: "#f0abfc", textDecoration: "none", fontWeight: 800 }
