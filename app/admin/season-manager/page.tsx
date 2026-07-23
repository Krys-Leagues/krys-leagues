"use client"

import Link from "next/link"

export default function SeasonManagerPage() {
  return (
    <main style={page}>
      <h1 style={title}>Season Manager</h1>

      <p style={subtitle}>
        Create, activate, archive, and manage league seasons.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Create New Season</strong>
          <span>
            Create the next season for any league.
          </span>
        </section>

        <section style={card}>
          <strong>Active Seasons</strong>
          <span>
            Select which season is currently active.
          </span>
        </section>

        <section style={card}>
          <strong>Archive Seasons</strong>
          <span>
            Lock completed seasons and preserve historical standings.
          </span>
        </section>

        <section style={card}>
          <strong>Clone League Structure</strong>
          <span>
            Copy divisions and settings into a new season.
          </span>
        </section>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>Open the global player manager.</span>
        </Link>

        <Link href="/admin" style={card}>
          <strong>Back to Admin Home</strong>
          <span>Return to the main admin dashboard.</span>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
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