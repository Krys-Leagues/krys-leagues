"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const DIVISIONS = ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"]

type ResultRow = {
  player1: string
  player2: string
  player1_score: number
  player2_score: number
  winner: string | null
  is_draw: boolean | null
}

type Standing = {
  player: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  strokes: number
}

export default function StrokeStandingsPage() {
  const router = useRouter()

  const [division, setDivision] = useState("Stroke D1")
  const [season, setSeason] = useState("59")
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadStandings()
  }, [division, season])

  function ensurePlayer(map: Map<string, Standing>, player: string) {
    if (!map.has(player)) {
      map.set(player, {
        player,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        strokes: 0,
      })
    }
  }

  async function loadStandings() {
    setLoading(true)

    const { data, error } = await supabase
      .from("results")
      .select("player1, player2, player1_score, player2_score, winner, is_draw")
      .eq("league_type", "stroke")
      .eq("division", division)
      .eq("season_number", Number(season))

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    const table = new Map<string, Standing>()

    ;(data || []).forEach((row: ResultRow) => {
      ensurePlayer(table, row.player1)
      ensurePlayer(table, row.player2)

      const p1 = table.get(row.player1)!
      const p2 = table.get(row.player2)!

      p1.played += 1
      p2.played += 1

      p1.strokes += Number(row.player1_score)
      p2.strokes += Number(row.player2_score)

      if (row.is_draw) {
        p1.draws += 1
        p2.draws += 1
        p1.points += 1
        p2.points += 1
      } else if (row.winner === row.player1) {
        p1.wins += 1
        p2.losses += 1
        p1.points += 3
      } else if (row.winner === row.player2) {
        p2.wins += 1
        p1.losses += 1
        p2.points += 3
      }
    })

    const sorted = Array.from(table.values()).sort((a, b) => {
      return (
        b.points - a.points ||
        b.wins - a.wins ||
        a.strokes - b.strokes ||
        a.player.localeCompare(b.player)
      )
    })

    setStandings(sorted)
  }

  return (
    <main style={page}>
      <div style={container}>
        <button onClick={() => router.push("/admin")} style={backButton}>
          ← Back to Admin
        </button>

        <div style={card}>
          <h1 style={title}>Stroke Standings</h1>

          <div style={controls}>
            <select value={division} onChange={(e) => setDivision(e.target.value)} style={input}>
              {DIVISIONS.map((div) => (
                <option key={div}>{div}</option>
              ))}
            </select>

            <select value={season} onChange={(e) => setSeason(e.target.value)} style={input}>
              {Array.from({ length: 300 - 59 + 1 }, (_, i) => 59 + i).map((num) => (
                <option key={num} value={num}>
                  Season {num}
                </option>
              ))}
            </select>

            <button onClick={loadStandings} style={refreshButton}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Place</th>
                <th style={th}>Player</th>
                <th style={th}>Pts</th>
                <th style={th}>W</th>
                <th style={th}>D</th>
                <th style={th}>L</th>
                <th style={th}>Played</th>
                <th style={th}>Strokes</th>
              </tr>
            </thead>

            <tbody>
              {standings.map((row, index) => (
                <tr key={row.player}>
                  <td style={td}>{index + 1}</td>
                  <td style={playerTd}>{row.player}</td>
                  <td style={td}>{row.points}</td>
                  <td style={td}>{row.wins}</td>
                  <td style={td}>{row.draws}</td>
                  <td style={td}>{row.losses}</td>
                  <td style={td}>{row.played}</td>
                  <td style={td}>{row.strokes}</td>
                </tr>
              ))}

              {standings.length === 0 && (
                <tr>
                  <td style={emptyTd} colSpan={8}>
                    No results found yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  display: "flex",
  justifyContent: "center",
  color: "white",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  padding: 30,
}

const backButton: React.CSSProperties = {
  marginBottom: 20,
  padding: "8px 14px",
  background: "#222",
  border: "1px solid #555",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const card: React.CSSProperties = {
  background: "#050505",
  border: "1px solid #333",
  borderRadius: 18,
  padding: 28,
}

const title: React.CSSProperties = {
  fontSize: 36,
  marginBottom: 20,
}

const controls: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 24,
  flexWrap: "wrap",
}

const input: React.CSSProperties = {
  padding: 12,
  background: "#111",
  border: "1px solid #444",
  color: "white",
  borderRadius: 8,
  minWidth: 220,
}

const refreshButton: React.CSSProperties = {
  padding: "12px 18px",
  background: "#2563eb",
  border: "none",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
}

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
}

const th: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #444",
  padding: 12,
  color: "#ccc",
}

const td: React.CSSProperties = {
  borderBottom: "1px solid #222",
  padding: 12,
}

const playerTd: React.CSSProperties = {
  borderBottom: "1px solid #222",
  padding: 12,
  fontWeight: 800,
}

const emptyTd: React.CSSProperties = {
  padding: 20,
  color: "#aaa",
  textAlign: "center",
}