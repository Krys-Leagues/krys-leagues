import Link from "next/link"

export default function ChampionsPage() {
  return (
    <main style={page}>
      <div style={container}>
        <Link href="/" style={backButton}>
          ← Krys Leagues
        </Link>

        <section style={hero}>
          <h1 style={title}>🏆 Hall of Champions</h1>

          <p style={subtitle}>
            Celebrating the greatest achievements in Krys Leagues.
          </p>
        </section>

        <div style={grid}>
          <section style={card}>
            <h2>🏅 League Champions</h2>
            <p>Coming Soon</p>
          </section>

          <section style={card}>
            <h2>🥇 Bracket Tournament Champions</h2>
            <p>Coming Soon</p>
          </section>

   <section style={card}>
  <h2>👑 Champion of Champions</h2>

 <video
  controls
  loop
  playsInline
  preload="auto"
  style={{
    width: "100%",
    maxWidth: 500,
    borderRadius: 16,
    marginTop: 16,
    marginBottom: 20,
  }}
>
   <source
  src="/league-media/trophies/champion-of-champions.mp4"
  type="video/mp4"
/>
  </video>

 <p>
  <strong>🏆 2026 Champion of Champions</strong>
  <br />
  BLUTES87
</p>
</section>

          <section style={card}>
            <h2>🏆 Krys Cup</h2>
            <p>Cup winners will be displayed here.</p>
          </section>

          <section style={card}>
            <h2>🌶️ Spicy Cup</h2>
            <p>Cup winners will be displayed here.</p>
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
  maxWidth: 1100,
  margin: "0 auto",
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 20,
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
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
  gap: 18,
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
}