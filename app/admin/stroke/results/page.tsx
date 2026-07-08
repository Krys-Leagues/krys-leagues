"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const LEAGUE_TYPE = "stroke"
const DIVISIONS = ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"]

type ScheduleMatch = {
  game: string
  course: string | null
  player1: string
  player2: string
}

type Player = {
  id: string
  screen_name: string
}

export default function StrokeResultsPage() {
  const router = useRouter()

  const [division, setDivision] = useState("Stroke D1")
  const [season, setSeason] = useState("59")

  const [scheduledMatches, setScheduledMatches] = useState<ScheduleMatch[]>([])
  const [selectedMatchIndex, setSelectedMatchIndex] = useState("")

  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [course, setCourse] = useState("")
  const [game, setGame] = useState("")

  const [score1, setScore1] = useState("")
  const [score2, setScore2] = useState("")

  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [])

  useEffect(() => {
    loadScheduledMatches()
  }, [division, season])

  async function loadPlayers() {
    const { data } = await supabase
      .from("players")
      .select("id, screen_name")

    setPlayers(data || [])
  }

  function findPlayerId(name: string) {
    const found = players.find(
      (p) => p.screen_name.trim().toLowerCase() === name.trim().toLowerCase()
    )
    return found?.id || null
  }

  function sameMatch(a1: string, a2: string, b1: string, b2: string) {
    return (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1)
  }

  function resetPickedMatch() {
    setSelectedMatchIndex("")
    setPlayer1("")
    setPlayer2("")
    setCourse("")
    setGame("")
    setScore1("")
    setScore2("")
  }

  async function loadScheduledMatches() {
    const seasonNumber = Number(season)

    const { data: scheduleData } = await supabase
      .from("schedule")
      .select("game, course, player1, player2")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)

    const { data: resultData } = await supabase
      .from("results")
      .select("player1, player2")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)

    const allMatches =
      scheduleData?.filter((row: any) => row.player1 && row.player2) || []

    const scoredResults = resultData || []

    const unscoredMatches = allMatches.filter((match: ScheduleMatch) => {
      return !scoredResults.some((result: any) =>
        sameMatch(match.player1, match.player2, result.player1, result.player2)
      )
    })

    setScheduledMatches(unscoredMatches)
    resetPickedMatch()
  }

  function handlePickMatch(indexValue: string) {
    setSelectedMatchIndex(indexValue)

    if (indexValue === "") {
      resetPickedMatch()
      return
    }

    const match = scheduledMatches[Number(indexValue)]
    if (!match) return

    setPlayer1(match.player1)
    setPlayer2(match.player2)
    setCourse(match.course || "")
    setGame(match.game)
    setScore1("")
    setScore2("")
  }

  async function handleSubmit() {
    const seasonNumber = Number(season)

    const s1 = Number(score1)
    const s2 = Number(score2)

    if (!player1 || !player2 || isNaN(s1) || isNaN(s2)) {
      alert("Pick a match and enter valid scores")
      return
    }

    setLoading(true)

    let winner = null
    let isDraw = false

    if (s1 < s2) winner = player1
    else if (s2 < s1) winner = player2
    else isDraw = true

    const player1_id = findPlayerId(player1)
    const player2_id = findPlayerId(player2)

    const { error } = await supabase.from("results").insert([
      {
        league_type: LEAGUE_TYPE,
        division,
        season_number: seasonNumber,
        game,
        course,
        player1,
        player2,
        player1_id,
        player2_id,
        result_type: "league_result",
        player1_score: s1,
        player2_score: s2,
        winner,
        is_draw: isDraw,
      },
    ])

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }
    alert("Result saved ✔")

    await fetch("/api/recalculate-standings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        league_type: LEAGUE_TYPE,
        division,
        season_number: seasonNumber,
      }),
    })

    await loadScheduledMatches()
  }

  return (
    <main style={page}>
      <div style={container}>

        {/* 🔥 NEW NAV */}
        <div style={topBar}>
          <button onClick={() => router.push("/admin/stroke")} style={backButtonPrimary}>
            ← Stroke Hub
          </button>

          <button onClick={() => router.push("/admin")} style={backButtonSecondary}>
            ← Admin
          </button>
        </div>

        <div style={card}>
          <h1 style={title}>Stroke Results Admin</h1>
          <p style={subtitle}>Pick the match, enter both scores, and submit.</p>

          <section style={section}>
            <h2 style={sectionTitle}>League Info</h2>

            <div style={grid}>
              <div>
                <label style={label}>Division</label>
                <select value={division} onChange={(e) => setDivision(e.target.value)} style={input}>
                  {DIVISIONS.map((div) => (
                    <option key={div}>{div}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>Season</label>
                <select value={season} onChange={(e) => setSeason(e.target.value)} style={input}>
                  {Array.from({ length: 300 - 59 + 1 }, (_, i) => 59 + i).map((num) => (
                    <option key={num} value={num}>
                      Season {num}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section style={section}>
            <h2 style={sectionTitle}>Match</h2>

            <label style={label}>Pick Match</label>
            <select value={selectedMatchIndex} onChange={(e) => handlePickMatch(e.target.value)} style={wideInput}>
              <option value="">Select match</option>
              {scheduledMatches.map((match, index) => (
                <option key={index} value={index}>
                  {match.player1} vs {match.player2}
                </option>
              ))}
            </select>

            {player1 && player2 && (
              <div style={matchCard}>
                <div style={matchText}>{player1}</div>
                <div style={vsText}>vs</div>
                <div style={matchText}>{player2}</div>
                {course && <div style={courseText}>Course: {course}</div>}
              </div>
            )}
          </section>

          <section style={section}>
            <h2 style={sectionTitle}>Scores</h2>

            <div style={grid}>
              <div>
                <label style={label}>{player1 || "Player 1"} Score</label>
                <input value={score1} onChange={(e) => setScore1(e.target.value)} placeholder={player1 || "-28"} style={input} />
              </div>

              <div>
                <label style={label}>{player2 || "Player 2"} Score</label>
                <input value={score2} onChange={(e) => setScore2(e.target.value)} placeholder={player2 || "-25"} style={input} />
              </div>
            </div>
          </section>

          <button onClick={handleSubmit} disabled={loading} style={submitButton}>
            {loading ? "Saving..." : "Submit Result"}
          </button>
        </div>
      </div>
    </main>
  )
}

/* styles */

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  display: "flex",
  justifyContent: "center",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
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

const card: React.CSSProperties = {
  background: "#050505",
  border: "1px solid #333",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 0 30px rgba(255,255,255,0.08)",
}

const title: React.CSSProperties = {
  fontSize: 38,
  margin: 0,
}

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#aaa",
  fontSize: 16,
}

const section: React.CSSProperties = {
  marginTop: 28,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 24,
  marginBottom: 14,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 18,
}

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  color: "#ddd",
  fontWeight: 700,
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 14,
  background: "#111",
  color: "white",
  border: "1px solid #555",
  borderRadius: 10,
  fontSize: 18,
}

const wideInput: React.CSSProperties = {
  ...input,
  fontSize: 20,
}

const matchCard: React.CSSProperties = {
  marginTop: 18,
  padding: 22,
  background: "#111",
  border: "1px solid #444",
  borderRadius: 14,
  textAlign: "center",
}

const matchText: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
}

const vsText: React.CSSProperties = {
  margin: "8px 0",
  color: "#aaa",
  fontSize: 18,
}

const courseText: React.CSSProperties = {
  marginTop: 12,
  color: "#ccc",
  fontSize: 18,
}

const submitButton: React.CSSProperties = {
  marginTop: 30,
  padding: 16,
  width: "100%",
  background: "#16a34a",
  border: "none",
  borderRadius: 12,
  color: "white",
  fontSize: 20,
  fontWeight: 800,
  cursor: "pointer",
}