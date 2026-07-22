import Link from "next/link"

export default function KrysTourneyActiveGamesPage() {
  return (
    <main style={page}>
      <h1 style={title}>Tournament Active Matches</h1>

      <p style={subtitle}>
        Monitor tournament matches, bracket progress, and players still competing.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Current Matches</strong>
          <span>Active tournament matches will appear here.</span>
        </section>

        <section style={card}>
          <strong>Bracket Progress</strong>
          <span>Current bracket advancement and completed rounds.</span>
        </section>

        <section style={card}>
          <strong>Waiting for Results</strong>
          <span>Matches awaiting score submission will appear here.</span>
        </section>

        <Link href="/admin/bracket-results" style={card}>
          <strong>Enter Results</strong>
          <span>Open the tournament results page.</span>
        </Link>

        <Link href="/admin/bracket-builder" style={card}>
          <strong>Bracket Builder</strong>
          <span>Manage tournament brackets.</span>
        </Link>

        <Link href="/admin/krys-tourney" style={card}>
          <strong>Back to Tournament Admin</strong>
          <span>Return to the tournament admin hub.</span>
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