import Link from "next/link"

export default function LeaderboardsPage() {
  return (
    <main style={page}>
      <div style={container}>
        <Link href="/" style={backButton}>
          ← Krys Leagues
        </Link>

        <h1 style={title}>🏆 Overall Leaderboards</h1>

        <div style={grid}>
          <section style={card}>
            <h2>🏌️ Regular Leaderboard</h2>
            <p>Coming Soon</p>
          </section>

          <section style={card}>
            <h2>⚡ Speed Running Leaderboard</h2>
            <p>Coming Soon</p>
          </section>
        </div>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#020617",
  color: "white",
  padding: 40,
}

const container: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
}

const title: React.CSSProperties = {
  fontSize: 42,
  marginBottom: 30,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
  gap: 20,
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 24,
  color: "white",
  textDecoration: "none",
}