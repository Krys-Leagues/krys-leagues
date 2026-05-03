"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Match = {
  id: string
  league_type: string
  division: string
  season_number: number
  player1_name: string
  player2_name: string
  course_1: string
  course_2: string
}

type ResultRow = {
  player1: string
  player2: string
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
  hw: number
}

export default function PypResultsPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedIndex, setSelectedIndex] = useState("")

  const [p1, setP1] = useState("")
  const [p2, setP2] = useState("")
  const [c1, setC1] = useState("")
  const [c2, setC2] = useState("")

  const [p1c1, setP1c1] = useState("")
  const [p1c2, setP1c2] = useState("")
  const [p2c1, setP2c1] = useState("")
  const [p2c2, setP2c2] = useState("")

  const [loading, setLoading] = useState(false)

  const inputStyle = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "120px",
    marginRight: "8px",
  }

  const selectStyle = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "360px",
  }

  useEffect(() => {
    loadMatches()
  }, [])

  async function loadMatches() {
    const { data, error } = await supabase
      .from("schedule")
      .select("*")
      .eq("league_type", "pyp")
      .order("season_number", { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setMatches(data || [])
  }

  function pickMatch(val: string) {
    setSelectedIndex(val)

    if (val === "") {
      setP1("")
      setP2("")
      setC1("")
      setC2("")
      setP1c1("")
      setP1c2("")
      setP2c1("")
      setP2c2("")
      return
    }

    const m = matches[Number(val)]
    if (!m) return

    setP1(m.player1_name)
    setP2(m.player2_name)
    setC1(m.course_1)
    setC2(m.course_2)

    setP1c1("")
    setP1c2("")
    setP2c1("")
    setP2c2("")
  }

  const total1 = (Number(p1c1) || 0) + (Number(p1c2) || 0)
  const total2 = (Number(p2c1) || 0) + (Number(p2c2) || 0)

  async function postResultToDiscord(result: any) {
    try {
      const res = await fetch("/api/discord/result-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(result),
      })

      const text = await res.text()
      let data: any = {}

      if (text) data = JSON.parse(text)

      if (!res.ok) {
        alert("Result saved, but Discord result post failed: " + (data.error || "Unknown error"))
      }
    } catch (err: any) {
      alert("Result saved, but Discord result post failed: " + err.message)
    }
  }

  async function postStandingsToDiscord(
    division: string,
    seasonNumber: number,
    standingsText: string
  ) {
    try {
      const res = await fetch("/api/post-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          division,
          content: standingsText,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert("Result saved, but standings post failed: " + (data.error || "Unknown error"))
      }
    } catch (err: any) {
      alert("Result saved, but standings post failed: " + err.message)
    }
  }

  function makeEmptyStanding(player: string): Standing {
    return {
      player,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      hw: 0,
    }
  }

  function headToHeadWinner(a: string, b: string, rows: ResultRow[]) {
    const games = rows.filter(
      (r) =>
        (r.player1 === a && r.player2 === b) ||
        (r.player1 === b && r.player2 === a)
    )

    if (games.length === 0) return null

    let aWins = 0
    let bWins = 0

    games.forEach((g) => {
      if (g.winner === a) aWins++
      if (g.winner === b) bWins++
    })

    if (aWins > bWins) return a
    if (bWins > aWins) return b

    return null
  }

  async function buildAndPostStandings(division: string, seasonNumber: number) {
    const { data, error } = await supabase
      .from("results")
      .select("player1, player2, player1_hw, player2_hw, winner, is_draw")
      .eq("league_type", "pyp")
      .eq("division", division)
      .eq("season_number", seasonNumber)

    if (error) {
      alert("Standings load error: " + error.message)
      return
    }

    const rows = (data || []) as ResultRow[]
    const table: Record<string, Standing> = {}

    rows.forEach((r) => {
      if (!table[r.player1]) table[r.player1] = makeEmptyStanding(r.player1)
      if (!table[r.player2]) table[r.player2] = makeEmptyStanding(r.player2)

      const p1hw = Number(r.player1_hw || 0)
      const p2hw = Number(r.player2_hw || 0)

      table[r.player1].played++
      table[r.player2].played++

      table[r.player1].hw += p1hw
      table[r.player2].hw += p2hw

      if (r.is_draw) {
        table[r.player1].draws++
        table[r.player2].draws++
        table[r.player1].points += 1
        table[r.player2].points += 1
      } else if (r.winner === r.player1) {
        table[r.player1].wins++
        table[r.player2].losses++
        table[r.player1].points += 3
      } else if (r.winner === r.player2) {
        table[r.player2].wins++
        table[r.player1].losses++
        table[r.player2].points += 3
      }
    })

    const standings = Object.values(table).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points

      const h2h = headToHeadWinner(a.player, b.player, rows)
      if (h2h === a.player) return -1
      if (h2h === b.player) return 1

      return b.hw - a.hw
    })

    const lines = standings.map((s, i) => {
      return `${i + 1}. ${s.player} — ${s.points} pts | ${s.wins}W-${s.draws}D-${s.losses}L | ${s.hw} HW`
    })

    const standingsText = `
📊 **Current PYP Standings**
Season: ${seasonNumber}
Division: ${division}

${lines.join("\n")}

Tiebreakers: Points → Head-to-Head → Season HW
    `.trim()

    await postStandingsToDiscord(division, seasonNumber, standingsText)
  }

  async function saveResult() {
    const selectedMatch = matches[Number(selectedIndex)]

    if (!selectedMatch) {
      alert("Pick a match")
      return
    }

    if (p1c1 === "" || p1c2 === "" || p2c1 === "" || p2c2 === "") {
      alert("Enter all 4 holes-won scores")
      return
    }

    setLoading(true)

    let winner = null
    let isDraw = false

    if (total1 > total2) winner = p1
    else if (total2 > total1) winner = p2
    else isDraw = true

    const resultRow = {
      league_type: "pyp",
      division: selectedMatch.division,
      season_number: selectedMatch.season_number,
      game: "1",
      player1: p1,
      player2: p2,
      result_type: "league_result",
      player1_score: null,
      player2_score: null,
      player1_hw: total1,
      player2_hw: total2,
      winner,
      is_draw: isDraw,
      course: `${c1} / ${c2}`,
    }

    const { error } = await supabase.from("results").insert([resultRow])

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    await postResultToDiscord(resultRow)

    await buildAndPostStandings(
      selectedMatch.division,
      selectedMatch.season_number
    )

    alert("PYP result saved + standings posted ✔")

    setSelectedIndex("")
    setP1("")
    setP2("")
    setC1("")
    setC2("")
    setP1c1("")
    setP1c2("")
    setP2c1("")
    setP2c2("")

    await loadMatches()
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>PYP Results Admin</h1>

      <div style={{ marginTop: 16 }}>
        <label>Pick Match</label><br />
        <select value={selectedIndex} onChange={(e) => pickMatch(e.target.value)} style={selectStyle}>
          <option value="">Select match</option>
          {matches.map((m, i) => (
            <option key={m.id} value={i}>
              Season {m.season_number} - {m.division}: {m.player1_name} vs {m.player2_name}
            </option>
          ))}
        </select>
      </div>

      {p1 && (
        <div style={{ marginTop: 20 }}>
          <h3>{p1} vs {p2}</h3>
          <p>{c1} / {c2}</p>

          <h4>{p1}</h4>
          <input placeholder="C1 HW" value={p1c1} onChange={(e) => setP1c1(e.target.value)} style={inputStyle} />
          <input placeholder="C2 HW" value={p1c2} onChange={(e) => setP1c2(e.target.value)} style={inputStyle} />
          <span>Total HW: {total1}</span>

          <h4 style={{ marginTop: 16 }}>{p2}</h4>
          <input placeholder="C1 HW" value={p2c1} onChange={(e) => setP2c1(e.target.value)} style={inputStyle} />
          <input placeholder="C2 HW" value={p2c2} onChange={(e) => setP2c2(e.target.value)} style={inputStyle} />
          <span>Total HW: {total2}</span>

          <div style={{ marginTop: 24 }}>
            <button
              onClick={saveResult}
              disabled={loading}
              style={{
                background: "#22c55e",
                border: "none",
                padding: "12px 18px",
                borderRadius: "8px",
                color: "white",
                cursor: "pointer",
              }}
            >
              {loading ? "Saving..." : "Submit Result"}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}