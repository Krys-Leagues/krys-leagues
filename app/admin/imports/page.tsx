import Link from "next/link"

export default function ImportsAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Imports</h1>

      <p style={subtitle}>
        Central location for importing league data, scores, standings, and player information.
      </p>

      <div style={grid}>
        <Link href="/admin/kwt-import" style={card}>
          <strong>KWT CSV Import</strong>
          <span>Import KWT score files.</span>
        </Link>

        <section style={card}>
          <strong>League Imports</strong>
          <span>
            Future imports for Stroke, Match, Doubles, PYP, Amateur-Pro, and other leagues.
          </span>
        </section>

        <section style={card}>
          <strong>Player Imports</strong>
          <span>
            Import or synchronize player information.
          </span>
        </section>

        <section style={card}>
          <strong>Import History</strong>
          <span>
            Review previous imports and validation results.
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