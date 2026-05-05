import Link from "next/link"

export default function StrokeAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Stroke Play Admin</h1>
      <p style={subtitle}>Manage Stroke Play seasons, scoring, and active games.</p>

      <div style={grid}>
        <Link href="/admin/stroke/setup" style={card}>
          <strong>Setup New Season</strong>
          <span>Create or prepare a new Stroke Play season.</span>
        </Link>

        <Link href="/admin/stroke/results" style={card}>
          <strong>Score Current Season</strong>
          <span>Enter or review Stroke Play results.</span>
        </Link>

        <Link href="/admin/stroke/active-games" style={card}>
          <strong>Active Games</strong>
          <span>Track player progress and submissions.</span>
        </Link>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>View global player list used across all leagues.</span>
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