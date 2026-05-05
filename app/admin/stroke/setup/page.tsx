"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

export default function StrokeSetup() {
  const [season, setSeason] = useState("")
  const [division, setDivision] = useState("Stroke D1")

  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [player3, setPlayer3] = useState("")
  const [player4, setPlayer4] = useState("")

  const [players, setPlayers] = useState<Player[]>([])
  const [course1, setCourse1] = useState("")
  const [course2, setCourse2] = useState("")
  const [course3, setCourse3] = useState("")
  const [dueDate, setDueDate] = useState("")

  const [loading, setLoading] = useState(false)
  const [playersLoading, setPlayersLoading] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [])

  async function loadPlayers() {
    setPlayersLoading(true)

    const { data, error } = await supabase
      .from("players")
      .select("id, screen_name")
      .eq("active", true)
      .order("screen_name", { ascending: true })

    setPlayersLoading(false)

    if (error) {
      alert("Player list failed to load: " + error.message)
      return
    }

    setPlayers(data || [])
  }

  function clean(value: string) {
    return value.trim()
  }

  function findPlayerId(screenName: string) {
    const match = players.find(
      (p) => p.screen_name.trim().toLowerCase() === screenName.trim().toLowerCase()
    )

    return match?.id || null
  }

  function playerSelect(label: string, value: string, setValue: (value: string) => void) {
    return (
      <div style={field}>
        <label style={label}>{label}</label>
        <select value={value} onChange={(e) => setValue(e.target.value)} style={input}>
          <option value="">Select player</option>
          {players.map((p) => (
            <option key={p.id} value={p.screen_name}>
              {p.screen_name}
            </option>
          ))}
        </select>
      </div>
    )
  }

  async function handleCreateStrokeSchedule() {
    const seasonNumber = Number(season)
    const selectedPlayers = [player1, player2, player3, player4].map(clean)

    if (
      !seasonNumber ||
      selectedPlayers.some((p) => !p) ||
      !clean(course1) ||
      !clean(course2) ||
      !clean(course3) ||
      !dueDate
    ) {
      alert("Please fill all fields.")
      return
    }

    const uniquePlayers = new Set(selectedPlayers.map((p) => p.toLowerCase()))
    if (uniquePlayers.size !== 4) {
      alert("Players must be unique.")
      return
    }

    setLoading(true)

    const p1Id = findPlayerId(player1)
    const p2Id = findPlayerId(player2)
    const p3Id = findPlayerId(player3)
    const p4Id = findPlayerId(player4)

    const base = {
      league_type: "stroke",
      division,
      season_number: seasonNumber,
      due_date: dueDate,
      status: "scheduled",
    }

    const rows = [
      { ...base, game: "1", course: clean(course1), player1: clean(player1), player2: clean(player2), player1_id: p1Id, player2_id: p2Id },
      { ...base, game: "1", course: clean(course1), player1: clean(player3), player2: clean(player4), player1_id: p3Id, player2_id: p4Id },
      { ...base, game: "2", course: clean(course2), player1: clean(player4), player2: clean(player1), player1_id: p4Id, player2_id: p1Id },
      { ...base, game: "2", course: clean(course2), player1: clean(player2), player2: clean(player3), player1_id: p2Id, player2_id: p3Id },
      { ...base, game: "3", course: clean(course3), player1: clean(player1), player2: clean(player3), player1_id: p1Id, player2_id: p3Id },
      { ...base, game: "3", course: clean(course3), player1: clean(player2), player2: clean(player4), player1_id: p2Id, player2_id: p4Id },
    ]

    const { error } = await supabase.from("schedule").insert(rows)

    setLoading(false)

    if (error) {
      alert("Insert failed: " + error.message)
      return
    }

    alert("Stroke schedule created ✔")
  }

  return (
    <main style={page}>
      <div style={wrap}>
        <header style={header}>
          <div>
            <h1 style={title}>Stroke Setup</h1>
            <p style={subtitle}>Create a 4-player Stroke Play schedule.</p>
          </div>

          <button onClick={loadPlayers} disabled={playersLoading} style={blueButton}>
            {playersLoading ? "Loading Players..." : "Refresh Player List"}
          </button>
        </header>

        <section style={card}>
          <h2 style={sectionTitle}>Season Info</h2>

          <div style={threeGrid}>
            <div style={field}>
              <label style={label}>Season</label>
              <input value={season} onChange={(e) => setSeason(e.target.value)} style={input} />
            </div>

            <div style={field}>
              <label style={label}>Division</label>
              <select value={division} onChange={(e) => setDivision(e.target.value)} style={input}>
                <option>Stroke D1</option>
                <option>Stroke D2</option>
                <option>Stroke D3</option>
                <option>Stroke D4</option>
                <option>Stroke D5</option>
              </select>
            </div>

            <div style={field}>
              <label style={label}>Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={input} />
            </div>
          </div>
        </section>

        <section style={card}>
          <h2 style={sectionTitle}>Players</h2>

          <div style={twoGrid}>
            {playerSelect("Player 1", player1, setPlayer1)}
            {playerSelect("Player 2", player2, setPlayer2)}
            {playerSelect("Player 3", player3, setPlayer3)}
            {playerSelect("Player 4", player4, setPlayer4)}
          </div>
        </section>

        <section style={card}>
          <h2 style={sectionTitle}>Courses</h2>

          <div style={threeGrid}>
            <div style={field}>
              <label style={label}>Game 1 Course</label>
              <input value={course1} onChange={(e) => setCourse1(e.target.value)} style={input} />
            </div>

            <div style={field}>
              <label style={label}>Game 2 Course</label>
              <input value={course2} onChange={(e) => setCourse2(e.target.value)} style={input} />
            </div>

            <div style={field}>
              <label style={label}>Game 3 Course</label>
              <input value={course3} onChange={(e) => setCourse3(e.target.value)} style={input} />
            </div>
          </div>
        </section>

        <button onClick={handleCreateStrokeSchedule} disabled={loading} style={greenButton}>
          {loading ? "Creating..." : "Create Stroke Schedule"}
        </button>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  padding: "32px",
}

const wrap: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  margin: "0 auto",
}

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap",
  marginBottom: 24,
}

const title: React.CSSProperties = {
  fontSize: 38,
  margin: 0,
}

const subtitle: React.CSSProperties = {
  color: "#aaa",
  marginTop: 8,
}

const card: React.CSSProperties = {
  background: "#111",
  border: "1px solid #333",
  borderRadius: 16,
  padding: 22,
  marginBottom: 22,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 24,
  marginTop: 0,
  marginBottom: 18,
}

const twoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(260px, 1fr))",
  gap: 18,
}

const threeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
  gap: 18,
}

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
}

const label: React.CSSProperties = {
  color: "#ddd",
  fontSize: 15,
  fontWeight: 700,
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
  fontSize: 16,
}

const blueButton: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 10,
  padding: "12px 16px",
  cursor: "pointer",
  fontWeight: 700,
}

const greenButton: React.CSSProperties = {
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 12,
  padding: "14px 22px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 16,
}