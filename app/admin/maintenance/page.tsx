import Link from "next/link"

export default function MaintenanceAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Maintenance</h1>

      <p style={subtitle}>
        Run maintenance tasks, optimize data, and keep the Krys Leagues system healthy.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Recalculate Standings</strong>
          <span>
            Refresh league standings and rankings.
          </span>
        </section>

        <section style={card}>
          <strong>Refresh Statistics</strong>
          <span>
            Rebuild player, season, and career statistics.
          </span>
        </section>

        <section style={card}>
          <strong>Validate Database</strong>
          <span>
            Check for missing records, broken links, and inconsistencies.
          </span>
        </section>

        <section style={card}>
          <strong>Cleanup</strong>
          <span>
            Remove temporary data and optimize database performance.
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