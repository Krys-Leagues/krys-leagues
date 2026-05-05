"use client"

import { useEffect, useMemo, useState } from "react"
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
  const [playerSearch, setPlayerSearch] = useState("")

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

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase()

    if (!q) return players

    return players.filter((p) => p.screen_name.toLowerCase().includes(q))
  }, [players, playerSearch])

  function playerSelect(
    label: string,
    value: string,
    setValue: (value: string) => void
  ) {
    return (
      <div style={field}>
        <label style={labelStyle}>{label}</label>
        <select value={value} onChange={(e) => setValue(e.target.value)} style={selectStyle}>
          <option value="">Select player</option>
          {filteredPlayers.map((p) => (
            <option key={p.id} value={p.screen_name}>
              {p.screen_name}
            </option>
          ))}
        </select>
      </div>
    )
  }

  async function sendDiscordSchedule(seasonNumber: number) {
    const fixtures = [
      { round: "Game 1", player1, player2, course: course1, dueDate },
      { round: "Game 1", player1: player3, player2: player4, course: course1, dueDate },

      { round: "Game 2", player1: player4, player2: player1, course: course2, dueDate },
      { round: "Game 2", player1: player2, player2: player3, course: course2, dueDate },

      { round: "Game 3", player1, player2: player3, course: course3, dueDate },
      { round: "Game 3", player1: player2, player2: player4, course: course3, dueDate },
    ]

    await fetch("/api/discord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leagueType: "Stroke",
        division,
        season: seasonNumber,
        dueDate,
        fixtures,
        message:
          "Stroke season schedule is set. Please complete all games before the due date.",
      }),
    })
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
      {
        ...base,
        game: "1",
        course: clean(course1),
        player1: clean(player1),
        player2: clean(player2),
        player1_id: p1Id,
        player2_id: p2Id,
      },
      {
        ...base,
        game: "1",
        course: clean(course1),
        player1: clean(player3),
        player2: clean(player4),
        player1_id: p3Id,
        player2_id: p4Id,
      },
      {
        ...base,
        game: "2",
        course: clean(course2),
        player1: clean(player4),
        player2: clean(player1),
        player1_id: p4Id,
        player2_id: p1Id,
      },
      {
        ...base,
        game: "2",
        course: clean(course2),
        player1: clean(player2),
        player2: clean(player3),
        player1_id: p2Id,
        player2_id: p3Id,
      },
      {
        ...base,
        game: "3",
        course: clean(course3),
        player1: clean(player1),
        player2: clean(player3),
        player1_id: p1Id,
        player2_id: p3Id,
      },
      {
        ...base,
        game: "3",
        course: clean(course3),
        player1: clean(player2),
        player2: clean(player4),
        player1_id: p2Id,
        player2_id: p4Id,
      },
    ]

    const { error } = await supabase.from("schedule").insert(rows)

    if (error) {
      setLoading(false)
      alert("Insert failed: " + error.message)
      return
    }

    await sendDiscordSchedule(seasonNumber)

    setLoading(false)
    alert("Stroke schedule created + Discord posted ✔")
  }

  return (
    <main style={page}>
      <div style={header}>
        <div>
          <h1 style={title}>Stroke Setup</h1>
          <p style={subtitle}>Create a 4-player Stroke Play schedule using global players.</p>
        </div>

        <button onClick={loadPlayers} disabled={playersLoading} style={secondaryButton}>
          {playersLoading ? "Loading..." : "Refresh Players"}
        </button>
      </div>

      <section style={panel}>
        <h2 style={sectionTitle}>Season</h2>

        <div style={grid}>
          <div style={field}>
            <label style={labelStyle}>Season Number</label>
            <input value={season} onChange={(e) => setSeason(e.target.value)} style={inputStyle} />
          </div>

          <div style={field}>
            <label style={labelStyle}>Division</label>
            <select value={division} onChange={(e) => setDivision(e.target.value)} style={selectStyle}>
              <option>Stroke D1</option>
              <option>Stroke D2</option>
              <option>Stroke D3</option>
              <option>Stroke D4</option>
              <option>Stroke D5</option>
            </select>
          </div>

          <div style={field}>
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
      </section>

      <section style={panel}>
        <h2 style={sectionTitle}>Players</h2>

        <div style={field}>
          <label style={labelStyle}>Search player list</label>
          <input
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            placeholder="Type to filter player dropdowns..."
            style={inputStyle}
          />
        </div>

        <div style={grid}>
          {playerSelect("Player 1", player1, setPlayer1)}
          {playerSelect("Player 2", player2, setPlayer2)}
          {playerSelect("Player 3", player3, setPlayer3)}
          {playerSelect("Player 4", player4, setPlayer4)}
        </div>
      </section>

      <section style={panel}>
        <h2 style={sectionTitle}>Courses</h2>

        <div style={grid}>
          <div style={field}>
            <label style={labelStyle}>Game 1 Course</label>
            <input value={course1} onChange={(e) => setCourse1(e.target.value)} style={inputStyle} />
          </div>

          <div style={field}>
            <label style={labelStyle}>Game 2 Course</label>
            <input value={course2} onChange={(e) => setCourse2(e.target.value)} style={inputStyle} />
          </div>

          <div style={field}>
            <label style={labelStyle}>Game 3 Course</label>
            <input value={course3} onChange={(e) => setCourse3(e.target.value)} style={inputStyle} />
          </div>
        </div>
      </section>

      <button onClick={handleCreateStrokeSchedule} disabled={loading} style={primaryButton}>
        {loading ? "Creating..." : "Create Stroke Schedule"}
      </button>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
}

const title: React.CSSProperties = {
  fontSize: 34,
  margin: 0,
}

const subtitle: React.CSSProperties = {
  color: "#aaa",
  marginTop: 8,
}

const panel: React.CSSProperties = {
  marginTop: 22,
  padding: 18,
  borderRadius: 14,
  border: "1px solid #333",
  background: "#111",
}

const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  marginTop: 0,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginTop: 14,
}

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
}

const labelStyle: React.CSSProperties = {
  color: "#ddd",
  fontSize: 14,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 11,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: 11,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
}

const primaryButton: React.CSSProperties = {
  marginTop: 22,
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  background: "#16a34a",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
}

const secondaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
}