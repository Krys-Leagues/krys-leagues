import Link from "next/link"

export default function DatabaseAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Database</h1>

      <p style={subtitle}>
        Database administration, maintenance, validation, and integrity tools.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Database Health</strong>
          <span>
            Check tables, indexes, and overall database integrity.
          </span>
        </section>

        <section style={card}>
          <strong>Validate Data</strong>
          <span>
            Find missing player links, duplicate records, and orphaned data.
          </span>
        </section>

        <section style={card}>
          <strong>Backup & Restore</strong>
          <span>
            Future tools for exporting and restoring league data.
          </span>
        </section>

        <section style={card}>
          <strong>Maintenance</strong>
          <span>
            Run maintenance jobs and optimize database performance.
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