import Link from "next/link"

const BOARDS = [
  {
    title: "1.0 Foundation",
    items: [
      {
        system: "Players",
        priority: "Critical",
        status: "In Progress",
        tested: "Partial",
        owner: "Us",
        notes:
          "Imports, search, memberships, merge tools, public dashboard, and admin player management are started. Full public profiles still need career data.",
      },
      {
        system: "League Memberships",
        priority: "Critical",
        status: "In Progress",
        tested: "Partial",
        owner: "Us",
        notes:
          "Players can belong to multiple leagues, seasons, and divisions. Duplicate protection and indexes are complete.",
      },
      {
        system: "Scheduling",
        priority: "Critical",
        status: "In Progress",
        tested: "Partial",
        owner: "Us",
        notes:
          "Schedule management, public match viewing, Discord posting, and match generation exist. Editing and publishing workflow still needs polish.",
      },
      {
        system: "Results",
        priority: "Critical",
        status: "Complete",
        tested: "Yes",
        owner: "Us",
        notes:
          "Player ID wiring, result protection, result entry, and lookup indexes are complete.",
      },
      {
        system: "Standings",
        priority: "Critical",
        status: "Complete",
        tested: "Yes",
        owner: "Us",
        notes:
          "Saved standings, recalculation, and public pages for Stroke, Match Play, Doubles, PYP, and Amateur to Pro are complete.",
      },
      {
        system: "Seasons",
        priority: "Critical",
        status: "Foundation Complete",
        tested: "Partial",
        owner: "Us",
        notes:
          "Seasons table includes dates, lock flag, unique season protection, and lookup indexes.",
      },
      {
        system: "Basic Player Profiles",
        priority: "Critical",
        status: "In Progress",
        tested: "Partial",
        owner: "Us",
        notes:
          "Public player landing page and dashboard exist. Full career totals, league history, trophies, and achievements remain.",
      },
      {
        system: "Handicaps",
        priority: "High",
        status: "Foundation Started",
        tested: "No",
        owner: "Us",
        notes:
          "Admin landing page created. Handicap calculations, adjustments, and history still need to be built.",
      },
      {
        system: "Career Statistics",
        priority: "High",
        status: "Foundation Started",
        tested: "No",
        owner: "Us",
        notes:
          "Admin landing page created. Career totals, trophy history, and cross-league history still need data wiring.",
      },
    ],
  },
  {
    title: "1.1 Growth",
    items: [
      {
        system: "KrysBot",
        priority: "High",
        status: "Planned",
        tested: "No",
        owner: "Later",
        notes:
          "Replace webhooks with full posting, roles, threads, scheduling, and cleanup automation.",
      },
      {
        system: "Tournament System",
        priority: "High",
        status: "In Progress",
        tested: "Partial",
        owner: "Us",
        notes:
          "Tournament pages, registration, qualification rules, and admin foundations exist. Live brackets and historical data remain.",
      },
      {
        system: "Leaderboards",
        priority: "High",
        status: "Planned",
        tested: "No",
        owner: "Later",
        notes:
          "Overall, Stroke, race, solo, map, KWT, Pro, and bank-shot leaderboards remain.",
      },
      {
        system: "Team Profiles",
        priority: "High",
        status: "Planned",
        tested: "No",
        owner: "Later",
        notes:
          "Team history, team trophies, and overlapping-player support remain.",
      },
      {
        system: "Trophy Cases",
        priority: "High",
        status: "In Progress",
        tested: "Partial",
        owner: "Us",
        notes:
          "Hall of Champions exists with the first Champion of Champions trophy and 2026 winner BLUTES87. Other trophies and winners remain.",
      },
      {
        system: "Records",
        priority: "High",
        status: "Foundation Started",
        tested: "Partial",
        owner: "Us",
        notes:
          "Public records landing page and combined-course admin records exist. Career and season record data remain.",
      },
    ],
  },
  {
    title: "2.0 Ecosystem",
    items: [
      {
        system: "Play Zones",
        priority: "High",
        status: "Planned",
        tested: "No",
        owner: "Later",
        notes:
          "Preferred playing windows rather than only time-zone storage.",
      },
      {
        system: "Multilingual Support",
        priority: "High",
        status: "Planned",
        tested: "No",
        owner: "Later",
        notes:
          "Player language preferences and translated scheduling.",
      },
      {
        system: "Streaming Overlays",
        priority: "Medium",
        status: "Planned",
        tested: "No",
        owner: "Later",
        notes:
          "Custom OBS and browser overlays with scoreboard tools.",
      },
      {
        system: "Community Hub",
        priority: "Medium",
        status: "Future",
        tested: "No",
        owner: "Later",
        notes:
          "Podcast, polls, articles, server links, and videos.",
      },
      {
        system: "Stream Deck Automation",
        priority: "Medium",
        status: "Future",
        tested: "No",
        owner: "Later",
        notes:
          "Reusable profiles and faster stream setup.",
      },
    ],
  },
]

const QUICK_LINKS = [
  { label: "Admin Home", href: "/admin" },
  { label: "Players", href: "/admin/players" },
  { label: "Handicaps", href: "/admin/handicaps" },
  { label: "Career Stats", href: "/admin/career" },
  { label: "Stroke Setup", href: "/admin/stroke/setup" },
  { label: "Stroke Results", href: "/admin/stroke/results" },
  { label: "Stroke Standings", href: "/admin/stroke/standings" },
  { label: "Combined Records", href: "/admin/records/combined" },
]

export default function CommandCenterPage() {
  return (
    <main style={page}>
      <div style={container}>
        <Link href="/admin" style={backButton}>
          ← Back to Admin
        </Link>

        <section style={hero}>
          <p style={eyebrow}>Krys Central</p>
          <h1 style={title}>Command Center</h1>
          <p style={subtitle}>
            League Operating System · Version 1.0 Foundation
          </p>
        </section>

        <section style={gridTop}>
          <div style={missionCard}>
            <h2 style={cardTitle}>Current Mission</h2>
            <p style={mission}>
              Build a league that can run entirely from Krys Central.
            </p>
          </div>

          <div style={missionCard}>
            <h2 style={cardTitle}>Current Box</h2>
            <p style={mission}>
              Public league foundations complete → Admin systems and player
              history in progress
            </p>
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