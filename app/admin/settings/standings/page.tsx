import Link from "next/link"

export default function StandingsSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Standings Settings</h1>

      <p style={subtitle}>
        Configure standings calculations, rankings, tie-breakers, and scoring rules.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Ranking Rules</strong>
          <span>
            Configure how player and team rankings are calculated.
          </span>
        </section>

        <section style={card}>
          <strong>Tie-Breakers</strong>
          <span>
            Configure tie-breaker rules for league standings.
          </span>
        </section>

        <section style={card}>
          <strong>Points System</strong>
          <span>
            Configure points awarded for wins, draws, and losses.
          </span>
        </section>

        <section style={card}>
          <strong>Standings Display</strong>
          <span>
            Configure how public standings are presented.
          </span>
        </section>

        <Link href="/admin/settings" style={card}>
          <strong>Back to Settings</strong>
          <span>Return to the Settings page.</span>
        </Link>

        <Link href="/admin" style={card}>
          <strong>Back to Admin Home</strong>
          <span>Return to the main admin dashboard.</span>
        </Link>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const title: React.CSSProperties = {
  fontSize: 34,
  marginBottom: 8,
}

const subtitle: React.CSSProperties = {
  color: "#cfcfcf",
  marginBottom: 28,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 14,
}

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 18,
  borderRadius: 14,
  border: "1px solid #333",
  background: "#111",
  color: "white",
  textDecoration: "none",
}