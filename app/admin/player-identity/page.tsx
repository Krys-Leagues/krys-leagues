"use client"

import Link from "next/link"

export default function PlayerIdentityPage() {
  return (
    <main style={page}>
      <h1 style={title}>Player Identity Manager</h1>

      <p style={subtitle}>
        Manage player identities, aliases, Discord links, and historical names.
      </p>

      <div style={grid}>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>View all player profiles.</span>
        </Link>

        <Link href="/admin/players/merge" style={card}>
          <strong>Merge Players</strong>
          <span>Merge duplicate player profiles.</span>
        </Link>

        <div style={card}>
          <strong>Aliases</strong>
          <span>Coming Soon</span>
        </div>

        <div style={card}>
          <strong>Discord Links</strong>
          <span>Coming Soon</span>
        </div>

        <div style={card}>
          <strong>Historical Names</strong>
          <span>Coming Soon</span>
        </div>

        <Link href="/admin" style={card}>
          <strong>Back to Admin</strong>
          <span>Return to Admin Dashboard.</span>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(250px,1fr))",
  gap: 16,
}

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 20,
  borderRadius: 12,
  background: "#111",
  border: "1px solid #333",
  color: "white",
  textDecoration: "none",
}