"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const DIVISIONS = ["Doubles D1", "Doubles D2", "Doubles D3"]

export default function DoublesTeamsPage() {
  const [division, setDivision] = useState("Doubles D1")
  const [teamName, setTeamName] = useState("")
  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")

  const [players, setPlayers] = useState<string[]>([])
  const [teams, setTeams] = useState<any[]>([])

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
    loadTeams()
  }, [division])

  async function loadPlayers() {
    const { data } = await supabase
      .from("players")
      .select("screen_name")
      .eq("division", division.replace("Doubles ", ""))
      .order("screen_name")

    setPlayers(data?.map((p: any) => p.screen_name) || [])
  }

  async function loadTeams() {
    const { data } = await supabase
      .from("doubles_teams")
      .select("*")
      .eq("division", division)
      .order("team_name")

    setTeams(data || [])
  }

  async function addTeam() {
    if (!teamName || !player1 || !player2) {
      alert("Fill all fields")
      return
    }

    if (player1 === player2) {
      alert("Players must be different")
      return
    }

    const { error } = await supabase.from("doubles_teams").insert({
      team_name: teamName,
      player1,
      player2,
      division,
    })

    if (error) {
      alert(error.message)
      return
    }

    setTeamName("")
    setPlayer1("")
    setPlayer2("")

    loadTeams()
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Doubles Teams</h1>

      <div style={{ marginTop: 16 }}>
        <label>Division</label><br />
        <select value={division} onChange={(e) => setDivision(e.target.value)} style={inputStyle}>
          {DIVISIONS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>

      <h3 style={{ marginTop: 24 }}>Create Team</h3>

      <input
        placeholder="Team Name"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        style={inputStyle}
      /><br /><br />

      <select value={player1} onChange={(e) => setPlayer1(e.target.value)} style={inputStyle}>
        <option value="">Player 1</option>
        {players.map((p) => <option key={p}>{p}</option>)}
      </select><br /><br />

      <select value={player2} onChange={(e) => setPlayer2(e.target.value)} style={inputStyle}>
        <option value="">Player 2</option>
        {players.map((p) => <option key={p}>{p}</option>)}
      </select><br /><br />

      <button
        onClick={addTeam}
        style={{
          background: "#22c55e",
          padding: "10px 16px",
          borderRadius: "8px",
          border: "none",
          color: "white",
        }}
      >
        Add Team
      </button>

      <h3 style={{ marginTop: 32 }}>Registered Teams</h3>

      {teams.map((t) => (
        <div key={t.id} style={{ marginBottom: 10 }}>
          <strong>{t.team_name}</strong> — {t.player1} + {t.player2}
        </div>
      ))}
    </main>
  )
}