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

  useEffect(() => {
    loadPlayers()
  }, [])

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id, screen_name")
      .eq("active", true)
      .order("screen_name", { ascending: true })

    if (error) {
      alert("Failed to load players")
      return
    }

    setPlayers(data || [])
  }

  function findPlayer(name: string) {
    return players.find(
      (p) => p.screen_name.trim().toLowerCase() === name.trim().toLowerCase()
    )
  }

  async function handleCreateStrokeSchedule() {
    const seasonNumber = Number(season)

    if (
      !seasonNumber ||
      !player1 ||
      !player2 ||
      !player3 ||
      !player4 ||
      !course1 ||
      !course2 ||
      !course3 ||
      !dueDate
    ) {
      alert("Please fill all fields correctly")
      return
    }

    setLoading(true)

    const p1 = findPlayer(player1)
    const p2 = findPlayer(player2)
    const p3 = findPlayer(player3)
    const p4 = findPlayer(player4)

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
        course: course1.trim(),
        player1: player1.trim(),
        player2: player2.trim(),
        player1_id: p1?.id || null,
        player2_id: p2?.id || null,
      },
      {
        ...base,
        game: "1",
        course: course1.trim(),
        player1: player3.trim(),
        player2: player4.trim(),
        player1_id: p3?.id || null,
        player2_id: p4?.id || null,
      },
      {
        ...base,
        game: "2",
        course: course2.trim(),
        player1: player4.trim(),
        player2: player1.trim(),
        player1_id: p4?.id || null,
        player2_id: p1?.id || null,
      },
      {
        ...base,
        game: "2",
        course: course2.trim(),
        player1: player2.trim(),
        player2: player3.trim(),
        player1_id: p2?.id || null,
        player2_id: p3?.id || null,
      },
      {
        ...base,
        game: "3",
        course: course3.trim(),
        player1: player1.trim(),
        player2: player3.trim(),
        player1_id: p1?.id || null,
        player2_id: p3?.id || null,
      },
      {
        ...base,
        game: "3",
        course: course3.trim(),
        player1: player2.trim(),
        player2: player4.trim(),
        player1_id: p2?.id || null,
        player2_id: p4?.id || null,
      },
    ]

    const { error } = await supabase.from("schedule").insert(rows)

    if (error) {
      setLoading(false)
      alert("Insert failed: " + error.message)
      return
    }

    setLoading(false)
    alert("Schedule created ✔")
  }

  return (
    <main style={{ padding: 24, color: "white", background: "black", minHeight: "100vh" }}>
      <h1>Stroke Setup</h1>

      <div style={{ marginTop: 16 }}>
        <label>Season</label><br />
        <input value={season} onChange={(e) => setSeason(e.target.value)} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Division</label><br />
        <select value={division} onChange={(e) => setDivision(e.target.value)}>
          <option>Stroke D1</option>
          <option>Stroke D2</option>
          <option>Stroke D3</option>
          <option>Stroke D4</option>
          <option>Stroke D5</option>
        </select>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Players</h3>

        {["player1","player2","player3","player4"].map((key, i) => (
          <div key={i} style={{ marginTop: 12 }}>
            <label>Player {i + 1}</label><br />
            <select
              value={[player1,player2,player3,player4][i]}
              onChange={(e) => {
                const val = e.target.value
                if (i === 0) setPlayer1(val)
                if (i === 1) setPlayer2(val)
                if (i === 2) setPlayer3(val)
                if (i === 3) setPlayer4(val)
              }}
            >
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.screen_name}>
                  {p.screen_name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Courses</h3>

        <input placeholder="Course 1" value={course1} onChange={(e) => setCourse1(e.target.value)} /><br /><br />
        <input placeholder="Course 2" value={course2} onChange={(e) => setCourse2(e.target.value)} /><br /><br />
        <input placeholder="Course 3" value={course3} onChange={(e) => setCourse3(e.target.value)} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Due Date</label><br />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={handleCreateStrokeSchedule} disabled={loading}>
          {loading ? "Saving..." : "Create Stroke Schedule"}
        </button>
      </div>
    </main>
  )
}