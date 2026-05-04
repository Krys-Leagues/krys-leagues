"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const DIVISIONS = [
  "Doubles Elite",
  "Doubles D1",
  "Doubles D2",
  "Doubles D3",
  "Doubles D4",
  "Doubles D5",
]

type Player = {
  id: string
  display_name: string
}

export default function DoublesTeamsPage() {
  const [division, setDivision] = useState("Doubles Elite")
  const [teamName, setTeamName] = useState("")
  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")

  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [loadError, setLoadError] = useState("")

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
    setLoadError("")

    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("id", { ascending: true })

    if (error) {
      setLoadError(error.message)
      setPlayers([])
      return
    }

    const normalized =
      data
        ?.map((p: any) => ({
          id: String(p.id),
          display_name: String(
            p.screen_name ||
            p.player_name ||
            p.name ||
            p.discord_name ||
            ""
          ).trim(),
        }))
        .filter((p) => p.id && p.display_name)
        .sort((a, b) => a.display_name.localeCompare(b.display_name)) || []

    setPlayers(normalized)
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

    const p1 = players.find((p) => p.id === player1)
    const p2 = players.find((p) => p.id === player2)

    if (!p1 || !p2) {
      alert("Could not find selected players")
      return
    }

    const { error } = await supabase.from("doubles_teams").insert({
      team_name: teamName,
      player1: p1.display_name,
      player2: p2.display_name,
      player_1_id: p1.id,
      player_2_id: p2.id,
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

      {loadError && (
        <div style={{ color: "red", marginTop: 12 }}>
          Player load error: {loadError}
        </div>
      )}

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
        {players.map((p) => (
          <option key={p.id} value={p.id}>{p.display_name}</option>
        ))}
      </select><br /><br />

      <select value={player2} onChange={(e) => setPlayer2(e.target.value)} style={inputStyle}>
        <option value="">Player 2</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>{p.display_name}</option>
        ))}
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

      <div style={{ marginTop: 16, color: "#aaa" }}>
        Players loaded: {players.length}
      </div>

      <h3 style={{ marginTop: 32 }}>Registered Teams</h3>

      {teams.map((t) => (
        <div key={t.id} style={{ marginBottom: 10 }}>
          <strong>{t.team_name}</strong> — {t.player1} + {t.player2}
        </div>
      ))}
    </main>
  )
}