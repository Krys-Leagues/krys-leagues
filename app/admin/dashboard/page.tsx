import Link from "next/link"

export default function DashboardAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Dashboard</h1>

      <p style={subtitle}>
        Administrative overview of leagues, seasons, players, and system activity.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>League Overview</strong>
          <span>
            View active leagues, current seasons, and participation totals.
          </span>
        </section>

        <section style={card}>
          <strong>Recent Activity</strong>
          <span>
            Review recent imports, standings updates, and administrative actions.
          </span>
        </section>

        <section style={card}>
          <strong>System Status</strong>
          <span>
            Monitor database health, scheduled tasks, and application status.
          </span>
        </section>

        <section style={card}>
          <strong>Quick Statistics</strong>
          <span>
            View player counts, league totals, and current season summaries.
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