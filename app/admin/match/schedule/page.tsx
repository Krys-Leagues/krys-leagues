"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const LEAGUE_TYPE = "match"
const DIVISIONS = ["Match D1", "Match D2", "Match D3", "Match D4", "Match D5"]

type PlayerOption = {
  id: string
  screen_name: string
}

export default function MatchSchedulePage() {
  const [division, setDivision] = useState("Match D1")
  const [season, setSeason] = useState("")
  const [dueDate, setDueDate] = useState("")

  const [players, setPlayers] = useState<PlayerOption[]>([])

  const [p1, setP1] = useState("")
  const [p2, setP2] = useState("")
  const [p3, setP3] = useState("")
  const [p4, setP4] = useState("")

  const [course1, setCourse1] = useState("")
  const [course2, setCourse2] = useState("")
  const [course3, setCourse3] = useState("")

  const [loading, setLoading] = useState(false)

  const inputStyle = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "260px",
  }

  useEffect(() => {
    loadPlayers()
    setP1("")
    setP2("")
    setP3("")
    setP4("")
  }, [division])

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("player_leagues")
      .select(`
        id,
        players (
          screen_name
        )
      `)
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)

    if (error) {
      alert("Player load error: " + error.message)
      setPlayers([])
      return
    }

    const fixedPlayers =
      (data || [])
        .map((row: any) => {
          const playerData = Array.isArray(row.players) ? row.players[0] : row.players

          return {
            id: row.id,
            screen_name: playerData?.screen_name || "",
          }
        })
        .filter((p) => p.screen_name)

    setPlayers(fixedPlayers)
  }

  function playerDropdown(value: string, setValue: (value: string) => void) {
    return (
      <select value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}>
        <option value="">Select player</option>
        {players.map((p) => (
          <option key={p.id} value={p.screen_name}>
            {p.screen_name}
          </option>
        ))}
      </select>
    )
  }

  async function handleGenerateSeason() {
    const seasonNumber = Number(season)

    if (!seasonNumber || !dueDate) {
      alert("Enter season and due date")
      return
    }

    if (!p1 || !p2 || !p3 || !p4) {
      alert("Select all 4 players")
      return
    }

    if (new Set([p1, p2, p3, p4]).size !== 4) {
      alert("Players must be unique")
      return
    }

    if (!course1 || !course2 || !course3) {
      alert("Enter all 3 courses")
      return
    }

    setLoading(true)

    const { error: seasonError } = await supabase.from("seasons").insert({
      league_type: LEAGUE_TYPE,
      season_number: seasonNumber,
      due_date: dueDate,
    })

    if (seasonError) {
      setLoading(false)

      if (seasonError.message.includes("duplicate")) {
        alert("This season already exists")
      } else {
        alert(seasonError.message)
      }

      return
    }

    const matches = [
      { game: "1", player1: p1, player2: p2, course: course1 },
      { game: "1", player1: p3, player2: p4, course: course1 },

      { game: "2", player1: p1, player2: p3, course: course2 },
      { game: "2", player1: p2, player2: p4, course: course2 },

      { game: "3", player1: p1, player2: p4, course: course3 },
      { game: "3", player1: p2, player2: p3, course: course3 },
    ]

    const payload = matches.map((m) => ({
      league_type: LEAGUE_TYPE,
      division,
      season_number: seasonNumber,
      game: m.game,
      course: m.course,
      player1: m.player1,
      player2: m.player2,
    }))

    const { error: scheduleError } = await supabase.from("schedule").insert(payload)

    if (scheduleError) {
      setLoading(false)
      alert(scheduleError.message)
      return
    }

    try {
      const res = await fetch("/api/discord/season-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          league_type: LEAGUE_TYPE,
          division,
          season_number: seasonNumber,
          due_date: dueDate,
          matches,
        }),
      })

      const text = await res.text()
      let data: any = {}

      if (text) data = JSON.parse(text)

      if (!res.ok) {
        alert("Season saved, Discord failed: " + (data.error || "Unknown"))
        setLoading(false)
        return
      }
    } catch (err: any) {
      alert("Discord error: " + err.message)
      setLoading(false)
      return
    }

    setLoading(false)
    alert("Season created + posted ✔")
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Match Season Builder</h1>

      <div style={{ marginTop: 16 }}>
        <label>Division</label><br />
        <select value={division} onChange={(e) => setDivision(e.target.value)} style={inputStyle}>
          {DIVISIONS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Season</label><br />
        <input value={season} onChange={(e) => setSeason(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Due Date</label><br />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
      </div>

      <h3 style={{ marginTop: 24 }}>Players</h3>

      {players.length === 0 && (
        <p style={{ color: "orange" }}>
          No players assigned to {division}. Add players from the waitlist first.
        </p>
      )}

      {playerDropdown(p1, setP1)}<br /><br />
      {playerDropdown(p2, setP2)}<br /><br />
      {playerDropdown(p3, setP3)}<br /><br />
      {playerDropdown(p4, setP4)}

      <h3 style={{ marginTop: 24 }}>Courses</h3>

      <input placeholder="Game 1 Course" value={course1} onChange={(e) => setCourse1(e.target.value)} style={inputStyle} /><br /><br />
      <input placeholder="Game 2 Course" value={course2} onChange={(e) => setCourse2(e.target.value)} style={inputStyle} /><br /><br />
      <input placeholder="Game 3 Course" value={course3} onChange={(e) => setCourse3(e.target.value)} style={inputStyle} />

      <div style={{ marginTop: 24 }}>
        <button
          onClick={handleGenerateSeason}
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
          {loading ? "Creating..." : "Create Season"}
        </button>
      </div>
    </main>
  )
}