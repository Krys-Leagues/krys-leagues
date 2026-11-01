"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const LEAGUE_TYPE = "doubles"
const DIVISIONS = ["Doubles D1", "Doubles D2", "Doubles D3"]

type DoublesTeam = {
  id: number
  team_name: string
  player1: string
  player2: string
  division: string
}

export default function DoublesSchedulePage() {
  const [division, setDivision] = useState("Doubles D1")
  const [season, setSeason] = useState("")
  const [dueDate, setDueDate] = useState("")

  const [teams, setTeams] = useState<DoublesTeam[]>([])

  const [team1, setTeam1] = useState("")
  const [team2, setTeam2] = useState("")
  const [team3, setTeam3] = useState("")
  const [team4, setTeam4] = useState("")

  const [course1, setCourse1] = useState("")
  const [course2, setCourse2] = useState("")
  const [course3, setCourse3] = useState("")

  const [loading, setLoading] = useState(false)

  const inputStyle: React.CSSProperties = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "280px",
  }

  useEffect(() => {
    loadTeams()
  }, [division])

  async function loadTeams() {
    const { data, error } = await supabase
      .from("doubles_teams")
      .select("*")
      .eq("division", division)
      .eq("active", true)
      .order("team_name", { ascending: true })

    if (error) {
      console.error(error)
      setTeams([])
      return
    }

    setTeams((data || []) as DoublesTeam[])
  }

  function teamDropdown(value: string, setValue: (value: string) => void) {
    return (
      <select value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}>
        <option value="">Select team</option>
        {teams.map((team) => (
          <option key={team.id} value={team.team_name}>
            {team.team_name} — {team.player1} + {team.player2}
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

    if (!team1 || !team2 || !team3 || !team4) {
      alert("Select all 4 teams")
      return
    }

    if (new Set([team1, team2, team3, team4]).size !== 4) {
      alert("Teams must be unique")
      return
    }

    if (!course1 || !course2 || !course3) {
      alert("Enter all 3 courses/maps")
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
      { game: "1", player1: team1, player2: team2, course: course1 },
      { game: "1", player1: team3, player2: team4, course: course1 },

      { game: "2", player1: team1, player2: team3, course: course2 },
      { game: "2", player1: team2, player2: team4, course: course2 },

      { game: "3", player1: team1, player2: team4, course: course3 },
      { game: "3", player1: team2, player2: team3, course: course3 },
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
    setTeam1("")
    setTeam2("")
    setTeam3("")
    setTeam4("")
    setCourse1("")
    setCourse2("")
    setCourse3("")

    setLoading(false)
    alert("Doubles season created + posted ✔")
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Doubles Season Builder</h1>

      <p style={{ color: "#aaa" }}>
        4 registered teams per division. Each team has 2 players.
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

      <h3 style={{ marginTop: 24 }}>Teams</h3>

      {teamDropdown(team1, setTeam1)}
      <br />
      <br />
      {teamDropdown(team2, setTeam2)}
      <br />
      <br />
      {teamDropdown(team3, setTeam3)}
      <br />
      <br />
      {teamDropdown(team4, setTeam4)}

      <h3 style={{ marginTop: 24 }}>Courses / Maps</h3>

      <input
        placeholder="Game 1 Course / Map"
        value={course1}
        onChange={(e) => setCourse1(e.target.value)}
        style={inputStyle}
      />
      <br />
      <br />

      <input
        placeholder="Game 2 Course / Map"
        value={course2}
        onChange={(e) => setCourse2(e.target.value)}
        style={inputStyle}
      />
      <br />
      <br />

      <input
        placeholder="Game 3 Course / Map"
        value={course3}
        onChange={(e) => setCourse3(e.target.value)}
        style={inputStyle}
      />

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
          {loading ? "Creating..." : "Create Doubles Season"}
        </button>
      </div>
    </main>
  )
}