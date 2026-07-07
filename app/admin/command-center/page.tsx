import Link from "next/link"

const FOUNDATIONS = [
  { name: "Players", priority: "Critical", status: "In Progress", tested: "No", notes: "Global players, imports, memberships" },
  { name: "Scheduling", priority: "Critical", status: "In Progress", tested: "No", notes: "Stroke setup started" },
  { name: "Results", priority: "Critical", status: "In Progress", tested: "No", notes: "Needs player_id wiring" },
  { name: "Standings", priority: "Critical", status: "Not Started", tested: "No", notes: "Auto standings needed" },
  { name: "Player Profiles", priority: "Critical", status: "Not Started", tested: "No", notes: "Basic profiles for 1.0" },
]

const FUTURE = [
  "KrysBot",
  "Tournament System",
  "Leaderboards",
  "Team Profiles",
  "Trophy Cases",
  "Play Zones",
  "Multilingual Scheduling",
  "Streaming Overlays",
  "Community Hub",
]

export default function CommandCenterPage() {
  return (
    <main style={page}>
      <div style={container}>
        <Link href="/admin" style={backButton}>← Back to Admin</Link>

        <h1 style={title}>Krys Central Command Center</h1>
        <p style={subtitle}>League Operating System · Version 1.0 Foundation</p>

        <section style={panel}>
          <h2>Current Mission</h2>
          <p style={mission}>
            Build a league that can run entirely from Krys Central.
          </p>
        </section>

        <section style={panel}>
          <h2>Current Box</h2>
          <p><strong>League Foundation</strong></p>
          <p style={muted}>Players → Memberships → Scheduling → Results → Standings → Basic Profiles</p>
        </section>

        <section style={panel}>
          <h2>Foundation Board</h2>

          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>System</th>
                  <th style={th}>Priority</th>
                  <th style={th}>Status</th>
                  <th style={th}>Tested</th>
                  <th style={th}>Notes</th>
                </tr>
              </thead>

              <tbody>
                {FOUNDATIONS.map((item) => (
                  <tr key={item.name}>
                    <td style={td}>{item.name}</td>
                    <td style={td}>{item.priority}</td>
                    <td style={td}>{item.status}</td>
                    <td style={td}>{item.tested}</td>
                    <td style={td}>{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={panel}>
          <h2>Future Ideas / Later Boxes</h2>
          <div style={ideaGrid}>
            {FUTURE.map((idea) => (
              <div key={idea} style={ideaCard}>{idea}</div>
            ))}
          </div>
        </section>
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
  maxWidth: 1200,
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

const title: React.CSSProperties = {
  fontSize: 38,
  marginBottom: 6,
}

const subtitle: React.CSSProperties = {
  color: "#aaa",
  marginBottom: 24,
}

const panel: React.CSSProperties = {
  marginTop: 20,
  padding: 18,
  border: "1px solid #333",
  borderRadius: 14,
  background: "#111",
}

const mission: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
}

const muted: React.CSSProperties = {
  color: "#aaa",
}

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 800,
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #555",
}

const td: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #333",
}

const ideaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
}

const ideaCard: React.CSSProperties = {
  padding: 14,
  border: "1px solid #333",
  borderRadius: 10,
  background: "#050505",
}