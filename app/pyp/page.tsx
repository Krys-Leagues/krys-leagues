import Link from "next/link"

export default function PYPPage() {
  return (
    <main style={page}>
      <div style={container}>
        <Link href="/league-play" style={backButton}>
          ← League Play
        </Link>

        <section style={hero}>
          <h1 style={title}>🚀 PYP</h1>

          <p style={subtitle}>
            View PYP standings, matches, records, and player progression.
          </p>
        </section>

        <div style={grid}>
          <Link href="/matches" style={card}>
            <h2>📅 Matches & Results</h2>
            <p>View schedules, scores, and completed PYP matches.</p>
          </Link>

          <section style={card}>
            <h2>📊 Public Standings</h2>
            <p>Coming next.</p>
          </section>

          <Link href="/players" style={card}>
            <h2>👤 Player Profiles</h2>
            <p>View player history and progression.</p>
          </Link>

          <Link href="/records" style={card}>
            <h2>🏆 League Records</h2>
            <p>View PYP records and achievements.</p>
          </Link>
        </div>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
  padding: "30px 18px",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  margin: "0 auto",
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 18,
  padding: "10px 16px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 10,
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const hero: React.CSSProperties = {
  padding: 26,
  background: "rgba(2, 6, 23, 0.9)",
  border: "1px solid #334155",
  borderRadius: 20,
  marginBottom: 20,
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 42,
}

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.5,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 18,
}

const card: React.CSSProperties = {
  display: "block",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
  color: "white",
  textDecoration: "none",
}