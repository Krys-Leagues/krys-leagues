import Link from "next/link"

export default function KrysTourneyAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Krys Tourney Admin</h1>
      <p style={subtitle}>Manage tournament setup, brackets, and tracking.</p>

      <div style={grid}>
        <Link href="/admin/bracket-builder" style={card}>
          <strong>Setup Tournament</strong>
          <span>Build brackets and prepare matches.</span>
        </Link>

        <Link href="/admin/bracket-results" style={card}>
          <strong>Enter Results</strong>
          <span>Update bracket results and winners.</span>
        </Link>

        <Link href="/admin/krys-tourney/active-games" style={card}>
          <strong>Active Matches</strong>
          <span>Track current matches and player progress.</span>
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