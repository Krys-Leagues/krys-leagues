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
  const [game, setGame] = useState("1")
  const [dueDate, setDueDate] = useState("")

  const [scheduledMatches, setScheduledMatches] = useState<ScheduleMatch[]>([])
  const [selectedMatchIndex, setSelectedMatchIndex] = useState("")

  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [course, setCourse] = useState("")

  const [score1, setScore1] = useState("")
  const [score2, setScore2] = useState("")

  const [players, setPlayers] = useState<Player[]>([])

  const [loading, setLoading] = useState(false)
  const [matchesLoading, setMatchesLoading] = useState(false)

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
  }, [])

  useEffect(() => {
    loadSeasonInfo()
    loadScheduledMatches()
  }, [division, season, game])

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id, screen_name")

    if (error) {
      alert(error.message)
      return
    }

    setPlayers(data || [])
  }

  function findPlayerId(name: string) {
    const found = players.find(
      (p) => p.screen_name.trim().toLowerCase() === name.trim().toLowerCase()
    )

    return found?.id || null
  }

  function resetMatchFields() {
    setSelectedMatchIndex("")
    setPlayer1("")
    setPlayer2("")
    setCourse("")
    setScore1("")
    setScore2("")
  }

  function sameMatch(a1: string, a2: string, b1: string, b2: string) {
    return (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1)
  }

  async function loadSeasonInfo() {
    const seasonNumber = Number(season)

    if (!seasonNumber) {
      setDueDate("")
      return
    }

    const { data } = await supabase
      .from("seasons")
      .select("due_date")
      .eq("league_type", LEAGUE_TYPE)
      .eq("season_number", seasonNumber)
      .maybeSingle()

    setDueDate(data?.due_date || "")
  }

  async function loadScheduledMatches() {
    const seasonNumber = Number(season)

    if (!seasonNumber) {
      setScheduledMatches([])
      return
    }

    setMatchesLoading(true)

    const { data: scheduleData, error: scheduleError } = await supabase
      .from("schedule")
      .select("game, course, player1, player2")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .eq("game", game)

    if (scheduleError) {
      setMatchesLoading(false)
      alert(scheduleError.message)
      return
    }

    const { data: resultData, error: resultError } = await supabase
      .from("results")
      .select("player1, player2")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .eq("game", game)

    setMatchesLoading(false)

    if (resultError) {
      alert(resultError.message)
      return
    }

    const allMatches =
      scheduleData?.filter((row: any) => row.player1 && row.player2) || []

    const scoredResults = resultData || []

    const unscoredMatches = allMatches.filter((match: ScheduleMatch) => {
      return !scoredResults.some((result: any) =>
        sameMatch(match.player1, match.player2, result.player1, result.player2)
      )
    })

    setScheduledMatches(unscoredMatches as ScheduleMatch[])
    resetMatchFields()
  }

  function handlePickMatch(indexValue: string) {
    setSelectedMatchIndex(indexValue)

    if (indexValue === "") {
      resetMatchFields()
      return
    }

    const match = scheduledMatches[Number(indexValue)]
    if (!match) return

    setPlayer1(match.player1)
    setPlayer2(match.player2)
    setCourse(match.course || "")
  }

  async function handleSubmit() {
    const seasonNumber = Number(season)

    const s1 = Number(score1)
    const s2 = Number(score2)

    if (!seasonNumber || !player1 || !player2) {
      alert("Pick a scheduled match first")
      return
    }

    if (isNaN(s1) || isNaN(s2)) {
      alert("Enter valid scores")
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
        player1_hw: 0,
        player2_hw: 0,
        winner,
        is_draw: isDraw,
      },
    ])

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setLoading(false)

    alert("Result saved ✔")
    await loadScheduledMatches()
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <button onClick={() => router.push("/admin")} style={{ marginBottom: 20 }}>
        ← Back to Admin
      </button>

      <h1>Stroke Results Admin</h1>

      <div style={{ marginTop: 16 }}>
        <label>Division</label><br />
        <select value={division} onChange={(e) => setDivision(e.target.value)} style={inputStyle}>
          {DIVISIONS.map((div) => (
            <option key={div}>{div}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Season</label><br />
        <select value={season} onChange={(e) => setSeason(e.target.value)} style={inputStyle}>
          {Array.from({ length: 300 - 59 + 1 }, (_, i) => 59 + i).map((num) => (
            <option key={num} value={num}>
              Season {num}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Game</label><br />
        <select value={game} onChange={(e) => setGame(e.target.value)} style={inputStyle}>
          <option value="1">Game 1</option>
          <option value="2">Game 2</option>
          <option value="3">Game 3</option>
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Pick Scheduled Match</label><br />
        <select value={selectedMatchIndex} onChange={(e) => handlePickMatch(e.target.value)} style={inputStyle}>
          <option value="">Select match</option>
          {scheduledMatches.map((match, index) => (
            <option key={index} value={index}>
              {match.player1} vs {match.player2}
            </option>
          ))}
        </select>
      </div>

      {player1 && player2 && (
        <div style={{ marginTop: 20 }}>
          <p>{player1} vs {player2}</p>
          {course && <p>Course: {course}</p>}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <input value={score1} onChange={(e) => setScore1(e.target.value)} placeholder="-28" style={inputStyle} />
      </div>

      <div style={{ marginTop: 16 }}>
        <input value={score2} onChange={(e) => setScore2(e.target.value)} placeholder="-25" style={inputStyle} />
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? "Saving..." : "Submit Result"}
        </button>
      </div>
    </main>
  )
}