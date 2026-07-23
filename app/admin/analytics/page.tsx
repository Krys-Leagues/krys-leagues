import Link from "next/link"

export default function AnalyticsAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Analytics</h1>

      <p style={subtitle}>
        View league analytics, player trends, participation, and performance metrics.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>League Analytics</strong>
          <span>
            Overall league participation, growth, and activity.
          </span>
        </section>

        <section style={card}>
          <strong>Player Trends</strong>
          <span>
            Review player improvement, rankings, and long-term performance.
          </span>
        </section>

        <section style={card}>
          <strong>Season Statistics</strong>
          <span>
            Compare statistics across current and previous seasons.
          </span>
        </section>

        <section style={card}>
          <strong>Performance Charts</strong>
          <span>
            Visual reports and graphs for league and player data.
          </span>
        </section>

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