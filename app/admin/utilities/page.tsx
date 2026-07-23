import Link from "next/link"

export default function UtilitiesAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Utilities</h1>

      <p style={subtitle}>
        Administrative tools, maintenance utilities, and system cleanup functions.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Database Maintenance</strong>
          <span>
            Run maintenance tasks and verify database integrity.
          </span>
        </section>

        <section style={card}>
          <strong>Recalculate Statistics</strong>
          <span>
            Refresh player statistics, standings, and career totals.
          </span>
        </section>

        <section style={card}>
          <strong>Cleanup Tools</strong>
          <span>
            Remove duplicate records and validate imported data.
          </span>
        </section>

        <section style={card}>
          <strong>System Diagnostics</strong>
          <span>
            Check application status and verify data consistency.
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