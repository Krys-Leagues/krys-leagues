import Link from "next/link"

export default function PYPSetupPage() {
  return (
    <main style={page}>
      <h1 style={title}>PYP Season Setup</h1>

      <p style={subtitle}>
        Prepare players, divisions, courses, and scheduling for a new Pick Your
        Poison season.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Season Information</strong>
          <span>
            Season number, dates, and locking controls will be managed here.
          </span>
        </section>

        <section style={card}>
          <strong>Division Setup</strong>
          <span>
            Prepare PYP D1 through PYP D5 and assign participating players.
          </span>
        </section>

        <section style={card}>
          <strong>Course Picks</strong>
          <span>
            Home and away course selections and match scheduling will be added
            here.
          </span>
        </section>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>Open the global player manager.</span>
        </Link>

        <Link href="/admin/pyp/results" style={card}>
          <strong>PYP Results</strong>
          <span>Enter or review results for the current season.</span>
        </Link>

        <Link href="/admin/pyp" style={card}>
          <strong>Back to PYP Admin</strong>
          <span>Return to the PYP admin hub.</span>
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