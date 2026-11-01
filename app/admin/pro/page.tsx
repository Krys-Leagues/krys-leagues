import Link from "next/link"

export default function ProAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Pro League Admin</h1>

      <p style={subtitle}>
        Manage Pro, Semi Pro and Amateur league seasons, scoring and standings.
      </p>

      <div style={grid}>
        <Link href="/admin/pro/schedule" style={card}>
          <strong>Setup Season</strong>
          <span>Create and manage Pro League seasons.</span>
        </Link>

        <Link href="/admin/pro/results" style={card}>
          <strong>Score Season</strong>
          <span>Enter scores and results.</span>
        </Link>

        <Link href="/pro-standings" style={card}>
          <strong>Standings</strong>
          <span>View current standings.</span>
        </Link>

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