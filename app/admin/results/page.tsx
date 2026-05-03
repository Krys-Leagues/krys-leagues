"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type ScheduleMatch = {
  game: string
  course: string | null
  player1: string
  player2: string
}

type ResultRow = {
  player1: string
  player2: string
}

const DIVISIONS: Record<string, string[]> = {
  stroke: ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"],
  match: ["Match D1", "Match D2", "Match D3", "Match D4", "Match D5"],
  pyp: ["PYP D1", "PYP D2", "PYP D3", "PYP D4", "PYP D5"],
  doubles: [
    "Doubles Elite",
    "Doubles D1",
    "Doubles D2",
    "Doubles D3",
    "Doubles D4",
    "Doubles D5",
  ],
  pro: ["Pro D1", "Pro D2", "Pro D3", "Semi Pro D1", "Amateur D1"],
}

export default function ResultsPage() {
  const [leagueType, setLeagueType] = useState("match")
  const [division, setDivision] = useState("Match D1")
  const [season, setSeason] = useState("")
  const [game, setGame] = useState("1")

  const [scheduledMatches, setScheduledMatches] = useState<ScheduleMatch[]>([])
  const [selectedMatchIndex, setSelectedMatchIndex] = useState("")

  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [course, setCourse] = useState("")

  const [score1, setScore1] = useState("")
  const [score2, setScore2] = useState("")
  const [hw1, setHw1] = useState("")
  const [hw2, setHw2] = useState("")

  const [loading, setLoading] = useState(false)
  const [matchesLoading, setMatchesLoading] = useState(false)

  const inputStyle = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "260px",
  }

  useEffect(() => {
    loadScheduledMatches()
  }, [leagueType, division, season, game])

  function updateLeagueType(value: string) {
    setLeagueType(value)
    setDivision(DIVISIONS[value][0])
    resetMatchFields()
  }

  function resetMatchFields() {
    setSelectedMatchIndex("")
    setPlayer1("")
    setPlayer2("")
    setCourse("")
    setScore1("")
    setScore2("")
    setHw1("")
    setHw2("")
  }

  function sameMatch(a1: string, a2: string, b1: string, b2: string) {
    return (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1)
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
      .eq("league_type", leagueType)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .eq("game", game)

    const { data: resultData, error: resultError } = await supabase
      .from("results")
      .select("player1, player2")
      .eq("league_type", leagueType)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .eq("game", game)

    setMatchesLoading(false)

    if (scheduleError) {
      setScheduledMatches([])
      alert("Schedule load error: " + scheduleError.message)
      return
    }

    if (resultError) {
      setScheduledMatches([])
      alert("Results load error: " + resultError.message)
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
      setPlayer1("")
      setPlayer2("")
      setCourse("")
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
        return
      }
    } catch (err: any) {
      alert("Result saved, but Discord failed: " + err.message)
    }
  }

  async function handleSubmit() {
    const seasonNumber = Number(season)

    if (!seasonNumber || !player1 || !player2) {
      alert("Pick a scheduled match first")
      return
    }

    setLoading(true)

    let winner = null
    let isDraw = false

    if (leagueType === "stroke" || leagueType === "pro") {
      const s1 = Number(score1)
      const s2 = Number(score2)

      if (isNaN(s1) || isNaN(s2)) {
        alert("Enter valid scores")
        setLoading(false)
        return
      }

      if (s1 < s2) winner = player1
      else if (s2 < s1) winner = player2
      else isDraw = true
    }

    if (leagueType === "match" || leagueType === "doubles") {
      const h1 = Number(hw1)
      const h2 = Number(hw2)

      if (isNaN(h1) || isNaN(h2)) {
        alert("Enter valid holes won")
        setLoading(false)
        return
      }

      if (h1 > h2) winner = player1
      else if (h2 > h1) winner = player2
      else isDraw = true
    }

    if (leagueType === "pyp") {
      const s1 = Number(score1)
      const s2 = Number(score2)

      if (isNaN(s1) || isNaN(s2)) {
        alert("Enter valid totals")
        setLoading(false)
        return
      }

      if (s1 > s2) winner = player1
      else if (s2 > s1) winner = player2
      else isDraw = true
    }

    const { data: existingResults, error: duplicateError } = await supabase
      .from("results")
      .select("player1, player2")
      .eq("league_type", leagueType)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .eq("game", game)

    if (duplicateError) {
      alert("Error checking duplicate result: " + duplicateError.message)
      setLoading(false)
      return
    }

    const alreadyEntered = (existingResults || []).some((result: ResultRow) =>
      sameMatch(player1, player2, result.player1, result.player2)
    )

    if (alreadyEntered) {
      alert("This result has already been entered.")
      setLoading(false)
      await loadScheduledMatches()
      return
    }

    const resultRow = {
      league_type: leagueType,
      division,
      season_number: seasonNumber,
      game,
      course,
      player1,
      player2,
      result_type: "league_result",
      player1_score: score1 ? Number(score1) : null,
      player2_score: score2 ? Number(score2) : null,
      player1_hw: hw1 ? Number(hw1) : 0,
      player2_hw: hw2 ? Number(hw2) : 0,
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

    alert("Result saved ✔")
    await loadScheduledMatches()
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Results Entry</h1>

      <div style={{ marginTop: 16 }}>
        <label>League Type</label><br />
        <select value={leagueType} onChange={(e) => updateLeagueType(e.target.value)} style={inputStyle}>
          <option value="stroke">Stroke</option>
          <option value="match">Match</option>
          <option value="pyp">PYP</option>
          <option value="doubles">Doubles</option>
          <option value="pro">Pro</option>
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Division</label><br />
        <select value={division} onChange={(e) => setDivision(e.target.value)} style={inputStyle}>
          {DIVISIONS[leagueType].map((div) => (
            <option key={div} value={div}>
              {div}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Season</label><br />
        <input value={season} onChange={(e) => setSeason(e.target.value)} style={inputStyle} />
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
        <button onClick={loadScheduledMatches} disabled={matchesLoading}>
          {matchesLoading ? "Loading Matches..." : "Refresh Matches"}
        </button>
      </div>

      {scheduledMatches.length === 0 && season && (
        <p style={{ color: "orange" }}>
          No unscored matches found for this league/division/season/game.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <label>Pick Scheduled Match</label><br />
        <select
          value={selectedMatchIndex}
          onChange={(e) => handlePickMatch(e.target.value)}
          style={inputStyle}
        >
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
          }}
        >
          <h3 style={{ marginTop: 0 }}>Selected Match</h3>
          <p><strong>{player1}</strong> vs <strong>{player2}</strong></p>
          <p>Game: {game}</p>
          <p>Course: {course || "Course TBD"}</p>
        </div>
      )}

      {(leagueType === "stroke" || leagueType === "pro" || leagueType === "pyp") && (
        <>
          <div style={{ marginTop: 16 }}>
            <label>{player1 || "Player 1"} Score</label><br />
            <input value={score1} onChange={(e) => setScore1(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ marginTop: 16 }}>
            <label>{player2 || "Player 2"} Score</label><br />
            <input value={score2} onChange={(e) => setScore2(e.target.value)} style={inputStyle} />
          </div>
        </>
      )}

      {(leagueType === "match" || leagueType === "doubles") && (
        <>
          <div style={{ marginTop: 16 }}>
            <label>{player1 || "Player 1"} HW</label><br />
            <input value={hw1} onChange={(e) => setHw1(e.target.value)} style={inputStyle} />
          </div>

          <div style={{ marginTop: 16 }}>
            <label>{player2 || "Player 2"} HW</label><br />
            <input value={hw2} onChange={(e) => setHw2(e.target.value)} style={inputStyle} />
          </div>
        </>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            background: "#1e90ff",
            border: "none",
            padding: "10px 16px",
            borderRadius: "8px",
            color: "white",
            cursor: "pointer",
          }}
        >
          {loading ? "Saving..." : "Submit Result"}
        </button>
      </div>
    </main>
  )
}