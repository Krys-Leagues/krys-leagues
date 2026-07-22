import Link from "next/link"

export default function SkinsSetupPage() {
  return (
    <main style={page}>
      <h1 style={title}>Skins Season Setup</h1>

      <p style={subtitle}>
        Prepare Skins seasons, players, courses, and scoring.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Season Information</strong>
          <span>Create and configure a new Skins season.</span>
        </section>

        <section style={card}>
          <strong>Player Assignment</strong>
          <span>Assign players to the current Skins season.</span>
        </section>

        <section style={card}>
          <strong>Course Setup</strong>
          <span>Configure courses and weekly rotations.</span>
        </section>

        <Link href="/admin/skins/results" style={card}>
          <strong>Results</strong>
          <span>Enter or review Skins results.</span>
        </Link>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>Open the global player manager.</span>
        </Link>

        <Link href="/admin/skins" style={card}>
          <strong>Back to Skins Admin</strong>
          <span>Return to the Skins admin hub.</span>
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