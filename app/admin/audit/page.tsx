import Link from "next/link"

export default function AuditAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Audit Center</h1>

      <p style={subtitle}>
        Review administrative actions, data changes, and security events.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Administrator Activity</strong>
          <span>
            View changes made by administrators across the site.
          </span>
        </section>

        <section style={card}>
          <strong>Player Changes</strong>
          <span>
            Review player edits, merges, imports, and updates.
          </span>
        </section>

        <section style={card}>
          <strong>League Changes</strong>
          <span>
            Track season creation, standings updates, and schedule changes.
          </span>
        </section>

        <section style={card}>
          <strong>Security Audit</strong>
          <span>
            Review login history and important administrative events.
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