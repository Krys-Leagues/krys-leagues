"use client"

import Link from "next/link"

export default function DoublesStandingsPage() {
  return (
    <main style={page}>
      <div style={container}>
        <Link href="/doubles" style={backButton}>
          ← Doubles
        </Link>

        <section style={hero}>
          <h1 style={title}>👥 Doubles Standings</h1>

          <p style={subtitle}>
            Public Doubles standings will appear here by division and season.
          </p>
        </section>

        <section style={card}>
          <h2>Coming Soon</h2>

          <p>
            This page will display live Doubles standings after results are
            entered.
          </p>
        </section>
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

const card: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  color: "#cbd5e1",
}