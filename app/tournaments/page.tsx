import Link from "next/link"

export default function TournamentsPage() {
  return (
    <main style={page}>
      <div style={container}>
        <Link href="/" style={backButton}>
          ← Krys Leagues
        </Link>

        <section style={hero}>
          <h1 style={title}>🥇 Bracket Tournaments</h1>

          <p style={subtitle}>
            Register for upcoming tournaments, follow live brackets, and view
            past champions.
          </p>
        </section>

        <div style={grid}>
          <Link href="/majors" style={linkCard}>
            <h2>Four Majors</h2>
            <p>
              View Major event details, registration, participants, and official
              streams.
            </p>
          </Link>

      <section style={card}>
  <h2>📝 Open Registration</h2>
  <p>No tournaments currently accepting registrations.</p>
</section>

<section style={card}>
  <h2>🎯 Current Brackets</h2>
  <p>No tournaments currently in progress.</p>
</section>

<Link href="/champions" style={linkCard}>
  <h2>🏆 Past Tournament Winners</h2>
  <p>View bracket tournament winners in the Hall of Champions.</p>
</Link>

<section style={card}>
  <h2>⭐ Invitational Qualification</h2>

  <p><strong>👑 Champion of Champions</strong><br />
  Win any Bracket Tournament.</p>

  <p><strong>🏆 Krys Cup</strong><br />
  Reach Round 3 or later but do not win the Final.</p>

  <p><strong>🌶️ Spicy Cup</strong><br />
  Reach Round 2 or earlier.</p>
</section>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 18,
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
}
const linkCard: React.CSSProperties = {
  ...card,
  display: "block",
  color: "white",
  textDecoration: "none",
}
