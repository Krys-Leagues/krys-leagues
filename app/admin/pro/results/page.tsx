"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const LEAGUE_TYPE = "pro"
const DIVISIONS = ["Pro D1", "Pro D2", "Pro D3", "Semi Pro D1", "Amateur D1"]

type ScheduleMatch = {
  id?: number
  league_type: string
  division: string
  season_number: number
  game: string
  course: string
  player1: string
  player2: string
}

type ScoreState = {
  p1Easy: string
  p1Hard: string
  p2Easy: string
  p2Hard: string
}

export default function ProResultsPage() {
  const [division, setDivision] = useState("Pro D1")
  const [season, setSeason] = useState("")
  const [matches, setMatches] = useState<ScheduleMatch[]>([])
  const [scores, setScores] = useState<Record<string, ScoreState>>({})
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState("")

  const inputStyle: React.CSSProperties = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "260px",
  }

  const smallInputStyle: React.CSSProperties = {
    background: "#111",
    color: "white",
    border: "1px solid #555",
    padding: "6px",
    borderRadius: "6px",
    width: "90px",
  }

  function matchKey(match: ScheduleMatch) {
    return `${match.season_number}-${match.division}-${match.game}-${match.player1}-${match.player2}`
  }

  function getScore(match: ScheduleMatch) {
    const key = matchKey(match)

    return (
      scores[key] || {
        p1Easy: "",
        p1Hard: "",
        p2Easy: "",
        p2Hard: "",
      }
    )
  }

  function updateScore(match: ScheduleMatch, field: keyof ScoreState, value: string) {
    const key = matchKey(match)

    setScores((prev) => ({
      ...prev,
      [key]: {
        ...getScore(match),
        [field]: value,
      },
    }))
  }

  async function loadMatches() {
    const seasonNumber = Number(season)

    if (!seasonNumber) {
      alert("Enter season number")
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from("schedule")
      .select("*")
      .eq("league_type", LEAGUE_TYPE)
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .order("game", { ascending: true })

    setLoading(false)

    if (error) {
      alert(error.message)
      setMatches([])
      return
    }

    setMatches((data || []) as ScheduleMatch[])
  }

  async function saveResult(match: ScheduleMatch) {
    const key = matchKey(match)
    const score = getScore(match)

    const p1Easy = Number(score.p1Easy)
    const p1Hard = Number(score.p1Hard)
    const p2Easy = Number(score.p2Easy)
    const p2Hard = Number(score.p2Hard)

    if (
      score.p1Easy === "" ||
      score.p1Hard === "" ||
      score.p2Easy === "" ||
      score.p2Hard === ""
    ) {
      alert("Enter Easy and Hard scores for both players")
      return
    }

    if ([p1Easy, p1Hard, p2Easy, p2Hard].some((n) => Number.isNaN(n))) {
      alert("Scores must be numbers")
      return
    }

    const player1Score = p1Easy + p1Hard
    const player2Score = p2Easy + p2Hard

    let winner = "Draw"
    let player1_points = 1
    let player2_points = 1

    if (player1Score < player2Score) {
      winner = match.player1
      player1_points = 3
      player2_points = 0
    }

    if (player2Score < player1Score) {
      winner = match.player2
      player1_points = 0
      player2_points = 3
    }

    setSavingKey(key)

    const fullPayload = {
      league_type: LEAGUE_TYPE,
      division: match.division,
      season_number: match.season_number,
      game: match.game,
      course: match.course,
      player1: match.player1,
      player2: match.player2,

      player1_score: player1Score,
      player2_score: player2Score,

      player1_easy_score: p1Easy,
      player1_hard_score: p1Hard,
      player2_easy_score: p2Easy,
      player2_hard_score: p2Hard,

      player1_points,
      player2_points,
      winner,
    }

    const basicPayload = {
      league_type: LEAGUE_TYPE,
      division: match.division,
      season_number: match.season_number,
      game: match.game,
      course: match.course,
      player1: match.player1,
      player2: match.player2,
      player1_score: player1Score,
      player2_score: player2Score,
      winner,
    }

    let { error } = await supabase.from("results").insert(fullPayload)

    if (error) {
      const retry = await supabase.from("results").insert(basicPayload)
      error = retry.error
    }

    setSavingKey("")

    if (error) {
      alert(error.message)
      return
    }

    alert(
      `Saved ✔\n${match.player1}: ${player1Score}\n${match.player2}: ${player2Score}\nWinner: ${winner}`
    )
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Pro Results</h1>

      <p style={{ color: "#aaa" }}>
        Enter Easy + Hard scores. Lowest combined total wins the head-to-head match.
      </p>

      <div style={{ marginTop: 16 }}>
        <label>Division</label>
        <br />
        <select value={division} onChange={(e) => setDivision(e.target.value)} style={inputStyle}>
          {DIVISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>Season</label>
        <br />
        <input value={season} onChange={(e) => setSeason(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={loadMatches}
          disabled={loading}
          style={{
            background: loading ? "#555" : "#2563eb",
            border: "none",
            padding: "10px 16px",
            borderRadius: "8px",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading..." : "Load Matches"}
        </button>
      </div>

      <div style={{ marginTop: 28 }}>
        {matches.length === 0 ? (
          <p style={{ color: "#888" }}>No matches loaded yet.</p>
        ) : (
          matches.map((match) => {
            const key = matchKey(match)
            const score = getScore(match)

            const p1Total =
              score.p1Easy !== "" && score.p1Hard !== ""
                ? Number(score.p1Easy) + Number(score.p1Hard)
                : ""

            const p2Total =
              score.p2Easy !== "" && score.p2Hard !== ""
                ? Number(score.p2Easy) + Number(score.p2Hard)
                : ""

            return (
              <div
                key={key}
                style={{
                  border: "1px solid #333",
                  borderRadius: "10px",
                  padding: 16,
                  marginBottom: 18,
                  background: "#050505",
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  Game {match.game}: {match.player1} vs {match.player2}
                </h3>

                <p style={{ color: "#aaa" }}>
                  Map: <strong>{match.course}</strong>
                </p>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ width: 180 }}>{match.player1}</strong>

                  <input
                    placeholder="Easy"
                    value={score.p1Easy}
                    onChange={(e) => updateScore(match, "p1Easy", e.target.value)}
                    style={smallInputStyle}
                  />

                  <input
                    placeholder="Hard"
                    value={score.p1Hard}
                    onChange={(e) => updateScore(match, "p1Hard", e.target.value)}
                    style={smallInputStyle}
                  />

                  <span>Total: {p1Total}</span>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginTop: 12,
                  }}
                >
                  <strong style={{ width: 180 }}>{match.player2}</strong>

                  <input
                    placeholder="Easy"
                    value={score.p2Easy}
                    onChange={(e) => updateScore(match, "p2Easy", e.target.value)}
                    style={smallInputStyle}
                  />

                  <input
                    placeholder="Hard"
                    value={score.p2Hard}
                    onChange={(e) => updateScore(match, "p2Hard", e.target.value)}
                    style={smallInputStyle}
                  />

                  <span>Total: {p2Total}</span>
                </div>

                <button
                  onClick={() => saveResult(match)}
                  disabled={savingKey === key}
                  style={{
                    marginTop: 16,
                    background: savingKey === key ? "#555" : "#22c55e",
                    border: "none",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    color: "white",
                    cursor: savingKey === key ? "not-allowed" : "pointer",
                  }}
                >
                  {savingKey === key ? "Saving..." : "Save Result"}
                </button>
              </div>
            )
          })
        )}
      </div>
    </main>
  )
}