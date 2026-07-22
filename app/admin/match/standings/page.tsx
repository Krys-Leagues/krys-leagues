import Link from "next/link"

export default function MatchStandingsAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Match Play Standings</h1>

      <p style={subtitle}>
        Manage Match Play standings and publish updates.
      </p>

      <div style={grid}>
        <Link href="/match-standings" style={card}>
          <strong>Public Standings</strong>
          <span>Open the public Match Play standings page.</span>
        </Link>

        <Link href="/admin/match/results" style={card}>
          <strong>Results</strong>
          <span>Enter or edit Match Play results.</span>
        </Link>

        <Link href="/admin/match/schedule" style={card}>
          <strong>Schedule</strong>
          <span>Create or edit Match Play schedules.</span>
        </Link>

        <Link href="/admin/match" style={card}>
          <strong>Back to Match Hub</strong>
          <span>Return to the Match Play admin hub.</span>
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
