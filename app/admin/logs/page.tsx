import Link from "next/link"

export default function LogsAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>System Logs</h1>

      <p style={subtitle}>
        Review application activity, imports, updates, and administrative history.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Import Logs</strong>
          <span>
            Review CSV imports, standings imports, and validation results.
          </span>
        </section>

        <section style={card}>
          <strong>League Activity</strong>
          <span>
            Track season changes, standings updates, and league administration.
          </span>
        </section>

        <section style={card}>
          <strong>User Activity</strong>
          <span>
            Review administrator actions performed throughout the site.
          </span>
        </section>

        <section style={card}>
          <strong>Error Logs</strong>
          <span>
            View system errors, warnings, and diagnostic information.
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