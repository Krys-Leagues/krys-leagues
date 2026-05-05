"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

export default function StrokeSetup() {
  const router = useRouter()

  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)

  const [season, setSeason] = useState("59")
  const [division, setDivision] = useState("Stroke D1")

  const [p1, setP1] = useState("")
  const [p2, setP2] = useState("")
  const [p3, setP3] = useState("")
  const [p4, setP4] = useState("")

  const [c1, setC1] = useState("")
  const [c2, setC2] = useState("")
  const [c3, setC3] = useState("")
  const [due, setDue] = useState("")

  useEffect(() => {
    loadPlayers()
  }, [])

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id, screen_name")
      .eq("active", true)
      .order("screen_name")

    if (error) {
      alert(error.message)
      return
    }

    setPlayers(data || [])
  }

  function findId(name: string) {
    return (
      players.find(
        (p) =>
          p.screen_name.trim().toLowerCase() ===
          name.trim().toLowerCase()
      )?.id || null
    )
  }

  async function createSchedule() {
    if (!season || !p1 || !p2 || !p3 || !p4 || !c1 || !c2 || !c3 || !due) {
      alert("Fill everything")
      return
    }

    const selectedPlayers = [p1, p2, p3, p4]
    const uniquePlayers = new Set(
      selectedPlayers.map((name) => name.trim().toLowerCase())
    )

    if (uniquePlayers.size !== 4) {
      alert("Pick 4 different players")
      return
    }

    const seasonNumber = Number(season)

    if (!seasonNumber) {
      alert("Invalid season")
      return
    }

    setLoading(true)

    const base = {
      league_type: "stroke",
      division,
      season_number: seasonNumber,
      due_date: due,
      status: "scheduled",
    }

    const rows = [
      {
        ...base,
        game: "1",
        course: c1,
        player1: p1,
        player2: p2,
        player1_id: findId(p1),
        player2_id: findId(p2),
      },
      {
        ...base,
        game: "1",
        course: c1,
        player1: p3,
        player2: p4,
        player1_id: findId(p3),
        player2_id: findId(p4),
      },
      {
        ...base,
        game: "2",
        course: c2,
        player1: p4,
        player2: p1,
        player1_id: findId(p4),
        player2_id: findId(p1),
      },
      {
        ...base,
        game: "2",
        course: c2,
        player1: p2,
        player2: p3,
        player1_id: findId(p2),
        player2_id: findId(p3),
      },
      {
        ...base,
        game: "3",
        course: c3,
        player1: p1,
        player2: p3,
        player1_id: findId(p1),
        player2_id: findId(p3),
      },
      {
        ...base,
        game: "3",
        course: c3,
        player1: p2,
        player2: p4,
        player1_id: findId(p2),
        player2_id: findId(p4),
      },
    ]

    const missingIds = rows.some((row) => !row.player1_id || !row.player2_id)

    if (missingIds) {
      setLoading(false)
      alert("One or more players could not be matched to a player ID")
      return
    }

    const { error: deleteError } = await supabase
      .from("schedule")
      .delete()
      .eq("league_type", "stroke")
      .eq("division", division)
      .eq("season_number", seasonNumber)

    if (deleteError) {
      setLoading(false)
      alert(deleteError.message)
      return
    }

    const { error: insertError } = await supabase
      .from("schedule")
      .insert(rows)

    setLoading(false)

    if (insertError) {
      alert(insertError.message)
      return
    }

    alert("Stroke schedule created ✔")
  }

  return (
    <main style={page}>
      <div style={container}>
        <button onClick={() => router.push("/admin")} style={backButton}>
          ← Back to Admin
        </button>

        <h1 style={{ fontSize: 36 }}>Stroke Setup</h1>

        <section style={section}>
          <h2>Season</h2>
          <div style={row}>
            <select value={season} onChange={(e) => setSeason(e.target.value)} style={input}>
              {Array.from({ length: 300 - 59 + 1 }, (_, i) => 59 + i).map((num) => (
                <option key={num} value={num}>
                  Season {num}
                </option>
              ))}
            </select>

            <select value={division} onChange={(e) => setDivision(e.target.value)} style={input}>
              <option>Stroke D1</option>
              <option>Stroke D2</option>
              <option>Stroke D3</option>
              <option>Stroke D4</option>
              <option>Stroke D5</option>
            </select>

            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={input} />
          </div>
        </section>

        <section style={section}>
          <h2>Players</h2>
          <div style={grid}>
            {[p1, p2, p3, p4].map((val, i) => (
              <select
                key={i}
                value={val}
                onChange={(e) => {
                  const v = e.target.value
                  if (i === 0) setP1(v)
                  if (i === 1) setP2(v)
                  if (i === 2) setP3(v)
                  if (i === 3) setP4(v)
                }}
                style={input}
              >
                <option value="">Player {i + 1}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.screen_name}>
                    {p.screen_name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </section>

        <section style={section}>
          <h2>Courses</h2>
          <div style={grid}>
            <input placeholder="Game 1" value={c1} onChange={(e) => setC1(e.target.value)} style={input} />
            <input placeholder="Game 2" value={c2} onChange={(e) => setC2(e.target.value)} style={input} />
            <input placeholder="Game 3" value={c3} onChange={(e) => setC3(e.target.value)} style={input} />
          </div>
        </section>

        <button onClick={createSchedule} disabled={loading} style={button}>
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
  display: "flex",
  justifyContent: "center",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  padding: 30,
}

const section: React.CSSProperties = {
  marginTop: 30,
}

const row: React.CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 16,
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  background: "#111",
  border: "1px solid #444",
  color: "white",
  borderRadius: 8,
}

const button: React.CSSProperties = {
  marginTop: 30,
  padding: 14,
  width: "100%",
  background: "#16a34a",
  border: "none",
  borderRadius: 10,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const backButton: React.CSSProperties = {
  marginBottom: 20,
  padding: "8px 14px",
  background: "#222",
  border: "1px solid #555",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}