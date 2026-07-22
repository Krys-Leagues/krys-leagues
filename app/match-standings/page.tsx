"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const DIVISIONS = [
  "Match Play D1",
  "Match Play D2",
  "Match Play D3",
  "Match Play D4",
  "Match Play D5",
  "Match Play D6",
]

type StandingRow = {
  player_id: string
  points: number | null
  wins: number | null
  losses: number | null
  ties: number | null
  rank: number | null
}

type PlayerRow = {
  id: string
  screen_name: string
}

type Standing = {
  playerId: string
  player: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  rank: number
}

export default function MatchStandingsPage() {
  const [division, setDivision] = useState("Match Play D1")
  const [season, setSeason] = useState("59")
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    loadStandings()
  }, [division, season])

  async function loadStandings() {
    const seasonNumber = Number(season)

    if (!seasonNumber) {
      setStandings([])
      setMessage("Enter a valid season number.")
      return
    }

    setLoading(true)
    setMessage("")

    const { data, error } = await supabase
      .from("season_standings")
      .select("player_id, points, wins, losses, ties, rank")
      .eq("league_type", "match")
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .order("rank", { ascending: true })

    if (error) {
      setStandings([])
      setMessage(error.message)
      setLoading(false)
      return
    }

    const savedRows = (data || []) as StandingRow[]
    const playerIds = savedRows.map((row) => row.player_id).filter(Boolean)

    let playerMap = new Map<string, string>()

    if (playerIds.length > 0) {
      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id, screen_name")
        .in("id", playerIds)

      if (playerError) {
        setStandings([])
        setMessage(playerError.message)
        setLoading(false)
        return
      }

      playerMap = new Map(
        ((playerData || []) as PlayerRow[]).map((player) => [
          player.id,
          player.screen_name,
        ])
      )
    }

    const rows = savedRows.map((row) => {
      const wins = Number(row.wins || 0)
      const draws = Number(row.ties || 0)
      const losses = Number(row.losses || 0)

      return {
        playerId: row.player_id,
        player: playerMap.get(row.player_id) || "Unknown Player",
        played: wins + draws + losses,
        wins,
        draws,
        losses,
        points: Number(row.points || 0),
        rank: Number(row.rank || 0),
      }
    })

    setStandings(rows)

    if (rows.length === 0) {
      setMessage("No saved standings found for this division and season.")
    }

    setLoading(false)
  }

  return (
    <main style={page}>
      <div style={container}>
        <Link href="/match-play" style={backButton}>
          ← Match Play
        </Link>

        <section style={hero}>
          <h1 style={title}>📊 Match Play Standings</h1>

          <p style={subtitle}>
            View current saved standings for each Match Play division.
          </p>

          <div style={controls}>
            <div>
              <label style={label}>Division</label>

              <select
                value={division}
                onChange={(event) => setDivision(event.target.value)}
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
                onChange={(event) => setSeason(event.target.value)}
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
                {standings.map((row) => (
                  <tr key={row.playerId}>
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