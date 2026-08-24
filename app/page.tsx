
import Link from "next/link"
import MyProfileLink from "@/components/MyProfileLink"
import { KWT_PUBLIC_URL, MONTHLY_PUBLIC_URL } from "@/lib/externalCompetitionSites"

export default function HomePage() {
  return (
    <main style={page}>
      <div style={container}>
        <section style={hero}>
          <img
            src="/league-media/BIG LOGO TRANSPARENT.png"
            alt="Krys Leagues"
            style={logo}
          />

          <h1 style={title}>Krys Leagues</h1>

          <p style={subtitle}>
            Walkabout Mini Golf leagues, tournaments, standings, and player
            history.
          </p>

          <div style={buttonGrid}>
            <Link href="/join" style={primaryButton}>
              Join Leagues
            </Link>

            <Link href="/dashboard" style={button}>
              Player Dashboard
            </Link>

            <MyProfileLink style={button} />

            <Link href="/league-play" style={button}>
              League Play
            </Link>

            <Link href="/standings" style={button}>
              Stroke Standings
            </Link>

            <Link href="/players" style={button}>
              Browse Player Profiles
            </Link>

            <a href={KWT_PUBLIC_URL} target="_blank" rel="noreferrer" style={button}>
              KWT
            </a>

            <a href={MONTHLY_PUBLIC_URL} target="_blank" rel="noreferrer" style={button}>Kry&apos;s Monthly</a>
<Link href="/tournaments" style={button}>
  Bracket Tournaments
</Link>

<Link href="/leaderboards" style={button}>
  Overall Leaderboards
</Link>

<Link href="/invitationals" style={button}>
  Invitationals
</Link>

<Link href="/records" style={button}>
  League Records
</Link>

            <Link href="/champions" style={button}>
              Trophy Case
            </Link>
          </div>
        </section>

        <Link href="/admin" style={adminButton}>
          Admin Login
        </Link>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
  display: "flex",
  justifyContent: "center",
  padding: "30px 18px",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 900,
}

const hero: React.CSSProperties = {
  textAlign: "center",
  padding: "48px 24px",
  background: "rgba(2, 6, 23, 0.88)",
  border: "1px solid #334155",
  borderRadius: 24,
  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
}

const logo: React.CSSProperties = {
  width: "min(220px, 70vw)",
  height: "auto",
  display: "block",
  margin: "0 auto 24px",
  objectFit: "contain",
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(42px, 9vw, 72px)",
  lineHeight: 1,
  fontWeight: 900,
}

const subtitle: React.CSSProperties = {
  maxWidth: 650,
  margin: "20px auto 30px",
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.6,
}

const buttonGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
}

const primaryButton: React.CSSProperties = {
  padding: "16px 20px",
  background: "#16a34a",
  color: "white",
  borderRadius: 12,
  textDecoration: "none",
  fontSize: 18,
  fontWeight: 800,
}

const button: React.CSSProperties = {
  padding: "16px 20px",
  background: "#1e293b",
  border: "1px solid #475569",
  color: "white",
  borderRadius: 12,
  textDecoration: "none",
  fontSize: 18,
  fontWeight: 700,
}

const adminButton: React.CSSProperties = {
  display: "block",
  width: "fit-content",
  margin: "20px auto 0",
  color: "#94a3b8",
  textDecoration: "none",
  fontWeight: 700,
}
