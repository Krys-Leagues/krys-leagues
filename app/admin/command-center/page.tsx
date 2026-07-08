import Link from "next/link"

const BOARDS = [
  {
    title: "1.0 Foundation",
    items: [
      { system: "Players", priority: "Critical", status: "In Progress", tested: "No", owner: "Us", notes: "Imports, search, memberships started. Needs profile cleanup." },
      { system: "League Memberships", priority: "Critical", status: "In Progress", tested: "Partial", owner: "Us", notes: "Players can belong to multiple leagues/seasons/divisions. Duplicate protection complete." },
      { system: "Scheduling", priority: "Critical", status: "In Progress", tested: "No", owner: "Us", notes: "Stroke setup started. Needs edit/publish/player view." },
      { system: "Results", priority: "Critical", status: "Complete", tested: "Yes", owner: "Us", notes: "player_id wiring completed. Ready for live save testing." },
      { system: "Standings", priority: "Critical", status: "In Progress", tested: "Partial", owner: "Us", notes: "Database foundation complete. Standings engine next." },
      { system: "Basic Player Profiles", priority: "Critical", status: "Not Started", tested: "No", owner: "Us", notes: "Current leagues, season record, career totals." },
    ],
  },
  {
    title: "1.1 Growth",
    items: [
      { system: "KrysBot", priority: "High", status: "Planned", tested: "No", owner: "Later", notes: "Replace webhooks. Posting, roles, threads, cleanup." },
      { system: "Tournament System", priority: "High", status: "Planned", tested: "Partial", owner: "Later", notes: "Duplicate entry protection complete. Brackets, rules, scoring, past tournament pages later." },
      { system: "Leaderboards", priority: "High", status: "Planned", tested: "No", owner: "Later", notes: "Stroke, race, solo, map, KWT, pro, bank shot later." },
      { system: "Team Profiles", priority: "High", status: "Planned", tested: "No", owner: "Later", notes: "Team history, team trophies, overlapping players allowed." },
      { system: "Trophy Cases", priority: "High", status: "Planned", tested: "No", owner: "Later", notes: "Player and team visual trophy galleries." },
    ],
  },
  {
    title: "2.0 Ecosystem",
    items: [
      { system: "Play Zones", priority: "High", status: "Planned", tested: "No", owner: "Later", notes: "Preferred playing windows, not just time zones." },
      { system: "Multilingual Support", priority: "High", status: "Planned", tested: "No", owner: "Later", notes: "Player language preferences and translated scheduling." },
      { system: "Streaming Overlays", priority: "Medium", status: "Planned", tested: "No", owner: "Later", notes: "Custom OBS/browser overlays and scoreboard tools." },
      { system: "Community Hub", priority: "Medium", status: "Future", tested: "No", owner: "Later", notes: "Podcast, polls, articles, server links, videos." },
      { system: "Stream Deck Automation", priority: "Medium", status: "Future", tested: "No", owner: "Later", notes: "Reusable profiles and faster stream setup." },
    ],
  },
]

const QUICK_LINKS = [
  { label: "Admin Home", href: "/admin" },
  { label: "Players", href: "/admin/players" },
  { label: "Stroke Setup", href: "/admin/stroke/setup" },
  { label: "Stroke Results", href: "/admin/stroke/results" },
  { label: "Stroke Standings", href: "/admin/stroke/standings" },
]

export default function CommandCenterPage() {
  return (
    <main style={page}>
      <div style={container}>
        <Link href="/admin" style={backButton}>← Back to Admin</Link>

        <section style={hero}>
          <p style={eyebrow}>Krys Central</p>
          <h1 style={title}>Command Center</h1>
          <p style={subtitle}>League Operating System · Version 1.0 Foundation</p>
        </section>

        <section style={gridTop}>
          <div style={missionCard}>
            <h2 style={cardTitle}>Current Mission</h2>
            <p style={mission}>Build a league that can run entirely from Krys Central.</p>
          </div>

          <div style={missionCard}>
            <h2 style={cardTitle}>Current Box</h2>
            <p style={mission}>Foundation Audit → Players → Scheduling → Results → Standings</p>
          </div>
        </section>

        <section style={panel}>
          <h2 style={sectionTitle}>Quick Links</h2>
          <div style={linkGrid}>
            {QUICK_LINKS.map((link) => (
              <Link key={link.href} href={link.href} style={quickLink}>
                {link.label}
              </Link>
            ))}
          </div>
        </section>

        {BOARDS.map((board) => (
          <section key={board.title} style={panel}>
            <h2 style={sectionTitle}>{board.title}</h2>

            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>System</th>
                    <th style={th}>Priority</th>
                    <th style={th}>Status</th>
                    <th style={th}>Tested</th>
                    <th style={th}>Owner</th>
                    <th style={th}>Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {board.items.map((item) => (
                    <tr key={item.system}>
                      <td style={tdStrong}>{item.system}</td>
                      <td style={td}>{item.priority}</td>
                      <td style={td}>{item.status}</td>
                      <td style={td}>{item.tested}</td>
                      <td style={td}>{item.owner}</td>
                      <td style={td}>{item.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  padding: 24,
}

const container: React.CSSProperties = {
  maxWidth: 1300,
  margin: "0 auto",
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 20,
  color: "white",
  textDecoration: "none",
  border: "1px solid #555",
  borderRadius: 8,
  padding: "8px 12px",
}

const hero: React.CSSProperties = {
  padding: 24,
  border: "1px solid #333",
  borderRadius: 18,
  background: "linear-gradient(135deg, #111, #050505)",
}

const eyebrow: React.CSSProperties = {
  color: "#60a5fa",
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: "uppercase",
  margin: 0,
}

const title: React.CSSProperties = {
  fontSize: 44,
  margin: "6px 0",
}

const subtitle: React.CSSProperties = {
  color: "#aaa",
  margin: 0,
}

const gridTop: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  marginTop: 20,
}

const missionCard: React.CSSProperties = {
  padding: 18,
  border: "1px solid #333",
  borderRadius: 14,
  background: "#111",
}

const cardTitle: React.CSSProperties = {
  marginTop: 0,
}

const mission: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
}

const panel: React.CSSProperties = {
  marginTop: 20,
  padding: 18,
  border: "1px solid #333",
  borderRadius: 14,
  background: "#111",
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
}

const linkGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
}

const quickLink: React.CSSProperties = {
  padding: 14,
  border: "1px solid #333",
  borderRadius: 10,
  background: "#050505",
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1000,
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #555",
  color: "#ddd",
}

const td: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #333",
  color: "#ddd",
  verticalAlign: "top",
}

const tdStrong: React.CSSProperties = {
  ...td,
  color: "white",
  fontWeight: 800,
}