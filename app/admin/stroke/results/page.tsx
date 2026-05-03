"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const LEAGUE_TYPE = "stroke"
const DIVISIONS = ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"]

type ScheduleMatch = {
  game: string
  course: string | null
  player1: string
  player2: string
}

type ResultRow = {
  player1: string
  player2: string
  player1_score: number | null
  player2_score: number | null
  winner: string | null
  is_draw: boolean | null
}

type Standing = {
  player: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  strokes: number
}

export default function StrokeResultsPage() {
  const [division, setDivision] = useState("Stroke D1")
  const [season, setSeason] = useState("")
  const [game, setGame] = useState("1")
  const [dueDate, setDueDate] = useState("")

  const [scheduledMatches, setScheduledMatches] = useState<ScheduleMatch[]>([])
  const [selectedMatchIndex, setSelectedMatchIndex] = useState("")

  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [course, setCourse] = useState("")

  const [score1, setScore1] = useState("")
  const [score2, setScore2] = useState("")

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
    loadSeasonInfo()
    loadScheduledMatches()
  }, [division, season, game])

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

    const { data, error } = await supabase
      .from("seasons")
      .select("due_date")
      .eq("league_type", LEAGUE_TYPE)
      .eq("season_number", seasonNumber)
      .maybeSingle()

    if (error) {
      setDueDate("")
      return
    }

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

    const { data: resultData, error: resultError } = await supabase
      .from("results")
      .select("player1, player2")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .eq("game", game)

    setMatchesLoading(false)

    if (scheduleError) {
      alert("Schedule load error: " + scheduleError.message)
      setScheduledMatches([])
      return
    }

    if (resultError) {
      alert("Results load error: " + resultError.message)
      setScheduledMatches([])
      return
    }

    const allMatches =
      scheduleData?.filter((row: any) => row.player1 && row.player2) || []

    const scoredResults = (resultData || []) as ResultRow[]

    const unscoredMatches = allMatches.filter((match: ScheduleMatch) => {
      return !scoredResults.some((result) =>
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

  async function postResultToDiscord(result: any) {
    try {
      const res = await fetch("/api/discord/result-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(result),
      })

      const text = await res.text()
      let data: any = {}

      if (text) {
        data = JSON.parse(text)
      }

      if (!res.ok) {
        alert("Result saved, but Discord failed: " + (data.error || "Unknown error"))
      }
    } catch (err: any) {
      alert("Result saved, but Discord failed: " + err.message)
    }
  }

  async function postStandingsToDiscord(
    divisionName: string,
    seasonNumber: number,
    standingsText: string
  ) {
    try {
      const res = await fetch("/api/post-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          division: divisionName,
          content: standingsText,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert("Result saved, but standings post failed: " + (data.error || "Unknown error"))
      }
    } catch (err: any) {
      alert("Result saved, but standings post failed: " + err.message)
    }
  }

  function makeEmptyStanding(player: string): Standing {
    return {
      player,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      strokes: 0,
    }
  }

  function headToHeadWinner(a: string, b: string, rows: ResultRow[]) {
    const games = rows.filter(
      (r) =>
        (r.player1 === a && r.player2 === b) ||
        (r.player1 === b && r.player2 === a)
    )

    if (games.length === 0) return null

    let aWins = 0
    let bWins = 0

    games.forEach((g) => {
      if (g.winner === a) aWins++
      if (g.winner === b) bWins++
    })

    if (aWins > bWins) return a
    if (bWins > aWins) return b

    return null
  }

  async function buildAndPostStandings(seasonNumber: number) {
    const { data, error } = await supabase
      .from("results")
      .select("player1, player2, player1_score, player2_score, winner, is_draw")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)

    if (error) {
      alert("Standings load error: " + error.message)
      return
    }

    const rows = (data || []) as ResultRow[]
    const table: Record<string, Standing> = {}

    rows.forEach((r) => {
      if (!table[r.player1]) table[r.player1] = makeEmptyStanding(r.player1)
      if (!table[r.player2]) table[r.player2] = makeEmptyStanding(r.player2)

      const p1Score = Number(r.player1_score || 0)
      const p2Score = Number(r.player2_score || 0)

      table[r.player1].played++
      table[r.player2].played++

      table[r.player1].strokes += p1Score
      table[r.player2].strokes += p2Score

      if (r.is_draw) {
        table[r.player1].draws++
        table[r.player2].draws++
        table[r.player1].points += 1
        table[r.player2].points += 1
      } else if (r.winner === r.player1) {
        table[r.player1].wins++
        table[r.player2].losses++
        table[r.player1].points += 3
      } else if (r.winner === r.player2) {
        table[r.player2].wins++
        table[r.player1].losses++
        table[r.player2].points += 3
      }
    })

    const standings = Object.values(table).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points

      const h2h = headToHeadWinner(a.player, b.player, rows)
      if (h2h === a.player) return -1
      if (h2h === b.player) return 1

      return a.strokes - b.strokes
    })

    const lines = standings.map((s, i) => {
      return `${i + 1}. ${s.player} — ${s.points} pts | ${s.wins}W-${s.draws}D-${s.losses}L | ${s.strokes} strokes`
    })

    const standingsText = `
📊 **Current Stroke Standings**
Season: ${seasonNumber}
Division: ${division}

${lines.join("\n")}

Tiebreakers: Points → Head-to-Head → Season Stroke Count
    `.trim()

    await postStandingsToDiscord(division, seasonNumber, standingsText)
  }

  async function handleSubmit() {
    const seasonNumber = Number(season)

    if (!seasonNumber || !player1 || !player2) {
      alert("Pick a scheduled match first")
      return
    }

    const s1 = Number(score1)
    const s2 = Number(score2)

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

    const { data: existingResults, error: duplicateError } = await supabase
      .from("results")
      .select("player1, player2")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .eq("game", game)

    if (duplicateError) {
      setLoading(false)
      alert("Error checking duplicate result: " + duplicateError.message)
      return
    }

    const alreadyEntered = (existingResults || []).some((result: any) =>
      sameMatch(player1, player2, result.player1, result.player2)
    )

    if (alreadyEntered) {
      setLoading(false)
      alert("This result has already been entered.")
      await loadScheduledMatches()
      return
    }

    const resultRow = {
      league_type: LEAGUE_TYPE,
      division,
      season_number: seasonNumber,
      game,
      course,
      player1,
      player2,
      result_type: "league_result",
      player1_score: s1,
      player2_score: s2,
      player1_hw: 0,
      player2_hw: 0,
      winner,
      is_draw: isDraw,
    }

    const { error } = await supabase.from("results").insert([resultRow])

    setLoading(false)

    if (error) {
      alert("Error saving result: " + error.message)
      return
    }

    await postResultToDiscord(resultRow)
    await buildAndPostStandings(seasonNumber)

    alert("Stroke result saved + standings posted ✔")
    await loadScheduledMatches()
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Stroke Results Admin</h1>

      <p style={{ color: "#aaa" }}>Locked to Stroke League</p>

      <div style={{ marginTop: 16 }}>
        <label>Division</label><br />
        <select value={division} onChange={(e) => setDivision(e.target.value)} style={inputStyle}>
          {DIVISIONS.map((div) => (
            <option key={div} value={div}>{div}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Season</label><br />
        <input value={season} onChange={(e) => setSeason(e.target.value)} style={inputStyle} />
      </div>

      {dueDate && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #444",
            borderRadius: 10,
            background: "#111",
            maxWidth: 360,
          }}
        >
          <strong>Season Due Date:</strong> {dueDate}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label>Game</label><br />
        <select value={game} onChange={(e) => setGame(e.target.value)} style={inputStyle}>
          <option value="1">Game 1</option>
          <option value="2">Game 2</option>
          <option value="3">Game 3</option>
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={loadScheduledMatches} disabled={matchesLoading}>
          {matchesLoading ? "Loading Matches..." : "Refresh Matches"}
        </button>
      </div>

      {scheduledMatches.length === 0 && season && (
        <p style={{ color: "orange" }}>
          No unscored matches found for this division/season/game.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <label>Pick Scheduled Match</label><br />
        <select value={selectedMatchIndex} onChange={(e) => handlePickMatch(e.target.value)} style={inputStyle}>
          <option value="">Select match</option>
          {scheduledMatches.map((match, index) => (
            <option key={index} value={index}>
              Game {match.game}: {match.player1} vs {match.player2}
              {match.course ? ` — ${match.course}` : ""}
            </option>
          ))}
        </select>
      </div>

      {player1 && player2 && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            border: "1px solid #444",
            borderRadius: 12,
            background: "#111",
            maxWidth: 420,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Selected Match</h3>
          <p><strong>{player1}</strong> vs <strong>{player2}</strong></p>
          <p>Game: {game}</p>
          <p>Course: {course || "Course TBD"}</p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label>{player1 || "Player 1"} Score</label><br />
        <input value={score1} onChange={(e) => setScore1(e.target.value)} placeholder="-28" style={inputStyle} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label>{player2 || "Player 2"} Score</label><br />
        <input value={score2} onChange={(e) => setScore2(e.target.value)} placeholder="-25" style={inputStyle} />
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            background: "#22c55e",
            border: "none",
            padding: "12px 18px",
            borderRadius: "8px",
            color: "white",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          {loading ? "Saving..." : "Submit Stroke Result"}
        </button>
      </div>
    </main>
  )
}