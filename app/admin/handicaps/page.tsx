"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type Row = { playerName: string; handicapIndex: number | null; roundsCount: number; status: string }
type Payload = { rows?: Row[]; ratings?: Array<{ course_name: string; difficulty: string; course_rating: number; slope_rating: number; source: string }>; migrationRequired?: boolean; message?: string }

export default function HandicapsAdminPage() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [message, setMessage] = useState("Loading protected handicap audit data…")

  useEffect(() => {
    let active = true
    fetch("/api/admin/handicaps", { cache: "no-store" })
      .then(async (response) => {
        const next = await response.json() as Payload
        if (!response.ok) throw new Error(next.message || "Handicap audit data unavailable.")
        if (active) { setPayload(next); setMessage("") }
      })
      .catch((error: Error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [])

  return (
    <main style={page}>
      <h1 style={title}>Handicaps</h1>
      <p style={subtitle}>Protected, read-only audit view. Handicap Indexes come from stored qualifying rounds; there is no manual total editor.</p>
      {message && <p style={notice}>{message}</p>}
      {payload?.migrationRequired && <p style={notice}>The forward-only handicap storage migration is prepared but has not been run. No ratings or new qualifying rounds are being invented in Preview.</p>}
      <section style={card}><h2 style={heading}>Current Handicap Index</h2>{payload?.rows?.length ? <div style={tableWrap}><table style={table}><thead><tr><th style={cell}>Player</th><th style={cell}>Index</th><th style={cell}>Rounds</th><th style={cell}>Status</th></tr></thead><tbody>{payload.rows.map((row) => <tr key={row.playerName}><td style={cell}>{row.playerName}</td><td style={cell}>{row.handicapIndex == null ? "—" : row.handicapIndex.toFixed(1)}</td><td style={cell}>{row.roundsCount}</td><td style={cell}>{row.status}</td></tr>)}</tbody></table></div> : <p style={muted}>No stored Handicap Index rows are available.</p>}</section>
      <section style={card}><h2 style={heading}>Course Ratings and Slopes</h2>{payload?.ratings?.length ? <div style={tableWrap}><table style={table}><thead><tr><th style={cell}>Course</th><th style={cell}>Difficulty</th><th style={cell}>CR</th><th style={cell}>Slope</th><th style={cell}>Source</th></tr></thead><tbody>{payload.ratings.map((rating) => <tr key={`${rating.course_name}-${rating.difficulty}`}><td style={cell}>{rating.course_name}</td><td style={cell}>{rating.difficulty}</td><td style={cell}>{rating.course_rating}</td><td style={cell}>{rating.slope_rating}</td><td style={cell}>{rating.source}</td></tr>)}</tbody></table></div> : <p style={muted}>No authoritative Course Rating/Slope values are loaded. Rounds without both values are rejected by the calculator.</p>}</section>
      <Link href="/admin" style={link}>Back to Admin Home</Link>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#09090b", color: "#fafafa", padding: 24 }
const title: React.CSSProperties = { fontSize: 34, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#a1a1aa", maxWidth: 760, lineHeight: 1.6 }
const notice: React.CSSProperties = { marginTop: 18, padding: 14, border: "1px solid #854d0e", background: "#271b08", borderRadius: 12, color: "#fde68a" }
const card: React.CSSProperties = { marginTop: 18, padding: 18, borderRadius: 14, border: "1px solid #27272a", background: "#111113" }
const heading: React.CSSProperties = { fontSize: 20, marginTop: 0 }
const muted: React.CSSProperties = { color: "#a1a1aa" }
const link: React.CSSProperties = { display: "inline-block", marginTop: 20, color: "#93c5fd" }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { borderCollapse: "collapse", width: "100%", minWidth: 560 }
const cell: React.CSSProperties = { borderBottom: "1px solid #27272a", padding: "12px 10px", textAlign: "left" }
