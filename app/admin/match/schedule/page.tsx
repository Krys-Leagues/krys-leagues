"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

const DIVISIONS = [
  "Match Play D1",
  "Match Play D2",
  "Match Play D3",
  "Match Play D4",
  "Match Play D5",
  "Match Play D6",
]

export default function MatchSchedulePage() {
  const router = useRouter()

  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)

  const [division, setDivision] = useState("Match Play D1")
  const [season, setSeason] = useState("59")
  const [dueDate, setDueDate] = useState("")

  const [p1, setP1] = useState("")
  const [p2, setP2] = useState("")
  const [p3, setP3] = useState("")
  const [p4, setP4] = useState("")

  const [course1, setCourse1] = useState("")
  const [course2, setCourse2] = useState("")
  const [course3, setCourse3] = useState("")

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
      alert(error.message)
      return
    }

    setPlayers(data || [])
  }

  function findPlayerId(name: string) {
    return (
      players.find(
        (player) =>
          player.screen_name.trim().toLowerCase() ===
          name.trim().toLowerCase()
      )?.id || null
    )
  }

  async function createSchedule() {
    const seasonNumber = Number(season)

    if (
      !seasonNumber ||
      !dueDate ||
      !p1 ||
      !p2 ||
      !p3 ||
      !p4 ||
      !course1 ||
      !course2 ||
      !course3
    ) {
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

    setLoading(true)

    const base = {
      league_type: "match",
      division,
      season_number: seasonNumber,
      due_date: dueDate,
      status: "scheduled",
    }

    const rows = [
      {
        ...base,
        game: "1",
        course: course1,
        player1: p1,
        player2: p2,
        player1_id: findPlayerId(p1),
        player2_id: findPlayerId(p2),
      },
      {
        ...base,
        game: "1",
        course: course1,
        player1: p3,
        player2: p4,
        player1_id: findPlayerId(p3),
        player2_id: findPlayerId(p4),
      },
      {
        ...base,
        game: "2",
        course: course2,
        player1: p1,
        player2: p3,
        player1_id: findPlayerId(p1),
        player2_id: findPlayerId(p3),
      },
      {
        ...base,
        game: "2",
        course: course2,
        player1: p2,
        player2: p4,
        player1_id: findPlayerId(p2),
        player2_id: findPlayerId(p4),
      },
      {
        ...base,
        game: "3",
        course: course3,
        player1: p1,
        player2: p4,
        player1_id: findPlayerId(p1),
        player2_id: findPlayerId(p4),
      },
      {
        ...base,
        game: "3",
        course: course3,
        player1: p2,
        player2: p3,
        player1_id: findPlayerId(p2),
        player2_id: findPlayerId(p3),
      },
    ]

    const missingIds = rows.some(
      (row) => !row.player1_id || !row.player2_id
    )

    if (missingIds) {
      setLoading(false)
      alert("One or more players could not be matched to a player ID")
      return
    }

    const { error: deleteError } = await supabase
      .from("schedule")
      .delete()
      .eq("league_type", "match")
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

    if (insertError) {
      setLoading(false)
      alert(insertError.message)
      return
    }

    try {
      const response = await fetch("/api/discord/season-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          league_type: "match",
          division,
          season_number: seasonNumber,
          due_date: dueDate,
          matches: rows,
        }),
      })

      if (!response.ok) {
        alert("Schedule saved, but Discord posting failed.")
        setLoading(false)
        return
      }
    } catch {
      alert("Schedule saved, but Discord posting failed.")
      setLoading(false)
      return
    }

    setLoading(false)
    alert("Match Play schedule created and posted ✔")
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button
            onClick={() => router.push("/admin/match")}
            style={backButtonPrimary}
          >
            ← Match Play Hub
          </button>

          <button
            onClick={() => router.push("/admin")}
            style={backButtonSecondary}
          >
            ← Admin
          </button>
        </div>

        <h1 style={title}>Match Play Season Builder</h1>

        <section style={section}>
          <h2>Season</h2>

          <div style={row}>
            <select
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              style={input}
            >
              {Array.from(
                { length: 300 - 59 + 1 },
                (_, index) => 59 + index
              ).map((number) => (
                <option key={number} value={number}>
                  Season {number}
                </option>
              ))}
            </select>

            <select
              value={division}
              onChange={(event) => setDivision(event.target.value)}
              style={input}
            >
              {DIVISIONS.map((divisionName) => (
                <option key={divisionName} value={divisionName}>
                  {divisionName}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              style={input}
            />
          </div>
        </section>

        <section style={section}>
          <h2>Players</h2>

          <div style={grid}>
            {[p1, p2, p3, p4].map((value, index) => (
              <select
                key={index}
                value={value}
                onChange={(event) => {
                  const selectedValue = event.target.value

                  if (index === 0) setP1(selectedValue)
                  if (index === 1) setP2(selectedValue)
                  if (index === 2) setP3(selectedValue)
                  if (index === 3) setP4(selectedValue)
                }}
                style={input}
              >
                <option value="">Player {index + 1}</option>

                {players.map((player) => (
                  <option key={player.id} value={player.screen_name}>
                    {player.screen_name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </section>

        <section style={section}>
          <h2>Courses</h2>

          <div style={grid}>
            <input
              placeholder="Game 1 Course"
              value={course1}
              onChange={(event) => setCourse1(event.target.value)}
              style={input}
            />

            <input
              placeholder="Game 2 Course"
              value={course2}
              onChange={(event) => setCourse2(event.target.value)}
              style={input}
            />

            <input
              placeholder="Game 3 Course"
              value={course3}
              onChange={(event) => setCourse3(event.target.value)}
              style={input}
            />
          </div>
        </section>

        <button
          onClick={createSchedule}
          disabled={loading}
          style={createButton}
        >
          {loading ? "Creating..." : "Create Match Play Schedule"}
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

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 20,
}

const backButtonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563eb",
  border: "none",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const backButtonSecondary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#222",
  border: "1px solid #555",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const title: React.CSSProperties = {
  fontSize: 36,
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
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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

const createButton: React.CSSProperties = {
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