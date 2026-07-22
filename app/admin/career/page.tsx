import Link from "next/link"

export default function CareerAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Career Statistics</h1>

      <p style={subtitle}>
        Career totals, wins, losses, trophies, and player achievements will be managed here.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Career Totals</strong>
          <span>
            Overall wins, losses, points, and matches played.
          </span>
        </section>

        <section style={card}>
          <strong>Trophy History</strong>
          <span>
            Championships, Cups, and special awards earned.
          </span>
        </section>

        <section style={card}>
          <strong>League History</strong>
          <span>
            Complete player history across every league and season.
          </span>
        </section>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>Open the global player manager.</span>
        </Link>

        <Link href="/admin" style={card}>
          <strong>Back to Admin Home</strong>
          <span>Return to the Admin Dashboard.</span>
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