import Link from "next/link"
import { KWT_PUBLIC_URL } from "@/lib/externalCompetitionSites"
export default function KWTPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "white",
        maxWidth: 1100,
        margin: "0 auto",
        padding: "40px",
      }}
    >
      <h1 style={{ fontSize: 42 }}>🏆 KWT</h1>

      <p style={{ color: "#cbd5e1", fontSize: 18 }}>
        Krys Weekly Tournament
      </p>

      <div
        style={{
          display: "grid",
          gap: 20,
          marginTop: 30,
        }}
      ><a href={KWT_PUBLIC_URL} target="_blank" rel="noreferrer" style={linkCard}>
  <h2>🌐 Open Current KWT Site</h2>
  <p>View the official public KWT home, standings, and event information.</p>
</a><div style={card}>
  <h2>🏆 Current Tournament</h2>
  <p>Current KWT tournament details will appear here.</p>
</div>

<div style={card}>
  <h2>📅 Upcoming Events</h2>
  <p>Upcoming KWT dates and registration information will appear here.</p>
</div>

<Link href="/champions" style={linkCard}>
  <h2>👑 Past Champions</h2>
  <p>View KWT champions in the Trophy Case.</p>
</Link>

<Link href="/records" style={linkCard}>
  <h2>🎯 Records</h2>
  <p>View KWT records and player achievements.</p>
</Link>
        </div>
    </main>
  )
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
}
const linkCard: React.CSSProperties = {
  ...card,
  display: "block",
  color: "white",
  textDecoration: "none",
}
