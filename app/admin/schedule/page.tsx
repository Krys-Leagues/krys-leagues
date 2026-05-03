"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

const DIVISIONS: Record<string, string[]> = {
  stroke: ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"],
  match: ["Match D1", "Match D2", "Match D3", "Match D4", "Match D5"],
  pyp: ["PYP D1", "PYP D2", "PYP D3", "PYP D4", "PYP D5"],
  doubles: [
    "Doubles Elite",
    "Doubles D1",
    "Doubles D2",
    "Doubles D3",
    "Doubles D4",
    "Doubles D5",
  ],
  pro: ["Pro D1", "Pro D2", "Pro D3", "Semi Pro D1", "Amateur D1"],
}

export default function ScheduleAdminPage() {
  const [leagueType, setLeagueType] = useState("match")
  const [division, setDivision] = useState("Match D1")
  const [season, setSeason] = useState("")
  const [game, setGame] = useState("1")
  const [course, setCourse] = useState("")
  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [loading, setLoading] = useState(false)

  const inputStyle = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "260px",
  }

  function updateLeagueType(value: string) {
    setLeagueType(value)
    setDivision(DIVISIONS[value][0])
  }

  async function handleSaveSchedule() {
    const seasonNumber = Number(season)

    if (!seasonNumber || !leagueType || !division || !game || !player1 || !player2) {
      alert("Fill in all required fields")
      return
    }

    setLoading(true)

    const { error } = await supabase.from("schedule").insert([
      {
        league_type: leagueType,
        division,
        season_number: seasonNumber,
        game,
        course,
        player1,
        player2,
      },
    ])

    setLoading(false)

    if (error) {
      alert("Error saving schedule: " + error.message)
      return
    }

    alert("Schedule match saved ✔")
    setPlayer1("")
    setPlayer2("")
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Schedule Admin</h1>

      <div style={{ marginTop: 16 }}>
        <label>League Type</label><br />
        <select value={leagueType} onChange={(e) => updateLeagueType(e.target.value)} style={inputStyle}>
          <option value="stroke">Stroke</option>
          <option value="match">Match</option>
          <option value="pyp">PYP</option>
          <option value="doubles">Doubles</option>
          <option value="pro">Pro</option>
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Division</label><br />
        <select value={division} onChange={(e) => setDivision(e.target.value)} style={inputStyle}>
          {DIVISIONS[leagueType].map((div) => (
            <option key={div} value={div}>
              {div}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Season Number</label><br />
        <input value={season} onChange={(e) => setSeason(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Game</label><br />
        <select value={game} onChange={(e) => setGame(e.target.value)} style={inputStyle}>
          <option value="1">Game 1</option>
          <option value="2">Game 2</option>
          <option value="3">Game 3</option>
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Course</label><br />
        <input value={course} onChange={(e) => setCourse(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Player 1 / Team 1</label><br />
        <input value={player1} onChange={(e) => setPlayer1(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Player 2 / Team 2</label><br />
        <input value={player2} onChange={(e) => setPlayer2(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={handleSaveSchedule}
          disabled={loading}
          style={{
            background: "#1e90ff",
            border: "none",
            padding: "10px 16px",
            borderRadius: "8px",
            color: "white",
            cursor: "pointer",
          }}
        >
          {loading ? "Saving..." : "Save Schedule Match"}
        </button>
      </div>
    </main>
  )
}