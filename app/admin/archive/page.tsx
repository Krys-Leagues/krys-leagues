import Link from "next/link"

export default function ArchiveAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Archive</h1>

      <p style={subtitle}>
        Archive completed seasons, tournaments, and historical league data.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Season Archive</strong>
          <span>
            View and manage archived league seasons.
          </span>
        </section>

        <section style={card}>
          <strong>Tournament Archive</strong>
          <span>
            Access completed tournament brackets and results.
          </span>
        </section>

        <section style={card}>
          <strong>Historical Records</strong>
          <span>
            Browse historical standings, champions, and league statistics.
          </span>
        </section>

        <section style={card}>
          <strong>Archive Maintenance</strong>
          <span>
            Organize and maintain archived league information.
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