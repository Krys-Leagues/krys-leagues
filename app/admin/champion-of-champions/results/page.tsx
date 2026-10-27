import Link from "next/link"

export default function ChampionOfChampionsResultsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Champion of Champions Results</h1>

      <p style={subtitle}>
        Enter and review Champion of Champions match results and event winners.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Enter Results</strong>
          <span>Match scoring and winner entry will be added here.</span>
        </section>

        <section style={card}>
          <strong>Completed Matches</strong>
          <span>Completed event matches will appear here.</span>
        </section>

        <section style={card}>
          <strong>Event Winner</strong>
          <span>The Champion of Champions winner will be recorded here.</span>
        </section>

        <Link href="/admin/champion-of-champions/active-games" style={card}>
          <strong>Active Matches</strong>
          <span>Monitor matches still in progress.</span>
        </Link>

        <Link href="/champions" style={card}>
          <strong>Hall of Champions</strong>
          <span>Open the public Hall of Champions.</span>
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