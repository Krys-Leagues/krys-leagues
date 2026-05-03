"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

type ResultRow = {
  league_type: string
  division: string
  season_number: number
  game: string
  player1: string
  player2: string
  player1_score: number | null
  player2_score: number | null
  player1_hw: number | null
  player2_hw: number | null
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
  hw: number
}

export default function StandingsPage() {
  const [leagueType, setLeagueType] = useState("stroke")
  const [division, setDivision] = useState("Stroke D1")
  const [season, setSeason] = useState("")
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(false)

  function getDivisionColor() {
    if (division.includes("D1")) return "#f97316"
    if (division.includes("D2")) return "#06b6d4"
    if (division.includes("D3")) return "#22c55e"
    if (division.includes("D4")) return "#eab308"
    if (division.includes("D5")) return "#a855f7"
    return "#22c55e"
  }

  function getMedal(index: number) {
    if (index === 0) return "🏆"
    if (index === 1) return "🥈"
    if (index === 2) return "🥉"
    return ""
  }

  function headToHeadWinner(a: Standing, b: Standing, rows: ResultRow[]) {
    const games = rows.filter(
      (r) =>
        (r.player1 === a.player && r.player2 === b.player) ||
        (r.player1 === b.player && r.player2 === a.player)
    )

    if (games.length === 0) return 0

    let aWins = 0
    let bWins = 0

    games.forEach((g) => {
      if (g.winner === a.player) aWins++
      if (g.winner === b.player) bWins++
    })

    if (aWins > bWins) return -1
    if (bWins > aWins) return 1

    return 0
  }

  function sortStandings(rows: Standing[], results: ResultRow[]) {
    return [...rows].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points

      const h2h = headToHeadWinner(a, b, results)
      if (h2h !== 0) return h2h

      if (leagueType === "stroke" || leagueType === "pro") {
        return a.strokes - b.strokes
      }

      return b.hw - a.hw
    })
  }

  async function loadStandings() {
    const seasonNumber = Number(season)

    if (!seasonNumber) {
      alert("Enter season number")
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from("results")
      .select("*")
      .eq("league_type", leagueType)
      .eq("division", division)
      .eq("season_number", seasonNumber)

    setLoading(false)

    if (error) {
      console.error(error)
      alert("Could not load standings")
      return
    }

    const rows = (data || []) as ResultRow[]
    const map: Record<string, Standing> = {}

    function ensure(player: string) {
      if (!map[player]) {
        map[player] = {
          player,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          strokes: 0,
          hw: 0,
        }
      }
    }

    rows.forEach((row) => {
      ensure(row.player1)
      ensure(row.player2)

      const p1 = map[row.player1]
      const p2 = map[row.player2]

      p1.played++
      p2.played++

      p1.strokes += row.player1_score || 0
      p2.strokes += row.player2_score || 0

      p1.hw += row.player1_hw || 0
      p2.hw += row.player2_hw || 0

      if (row.is_draw) {
        p1.draws++
        p2.draws++
        p1.points += 1
        p2.points += 1
        return
      }

      if (row.winner === row.player1) {
        p1.wins++
        p2.losses++
        p1.points += 3
      } else if (row.winner === row.player2) {
        p2.wins++
        p1.losses++
        p2.points += 3
      }
    })

    setStandings(sortStandings(Object.values(map), rows))
  }

  function updateLeagueType(value: string) {
    setLeagueType(value)

    if (value === "stroke") setDivision("Stroke D1")
    if (value === "match") setDivision("Match D1")
    if (value === "pyp") setDivision("PYP D1")
    if (value === "doubles") setDivision("Doubles D1")
    if (value === "pro") setDivision("Pro Amateur")
  }

  const accent = getDivisionColor()
  const statLabel = leagueType === "stroke" || leagueType === "pro" ? "Strokes" : "HW"

  return (
    <main
      style={{
        padding: 24,
        background: "linear-gradient(180deg, #050505, #111)",
        color: "white",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          border: `2px solid ${accent}`,
          borderRadius: 16,
          padding: 20,
          background: "#0f0f0f",
          boxShadow: `0 0 24px ${accent}55`,
          maxWidth: 1100,
        }}
      >
        <h1 style={{ margin: 0, color: accent }}>Standings</h1>
        <p style={{ marginTop: 8, color: "#ccc" }}>
          Points → Head-to-Head → {statLabel}
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20 }}>
          <div>
            <label>League Type</label><br />
            <select
              value={leagueType}
              onChange={(e) => updateLeagueType(e.target.value)}
              style={{ padding: 8, minWidth: 160 }}
            >
              <option value="stroke">Stroke</option>
              <option value="match">Match</option>
              <option value="pyp">PYP</option>
              <option value="doubles">Doubles</option>
              <option value="pro">Pro</option>
            </select>
          </div>

          <div>
            <label>Division</label><br />
            <input
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              style={{ padding: 8, minWidth: 160 }}
            />
          </div>

          <div>
            <label>Season</label><br />
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              style={{ padding: 8, minWidth: 120 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "end" }}>
            <button
              onClick={loadStandings}
              disabled={loading}
              style={{
                padding: "10px 18px",
                background: accent,
                color: "black",
                border: "none",
                borderRadius: 8,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              {loading ? "Loading..." : "Load Standings"}
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: "#050505",
            borderRadius: 14,
            border: "1px solid #333",
            overflowX: "auto",
          }}
        >
          <h2 style={{ marginTop: 0, color: accent }}>
            {division} {season ? `• Season ${season}` : ""}
          </h2>

          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: "0 8px",
              color: "white",
              fontSize: "15px",
              minWidth: 760,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "#ddd" }}>
                <th style={{ padding: "10px 14px" }}>Rank</th>
                <th style={{ padding: "10px 14px" }}>Player</th>
                <th style={{ padding: "10px 14px" }}>P</th>
                <th style={{ padding: "10px 14px" }}>W</th>
                <th style={{ padding: "10px 14px" }}>D</th>
                <th style={{ padding: "10px 14px" }}>L</th>
                <th style={{ padding: "10px 14px" }}>PTS</th>
                <th style={{ padding: "10px 14px" }}>{statLabel}</th>
              </tr>
            </thead>

            <tbody>
              {standings.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 16, color: "#aaa" }}>
                    No standings loaded yet.
                  </td>
                </tr>
              ) : (
                standings.map((s, index) => {
                  const isTopThree = index < 3

                  return (
                    <tr
                      key={s.player}
                      style={{
                        background: isTopThree ? `${accent}22` : "#1a1a1a",
                        outline: isTopThree ? `1px solid ${accent}` : "1px solid #2a2a2a",
                      }}
                    >
                      <td style={{ padding: "12px 14px", fontWeight: "bold" }}>
                        {getMedal(index)} {index + 1}
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: "bold" }}>
                        {s.player}
                      </td>
                      <td style={{ padding: "12px 14px" }}>{s.played}</td>
                      <td style={{ padding: "12px 14px" }}>{s.wins}</td>
                      <td style={{ padding: "12px 14px" }}>{s.draws}</td>
                      <td style={{ padding: "12px 14px" }}>{s.losses}</td>
                      <td
                        style={{
                          padding: "12px 14px",
                          fontWeight: "bold",
                          color: accent,
                        }}
                      >
                        {s.points}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        {leagueType === "stroke" || leagueType === "pro" ? s.strokes : s.hw}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}