import Link from "next/link"

export default function SkinsResultsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Skins Results</h1>

      <p style={subtitle}>
        Enter and review completed Skins rounds, winners, and player totals.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Enter Results</strong>
          <span>
            Skins scoring and winner entry will be added here.
          </span>
        </section>

        <section style={card}>
          <strong>Completed Rounds</strong>
          <span>
            Previously entered Skins rounds and winners will appear here.
          </span>
        </section>

        <section style={card}>
          <strong>Player Totals</strong>
          <span>
            Season totals and accumulated Skins will appear here.
          </span>
        </section>

        <Link href="/skins-standings" style={card}>
          <strong>Public Leaderboard</strong>
          <span>Open the public Skins leaderboard.</span>
        </Link>

        <Link href="/admin/skins/active-games" style={card}>
          <strong>Active Games</strong>
          <span>View current Skins games still in progress.</span>
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