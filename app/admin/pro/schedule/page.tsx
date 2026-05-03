"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const LEAGUE_TYPE = "pro"
const DIVISIONS = ["Pro D1", "Pro D2", "Pro D3", "Semi Pro D1", "Amateur D1"]

export default function ProSchedulePage() {
  const [division, setDivision] = useState("Pro D1")
  const [season, setSeason] = useState("")
  const [dueDate, setDueDate] = useState("")

  const [players, setPlayers] = useState<string[]>([])

  const [p1, setP1] = useState("")
  const [p2, setP2] = useState("")
  const [p3, setP3] = useState("")
  const [p4, setP4] = useState("")

  const [map1, setMap1] = useState("")
  const [map2, setMap2] = useState("")
  const [map3, setMap3] = useState("")

  const [loading, setLoading] = useState(false)

  const inputStyle: React.CSSProperties = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "260px",
  }

  useEffect(() => {
    loadPlayers()
  }, [division])

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("screen_name")
      .eq("division", division)
      .order("screen_name", { ascending: true })

    if (error) {
      console.error(error)
      setPlayers([])
      return
    }

    setPlayers(data?.map((p: any) => p.screen_name) || [])
  }

  function playerDropdown(value: string, setValue: (value: string) => void) {
    return (
      <select value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}>
        <option value="">Select player</option>
        {players.map((p) => (
          <option key={p} value={p}>
            {p}
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

    if (!map1 || !map2 || !map3) {
      alert("Enter all 3 maps")
      return
    }

    setLoading(true)

    const { data: existingSeason, error: existingError } = await supabase
      .from("seasons")
      .select("id")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .maybeSingle()

    if (existingError) {
      setLoading(false)
      alert(existingError.message)
      return
    }

    if (existingSeason) {
      setLoading(false)
      alert("This season already exists")
      return
    }

    const { error: seasonError } = await supabase.from("seasons").insert({
      league_type: LEAGUE_TYPE,
      division,
      season_number: seasonNumber,
      due_date: dueDate,
    })

    if (seasonError) {
      setLoading(false)
      alert(seasonError.message)
      return
    }

    const matches = [
      { game: "1", player1: p1, player2: p2, course: map1 },
      { game: "1", player1: p3, player2: p4, course: map1 },

      { game: "2", player1: p1, player2: p3, course: map2 },
      { game: "2", player1: p2, player2: p4, course: map2 },

      { game: "3", player1: p1, player2: p4, course: map3 },
      { game: "3", player1: p2, player2: p3, course: map3 },
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
        setLoading(false)
        alert("Season saved, Discord failed: " + (data.error || "Unknown"))
        return
      }
    } catch (err: any) {
      setLoading(false)
      alert("Discord error: " + err.message)
      return
    }

    setSeason("")
    setDueDate("")
    setP1("")
    setP2("")
    setP3("")
    setP4("")
    setMap1("")
    setMap2("")
    setMap3("")

    setLoading(false)
    alert("Pro season created + posted ✔")
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Pro Season Builder</h1>

      <p style={{ color: "#aaa" }}>
        4-player Pro schedule. Each map uses Easy + Hard for combined stroke count.
      </p>

      <div style={{ marginTop: 16 }}>
        <label>Division</label>
        <br />
        <select value={division} onChange={(e) => setDivision(e.target.value)} style={inputStyle}>
          {DIVISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Season</label>
        <br />
        <input value={season} onChange={(e) => setSeason(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Due Date</label>
        <br />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
      </div>

      <h3 style={{ marginTop: 24 }}>Players</h3>

      {playerDropdown(p1, setP1)}
      <br /><br />
      {playerDropdown(p2, setP2)}
      <br /><br />
      {playerDropdown(p3, setP3)}
      <br /><br />
      {playerDropdown(p4, setP4)}

      <h3 style={{ marginTop: 24 }}>Maps</h3>

      <input placeholder="Game 1 Map" value={map1} onChange={(e) => setMap1(e.target.value)} style={inputStyle} /><br /><br />
      <input placeholder="Game 2 Map" value={map2} onChange={(e) => setMap2(e.target.value)} style={inputStyle} /><br /><br />
      <input placeholder="Game 3 Map" value={map3} onChange={(e) => setMap3(e.target.value)} style={inputStyle} />

      <div style={{ marginTop: 24 }}>
        <button
          onClick={handleGenerateSeason}
          disabled={loading}
          style={{
            background: loading ? "#555" : "#22c55e",
            border: "none",
            padding: "12px 18px",
            borderRadius: "8px",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating..." : "Create Pro Season"}
        </button>
      </div>
    </main>
  )
}