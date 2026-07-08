"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const DIVISIONS = ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"]

type ResultRow = {
  player1: string
  player2: string
  player1_id: string | null
  player2_id: string | null
  player1_score: number | null
  player2_score: number | null
  winner: string | null
  is_draw: boolean | null
}

type Standing = {
  player: string
  player_id: string | null
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  strokes: number
  rank: number
}

export default function StrokeStandingsPage() {
  const router = useRouter()

  const [division, setDivision] = useState("Stroke D1")
  const [season, setSeason] = useState("59")
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadStandings()
  }, [division, season])

  function ensurePlayer(map: Map<string, Standing>, player: string, playerId: string | null) {
    const key = playerId || player

    if (!map.has(key)) {
      map.set(key, {
        player,
        player_id: playerId,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        strokes: 0,
        rank: 0,
      })
    }
  }

  async function loadStandings() {
    const seasonNumber = Number(season)

    if (!seasonNumber) {
      alert("Invalid season")
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from("results")
      .select("player1, player2, player1_id, player2_id, player1_score, player2_score, winner, is_draw")
      .eq("league_type", "stroke")
      .eq("division", division)
      .eq("season_number", seasonNumber)

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    const table = new Map<string, Standing>()

    ;((data || []) as ResultRow[]).forEach((row) => {
      if (row.player1_score === null || row.player2_score === null) return

      ensurePlayer(table, row.player1, row.player1_id)
      ensurePlayer(table, row.player2, row.player2_id)

      const p1 = table.get(row.player1_id || row.player1)!
      const p2 = table.get(row.player2_id || row.player2)!

      p1.played += 1
      p2.played += 1

      p1.strokes += Number(row.player1_score)
      p2.strokes += Number(row.player2_score)

      if (row.is_draw || row.player1_score === row.player2_score) {
        p1.draws += 1
        p2.draws += 1
        p1.points += 1
        p2.points += 1
        return
      }

      if (row.winner === row.player1 || row.player1_score < row.player2_score) {
        p1.wins += 1
        p2.losses += 1
        p1.points += 3
        return
      }

      if (row.winner === row.player2 || row.player2_score < row.player1_score) {
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

    setStandings(
      sorted.map((row, index) => ({
        ...row,
        rank: index + 1,
      }))
    )
  }

  async function saveStandings() {
    const seasonNumber = Number(season)

    if (!seasonNumber) {
      alert("Invalid season")
      return
    }

    const missingIds = standings.filter((row) => !row.player_id)

    if (missingIds.length > 0) {
      alert("Some standings are missing player IDs. Fix player wiring before saving.")
      return
    }

    const rows = standings.map((row) => ({
      player_id: row.player_id,
      league_type: "stroke",
      season_number: seasonNumber,
      division,
      points: row.points,
      wins: row.wins,
      losses: row.losses,
      ties: row.draws,
      strokes: row.strokes,
      rank: row.rank,
      updated_at: new Date().toISOString(),
    }))

    if (rows.length === 0) {
      alert("No standings to save")
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from("season_standings")
      .upsert(rows, {
        onConflict: "player_id,league_type,season_number,division",
      })

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    alert("Stroke standings saved ✔")
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button onClick={() => router.push("/admin/stroke")} style={backButton}>
            ← Back to Stroke
          </button>

          <button onClick={saveStandings} disabled={saving || standings.length === 0} style={saveButton}>
            {saving ? "Saving..." : "Save Standings"}
          </button>
        </div>

        <h1 style={title}>Stroke Standings</h1>

        <div style={controls}>
          <select value={division} onChange={(e) => setDivision(e.target.value)} style={input}>
            {DIVISIONS.map((div) => (
              <option key={div} value={div}>{div}</option>
            ))}
          </select>

          <input value={season} onChange={(e) => setSeason(e.target.value)} style={input} />

          <button onClick={loadStandings} disabled={loading} style={button}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

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
              <th style={th}>Strokes</th>
            </tr>
          </thead>

          <tbody>
            {standings.map((row) => (
              <tr key={row.player_id || row.player}>
                <td style={td}>{row.rank}</td>
                <td style={tdStrong}>{row.player}</td>
                <td style={td}>{row.played}</td>
                <td style={td}>{row.wins}</td>
                <td style={td}>{row.draws}</td>
                <td style={td}>{row.losses}</td>
                <td style={tdStrong}>{row.points}</td>
                <td style={td}>{row.strokes}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  maxWidth: 1100,
  margin: "0 auto",
}

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
}

const title: React.CSSProperties = {
  fontSize: 38,
  marginTop: 24,
}

const controls: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 20,
}

const input: React.CSSProperties = {
  background: "#111",
  color: "white",
  border: "1px solid #555",
  padding: 10,
  borderRadius: 8,
}

const button: React.CSSProperties = {
  background: "#2563eb",
  border: "none",
  padding: "10px 16px",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const saveButton: React.CSSProperties = {
  ...button,
  background: "#16a34a",
}

const backButton: React.CSSProperties = {
  ...button,
  background: "#333",
}

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 16,
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

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 800,
}