"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

const DIVISIONS = [
  "Amateur D1",
  "Semi Pro D1",
  "Pro D1",
  "Pro D2",
  "Pro D3",
]

type Standing = {
  player: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  rank: number
}

export default function AmateurProStandingsPage() {
  const [division, setDivision] = useState("Amateur D1")
  const [season, setSeason] = useState("59")
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false

    void fetch(
      `/api/amateur-pro/public-standings?division=${encodeURIComponent(division)}&season=${encodeURIComponent(season)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const payload = (await response.json()) as { standings?: Standing[]; message?: string }
        if (!response.ok) throw new Error(payload.message || "Standings are temporarily unavailable.")
        return payload.standings || []
      })
      .then((rows) => {
        if (cancelled) return
        setStandings(rows)
        setMessage(rows.length === 0 ? "No saved standings found for this division and season." : "")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStandings([])
        setMessage(error instanceof Error ? error.message : "Standings are temporarily unavailable.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [division, season])

  return (
    <main style={page}>
      <div style={container}>
        <Link href="/amateur-pro" style={backButton}>
          ← Amateur → Pro
        </Link>

        <section style={hero}>
          <h1 style={title}>⭐ Amateur → Pro Standings</h1>

          <p style={subtitle}>
            View current saved standings for Amateur → Pro divisions.
          </p>

          <div style={controls}>
            <div>
              <label style={label}>Division</label>

              <select
                value={division}
                onChange={(event) => {
                  setDivision(event.target.value)
                  setLoading(true)
                  setMessage("")
                }}
                style={input}
              >
                {DIVISIONS.map((divisionName) => (
                  <option key={divisionName} value={divisionName}>
                    {divisionName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={label}>Season</label>

              <input
                value={season}
                onChange={(event) => {
                  setSeason(event.target.value)
                  setLoading(true)
                  setMessage("")
                }}
                style={input}
              />
            </div>
          </div>
        </section>

        {loading ? (
          <div style={messageCard}>Loading standings...</div>
        ) : standings.length === 0 ? (
          <div style={messageCard}>{message}</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Rank</th>
                  <th style={th}>Player</th>
                  <th style={th}>Played</th>
                  <th style={th}>Wins</th>
                  <th style={th}>Draws</th>
                  <th style={th}>Losses</th>
                  <th style={th}>Points</th>
                </tr>
              </thead>

              <tbody>
                {standings.map((row, index) => (
                  <tr key={`${row.rank}-${row.player}-${index}`}>
                    <td style={td}>{row.rank}</td>
                    <td style={playerCell}>{row.player}</td>
                    <td style={td}>{row.played}</td>
                    <td style={td}>{row.wins}</td>
                    <td style={td}>{row.draws}</td>
                    <td style={td}>{row.losses}</td>
                    <td style={playerCell}>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

const controls: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginTop: 20,
}

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontWeight: 700,
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  background: "#0f172a",
  color: "white",
  border: "1px solid #475569",
  borderRadius: 10,
  fontSize: 17,
}

const messageCard: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  textAlign: "center",
  color: "#cbd5e1",
}

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 12,
}

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 680,
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 12,
  borderBottom: "1px solid #475569",
}

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #334155",
}

const playerCell: React.CSSProperties = {
  ...td,
  fontWeight: 800,
}
