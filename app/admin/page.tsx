"use client"

import Link from "next/link"

const LEAGUES = [
  { name: "KWT League", href: "/admin/kwt", description: "KWT imports, scoring, seasons, active games" },
  { name: "Stroke Play", href: "/admin/stroke", description: "Stroke play seasons, scoring, active games" },
  { name: "Match Play", href: "/admin/match", description: "Match play seasons, scoring, standings" },
  { name: "Pick Your Poison", href: "/admin/pyp", description: "PYP setup, scoring, active games" },
  { name: "Pro League", href: "/admin/pro", description: "Pro, Semi Pro and Amateur league management" },
  { name: "Doubles", href: "/admin/doubles", description: "Doubles seasons, scoring and standings" },
  { name: "Solo", href: "/admin/solo", description: "Solo league management" },
  { name: "Skins", href: "/admin/skins", description: "Skins seasons, scoring, active games" },
  { name: "Spicy", href: "/admin/spicy", description: "Spicy tournament tracking" },
  { name: "Krys Tourney", href: "/admin/krys-tourney", description: "Tournament setup and tracking" },
  { name: "Champion of Champions", href: "/admin/champion-of-champions", description: "Champion event tracking" },
  { name: "Four Majors", href: "/admin/majors", description: "Major event signup, entrants, public details and streaming" },
]

const GLOBAL_TOOLS = [
  { name: "Command Center", href: "/admin/command-center", description: "Krys Central project board and roadmap" },
  { name: "Players", href: "/admin/players", description: "Global player list, statuses, merge tools" },
  { name: "Player Identity", href: "/admin/player-identity", description: "Aliases, Discord identities, historical names and player matching" },
  { name: "Season Manager", href: "/admin/season-manager", description: "Create, activate, archive and manage seasons" },
  { name: "Player Tracker", href: "/admin/player-tracker", description: "Track player movement and history" },
  { name: "Records Center", href: "/admin/records", description: "League, course, race and historical records" },
  { name: "All-Time Leaderboards", href: "/admin/leaderboards", description: "Overall rankings across all leagues" },
  { name: "Race Mode Leaderboards", href: "/admin/race", description: "Race mode rankings and records" },
  { name: "Combined Course Records", href: "/admin/records/combined", description: "Easy + Hard all-time bragging rights" },
  { name: "Handicaps", href: "/admin/handicaps", description: "Player handicap tracking" },
  { name: "Career Stats", href: "/admin/career", description: "Career results across leagues" },
  { name: "Awards & Badges", href: "/admin/awards", description: "Manage awards, badges and achievements" },
  { name: "Trophy Manager", href: "/admin/trophies", description: "Manage league trophies and displays" },
  { name: "Analytics", href: "/admin/analytics", description: "League statistics and reporting" },
]

export default function Admin() {
  return (
    <main style={page}>
      <h1 style={title}>Admin Dashboard</h1>
      <p style={subtitle}>Choose a league or global admin tool.</p>

      <section style={section}>
        <h2 style={sectionTitle}>Leagues</h2>
        <div style={grid}>
          {LEAGUES.map((item) => (
            <Link key={item.href} href={item.href} style={card}>
              <strong style={cardTitle}>{item.name}</strong>
              <span style={cardText}>{item.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section style={section}>
        <h2 style={sectionTitle}>Global Tools</h2>
        <div style={grid}>
          {GLOBAL_TOOLS.map((item) => (
            <Link key={item.href} href={item.href} style={card}>
              <strong style={cardTitle}>{item.name}</strong>
              <span style={cardText}>{item.description}</span>
            </Link>
          ))}
        </div>
      </section>
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

const section: React.CSSProperties = {
  marginTop: 28,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  marginBottom: 14,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const cardTitle: React.CSSProperties = {
  fontSize: 18,
}

const cardText: React.CSSProperties = {
  color: "#bdbdbd",
  fontSize: 14,
  lineHeight: 1.4,
}
