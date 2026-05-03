"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function StrokeSetup() {
  const [season, setSeason] = useState("")
  const [division, setDivision] = useState("Stroke D1")

  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [player3, setPlayer3] = useState("")
  const [player4, setPlayer4] = useState("")

  const [playerOptions, setPlayerOptions] = useState<string[]>([])

  const [course1, setCourse1] = useState("")
  const [course2, setCourse2] = useState("")
  const [course3, setCourse3] = useState("")
  const [dueDate, setDueDate] = useState("")

  const [loading, setLoading] = useState(false)
  const [playersLoading, setPlayersLoading] = useState(false)

  useEffect(() => {
    loadPlayerOptions()
  }, [])

  async function loadPlayerOptions() {
    setPlayersLoading(true)

    const { data, error } = await supabase
      .from("schedule")
      .select("player1, player2")
      .eq("league_type", "stroke")

    setPlayersLoading(false)

    if (error) {
      console.error("Player load error:", error)
      alert("Player list could not load. You can still type names manually.")
      return
    }

    const names: string[] = []

    data?.forEach((row: any) => {
      if (row.player1 && !names.includes(row.player1)) {
        names.push(row.player1)
      }

      if (row.player2 && !names.includes(row.player2)) {
        names.push(row.player2)
      }
    })

    setPlayerOptions(names.sort())
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
      },
      {
        ...base,
        game: "1",
        course: course1.trim(),
        player1: player3.trim(),
        player2: player4.trim(),
      },
      {
        ...base,
        game: "2",
        course: course2.trim(),
        player1: player4.trim(),
        player2: player1.trim(),
      },
      {
        ...base,
        game: "2",
        course: course2.trim(),
        player1: player2.trim(),
        player2: player3.trim(),
      },
      {
        ...base,
        game: "3",
        course: course3.trim(),
        player1: player1.trim(),
        player2: player3.trim(),
      },
      {
        ...base,
        game: "3",
        course: course3.trim(),
        player1: player2.trim(),
        player2: player4.trim(),
      },
    ]

    const { error } = await supabase.from("schedule").insert(rows)

    if (error) {
      setLoading(false)
      console.error("Stroke insert error:", error)
      alert("Insert failed: " + error.message)
      return
    }

    await sendDiscordSchedule(seasonNumber)

    setLoading(false)

    alert("Stroke schedule created + Discord posted ✔")
  }

  return (
    <main style={{ padding: 24, color: "white", background: "black", minHeight: "100vh" }}>
      <h1>Stroke Setup</h1>

      <datalist id="stroke-player-options">
        {playerOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

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

        <button onClick={loadPlayerOptions} disabled={playersLoading}>
          {playersLoading ? "Loading Players..." : "Refresh Player List"}
        </button>

        {playerOptions.length === 0 && (
          <p style={{ color: "orange" }}>
            No saved player list found yet. Type names manually this time.
          </p>
        )}

        <div style={{ marginTop: 12 }}>
          <label>Player 1</label><br />
          <input
            list="stroke-player-options"
            value={player1}
            onChange={(e) => setPlayer1(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Player 2</label><br />
          <input
            list="stroke-player-options"
            value={player2}
            onChange={(e) => setPlayer2(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Player 3</label><br />
          <input
            list="stroke-player-options"
            value={player3}
            onChange={(e) => setPlayer3(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label>Player 4</label><br />
          <input
            list="stroke-player-options"
            value={player4}
            onChange={(e) => setPlayer4(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Courses</h3>

        <label>Game 1 Course</label><br />
        <input value={course1} onChange={(e) => setCourse1(e.target.value)} />

        <br /><br />

        <label>Game 2 Course</label><br />
        <input value={course2} onChange={(e) => setCourse2(e.target.value)} />

        <br /><br />

        <label>Game 3 Course</label><br />
        <input value={course3} onChange={(e) => setCourse3(e.target.value)} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Due Date</label><br />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={handleCreateStrokeSchedule} disabled={loading}>
          {loading ? "Creating + Posting..." : "Create Stroke Schedule"}
        </button>
      </div>
    </main>
  )
}