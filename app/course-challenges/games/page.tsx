import Link from "next/link"

export default function CourseChallengeGamesPage() {
  return <main style={page}>
    <div style={shell}>
      <nav style={nav}>
        <Link href="/course-challenges" style={link}>← Course Challenges</Link>
        <Link href="/" style={link}>← Krys Leagues</Link>
      </nav>
      <h1>COURSE CHALLENGE GAMES</h1>
      <section style={notice} aria-live="polite">
        <p>Course Challenge games are currently available through Discord.</p>
      </section>
    </div>
  </main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: "28px 18px 72px", background: "#07111f", color: "#f8fafc" }
const shell: React.CSSProperties = { width: "min(1100px, 100%)", margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 24 }
const link: React.CSSProperties = { color: "#c4b5fd", fontWeight: 800 }
const notice: React.CSSProperties = { maxWidth: 760, marginTop: 24, padding: "22px 24px", border: "1px solid #334155", borderRadius: 16, background: "#0f1d31", color: "#e2e8f0", lineHeight: 1.55 }
