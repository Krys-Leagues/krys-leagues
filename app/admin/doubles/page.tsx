import Link from "next/link"

export default function DoublesAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Doubles Admin</h1>

      <p style={subtitle}>
        Manage Doubles league seasons, scoring, standings and teams.
      </p>

      <div style={grid}>
        <Link href="/admin/doubles/teams" style={card}>
          <strong>Canonical Teams</strong>
          <span>Manage persistent teams and season-scoped rosters.</span>
        </Link>

        <Link href="/admin/doubles/schedule" style={card}>
          <strong>Schedule Fixtures</strong>
          <span>Build Home/Away fixtures, actual courses, and publication.</span>
        </Link>

        <Link href="/admin/doubles/results" style={card}>
          <strong>Authoritative Review</strong>
          <span>Review two-course team submissions and verify results.</span>
        </Link>

        <Link href="/doubles-standings" style={card}>
          <strong>Standings</strong>
          <span>View current Doubles standings.</span>
        </Link>

        <Link href="/admin/doubles/final-scorecard" style={card}>
          <strong>Final Scorecard / Lifecycle</strong>
          <span>Generate, approve and finalize immutable team history.</span>
        </Link>

        <Link href="/admin/doubles/boards" style={card}>
          <strong>Live Boards</strong>
          <span>Inspect retry state and perform explicit recovery.</span>
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
