import Link from "next/link"

export default function SpicyActiveGamesPage() {
  return (
    <main style={page}>
      <h1 style={title}>Spicy Active Games</h1>

      <p style={subtitle}>
        Monitor current Spicy matches, outstanding games, and player progress.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Current Matches</strong>
          <span>Active Spicy matches will appear here.</span>
        </section>

        <section style={card}>
          <strong>Outstanding Games</strong>
          <span>Matches still waiting to be completed will appear here.</span>
        </section>

        <section style={card}>
          <strong>Player Progress</strong>
          <span>Track submissions and completion status.</span>
        </section>

        <Link href="/admin/spicy/results" style={card}>
          <strong>Enter Results</strong>
          <span>Open the Spicy results page.</span>
        </Link>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>Open the global player manager.</span>
        </Link>

        <Link href="/admin/spicy" style={card}>
          <strong>Back to Spicy Admin</strong>
          <span>Return to the Spicy admin hub.</span>
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