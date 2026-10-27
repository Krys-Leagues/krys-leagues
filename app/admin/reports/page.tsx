import Link from "next/link"

export default function ReportsAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Reports</h1>

      <p style={subtitle}>
        Generate league reports, exports, statistics, and historical summaries.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>League Reports</strong>
          <span>
            Generate standings, statistics, and season summaries.
          </span>
        </section>

        <section style={card}>
          <strong>Player Reports</strong>
          <span>
            View player performance and career reports.
          </span>
        </section>

        <section style={card}>
          <strong>Export Data</strong>
          <span>
            Export standings, player data, and league history.
          </span>
        </section>

        <section style={card}>
          <strong>Historical Reports</strong>
          <span>
            Generate reports across multiple seasons.
          </span>
        </section>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>Open the global player manager.</span>
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