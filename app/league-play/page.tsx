import Link from "next/link"

export default function LeaguePlayPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
        color: "white",
        padding: "30px 18px",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: 24,
            color: "white",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          ← Krys Leagues
        </Link>

        <h1 style={{ fontSize: 42 }}>🏌️ League Play</h1>

        <p style={{ color: "#cbd5e1", fontSize: 18 }}>
          Choose a league to view schedules, standings, results and records.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 20,
            marginTop: 30,
          }}
        >
          <Link href="/stroke" style={card}>
            <h2>🏌️ Stroke Play</h2>
            <p>Schedules • Standings • Results • Records</p>
          </Link>

          <Link href="/match-play" style={card}>
            <h2>⚔️ Match Play</h2>
            <p>Schedules • Standings • Results • Records</p>
          </Link>

          <Link href="/doubles" style={card}>
            <h2>👥 Doubles</h2>
            <p>Schedules • Standings • Results • Records</p>
          </Link>

          <Link href="/amateur-pro" style={card}>
            <h2>⭐ Amateur → Pro</h2>
            <p>Schedules • Standings • Results • Records</p>
          </Link>

          <Link href="/skins" style={card}>
            <h2>💰 Skins</h2>
            <p>League • Standings • Results</p>
          </Link>

          <Link href="/pyp" style={card}>
            <h2>🚀 PYP</h2>
            <p>Schedules • Standings • Results • Records</p>
          </Link>
        </div>
      </div>
    </main>
  )
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
  color: "white",
  textDecoration: "none",
  display: "block",
}