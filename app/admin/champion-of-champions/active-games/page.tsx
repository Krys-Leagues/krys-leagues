import Link from "next/link"

export default function ChampionOfChampionsActiveGamesPage() {
  return (
    <main style={page}>
      <h1 style={title}>Champion of Champions Active Matches</h1>

      <p style={subtitle}>
        Monitor active matches, bracket progress, and players still competing.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Current Matches</strong>
          <span>Matches currently being played will appear here.</span>
        </section>

        <section style={card}>
          <strong>Bracket Progress</strong>
          <span>Track advancement through each round of the event.</span>
        </section>

        <section style={card}>
          <strong>Awaiting Results</strong>
          <span>Matches waiting for score submission will appear here.</span>
        </section>

        <Link href="/admin/champion-of-champions/results" style={card}>
          <strong>Enter Results</strong>
          <span>Open the Champion of Champions results page.</span>
        </Link>

        <Link href="/champions" style={card}>
          <strong>Hall of Champions</strong>
          <span>View previous Champion of Champions winners.</span>
        </Link>

        <Link href="/admin/champion-of-champions" style={card}>
          <strong>Back to Champion Admin</strong>
          <span>Return to the Champion of Champions admin hub.</span>
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