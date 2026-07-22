import Link from "next/link"

export default function KWTActiveGamesPage() {
  return (
    <main style={page}>
      <h1 style={title}>KWT Active Games</h1>

      <p style={subtitle}>
        Monitor current KWT games, weekly submissions, and players who still
        need reminders.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Current Games</strong>
          <span>Active KWT games will appear here.</span>
        </section>

        <section style={card}>
          <strong>Submitted Scores</strong>
          <span>Players who have completed the current week will appear here.</span>
        </section>

        <section style={card}>
          <strong>Outstanding Players</strong>
          <span>Players still waiting to submit will appear here.</span>
        </section>

        <Link href="/admin/kwt-import" style={card}>
          <strong>Import Results</strong>
          <span>Upload weekly KWT CSV files.</span>
        </Link>

        <Link href="/kwt-standings" style={card}>
          <strong>Public Standings</strong>
          <span>Open the public KWT standings page.</span>
        </Link>

        <Link href="/admin/kwt" style={card}>
          <strong>Back to KWT Admin</strong>
          <span>Return to the KWT admin hub.</span>
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
  maxWidth: 760,
  lineHeight: 1.5,
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