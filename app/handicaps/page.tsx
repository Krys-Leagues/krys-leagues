"use client"

import { useEffect, useState } from "react"

type LadderRow = { playerName: string; handicapIndex: number | null; roundsCount: number; status: string }

export default function HandicapsPage() {
  const [rows, setRows] = useState<LadderRow[]>([])
  const [message, setMessage] = useState("Loading the read-only handicap ladder…")

  useEffect(() => {
    let active = true
    fetch("/api/handicaps/public", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { rows?: LadderRow[]; message?: string }
        if (!response.ok) throw new Error(payload.message || "Handicap ladder unavailable.")
        if (active) {
          setRows(payload.rows || [])
          setMessage(payload.rows?.length ? "Current Handicap Index values from qualifying rounds." : "No Handicap Index values are available yet.")
        }
      })
      .catch((error: Error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [])

  return (
    <main style={page}>
      <p style={eyebrow}>KRYS LEAGUES</p>
      <h1 style={title}>Handicap Ladder</h1>
      <p style={subtitle}>Read-only Handicap Index values calculated from eligible KWT, league, and forward-only All-Time rounds.</p>
      <section style={card}>
        <p style={messageText}>{message}</p>
        {rows.length > 0 && <div style={tableWrap}><table style={table}><thead><tr><th style={cell}>Player</th><th style={cell}>Handicap Index</th><th style={cell}>Rounds</th><th style={cell}>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.playerName}><td style={cell}>{row.playerName}</td><td style={cell}>{row.handicapIndex == null ? "—" : row.handicapIndex.toFixed(1)}</td><td style={cell}>{row.roundsCount}</td><td style={cell}>{row.status}</td></tr>)}</tbody></table></div>}
      </section>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#09090b", color: "#fafafa", padding: "48px 24px" }
const eyebrow: React.CSSProperties = { color: "#a1a1aa", letterSpacing: "0.16em", fontSize: 12 }
const title: React.CSSProperties = { fontSize: 42, margin: "8px 0" }
const subtitle: React.CSSProperties = { color: "#a1a1aa", maxWidth: 720, lineHeight: 1.6 }
const card: React.CSSProperties = { marginTop: 28, border: "1px solid #27272a", borderRadius: 16, background: "#111113", padding: 20, maxWidth: 960 }
const messageText: React.CSSProperties = { color: "#d4d4d8" }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { borderCollapse: "collapse", width: "100%", minWidth: 560 }
const cell: React.CSSProperties = { borderBottom: "1px solid #27272a", padding: "12px 10px", textAlign: "left" }
