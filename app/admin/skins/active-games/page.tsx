import Link from "next/link"

export default function SkinsActiveGamesPage() {
  return (
    <main style={page}>
      <h1 style={title}>Skins Active Games</h1>

      <p style={subtitle}>
        Monitor current Skins games, outstanding rounds, and player progress.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Current Games</strong>
          <span>Active Skins games will appear here.</span>
        </section>

        <section style={card}>
          <strong>Outstanding Rounds</strong>
          <span>Rounds still waiting to be completed will appear here.</span>
        </section>

        <section style={card}>
          <strong>Player Progress</strong>
          <span>Track submissions and completion status.</span>
        </section>

        <Link href="/admin/skins/results" style={card}>
          <strong>Enter Results</strong>
          <span>Open the Skins results page.</span>
        </Link>

        <Link href="/skins-standings" style={card}>
          <strong>Public Leaderboard</strong>
          <span>Open the public Skins leaderboard.</span>
        </Link>

        <Link href="/admin/skins" style={card}>
          <strong>Back to Skins Admin</strong>
          <span>Return to the Skins admin hub.</span>
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