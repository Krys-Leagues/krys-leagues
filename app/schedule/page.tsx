"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function SchedulePage() {
  const [schedule, setSchedule] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [division, setDivision] = useState("Stroke D1")
  const [seasonNumber, setSeasonNumber] = useState("59")
  const [posting, setPosting] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: scheduleData } = await supabase
      .from("schedule")
      .select("*")
      .order("game", { ascending: true })

    const { data: playersData } = await supabase
      .from("players")
      .select("*")

    if (scheduleData) setSchedule(scheduleData)
    if (playersData) setPlayers(playersData)
  }

  function getPlayerName(id: string) {
    return players.find((p) => p.id === id)?.screen_name || "Unknown Player"
  }

  const filteredSchedule = schedule.filter(
    (m) =>
      m.division === division &&
      Number(m.season_number) === Number(seasonNumber)
  )

  const games = ["1", "2", "3"]

  async function postToDiscord() {
    setPosting(true)

    const messageLines: string[] = []

    messageLines.push(`📅 **${division} Season ${seasonNumber} Schedule**`)
    messageLines.push("")

    games.forEach((gameNumber) => {
      const gameMatches = filteredSchedule.filter(
        (m) => String(m.game) === gameNumber
      )

      if (gameMatches.length > 0) {
        messageLines.push(`**Game ${gameNumber}**`)

        gameMatches.forEach((match) => {
          messageLines.push(
            `${getPlayerName(match.player1_id)} vs ${getPlayerName(
              match.player2_id
            )} — ${match.course}`
          )
        })

        messageLines.push("")
      }
    })

    const content = messageLines.join("\n")

    const res = await fetch("/api/post-schedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, division }),
    })

    setPosting(false)

    if (!res.ok) {
      alert("Discord post failed")
      return
    }

    alert("Schedule posted to Discord!")
  }

  async function generateMatches() {
    setGenerating(true)

    const res = await fetch("/api/create-matches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        matches: filteredSchedule.map((m) => ({
          league_type: m.league_type || division,
          division: m.division,
          player1_id: m.player1_id,
          player2_id: m.player2_id,
          player1_score: null,
          player2_score: null,
          player1_points: null,
          player2_points: null,
          player1_total_holes: null,
          player2_total_holes: null,
        })),
      }),
    })

    setGenerating(false)

    if (!res.ok) {
      alert("Failed to generate matches")
      return
    }

    alert("Matches created successfully!")
  }

  async function deleteScheduledMatch(id: string) {
    const confirmDelete = confirm("Delete this scheduled match?")

    if (!confirmDelete) return

    const { error } = await supabase
      .from("schedule")
      .delete()
      .eq("id", id)

    if (error) {
      alert("Delete failed")
      return
    }

    setSchedule((current) =>
      current.filter((match) => match.id !== id)
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Schedule</h1>

      <label>Division</label>
      <br />
      <select value={division} onChange={(e) => setDivision(e.target.value)}>
        <option>Stroke D1</option>
        <option>Stroke D2</option>
        <option>Stroke D3</option>
        <option>Stroke D4</option>
        <option>Stroke D5</option>

        <option>Match Play D1</option>
        <option>Match Play D2</option>
        <option>Match Play D3</option>
        <option>Match Play D4</option>
        <option>Match Play D5</option>
        <option>Match Play D6</option>

        <option>Amateur D1</option>
        <option>Semi Pro D1</option>
        <option>Pro D1</option>
        <option>Pro D2</option>
        <option>Pro D3</option>

        <option>Doubles Elite</option>
        <option>Doubles D1</option>
        <option>Doubles D2</option>
        <option>Doubles D3</option>
        <option>Doubles D4</option>
        <option>Doubles D5</option>
        <option>Doubles D6</option>

        <option>PYP D1</option>
        <option>PYP D2</option>
        <option>PYP D3</option>
        <option>PYP D4</option>
        <option>PYP D5</option>
      </select>

      <br /><br />

      <label>Season</label>
      <br />
      <input
        value={seasonNumber}
        onChange={(e) => setSeasonNumber(e.target.value)}
      />

      <br /><br />

      <button onClick={postToDiscord} disabled={posting}>
        {posting ? "Posting..." : "Post Schedule to Discord"}
      </button>

      <br /><br />

      <button onClick={generateMatches} disabled={generating}>
        {generating ? "Generating..." : "Generate Matches"}
      </button>

      <br /><br />

      {filteredSchedule.length === 0 ? (
        <p>No scheduled matches for this division.</p>
      ) : (
        games.map((gameNumber) => {
          const gameMatches = filteredSchedule.filter(
            (m) => String(m.game) === gameNumber
          )

          if (gameMatches.length === 0) return null

          return (
            <div key={gameNumber}>
              <h2>Game {gameNumber}</h2>

              <table border={1} cellPadding={8}>
                <thead>
                  <tr>
                    <th>Player 1</th>
                    <th>Player 2</th>
                    <th>Course</th>
                    <th>Delete</th>
                  </tr>
                </thead>

                <tbody>
                  {gameMatches.map((match) => (
                    <tr key={match.id}>
                      <td>{getPlayerName(match.player1_id)}</td>
                      <td>{getPlayerName(match.player2_id)}</td>
                      <td>{match.course}</td>
                      <td>
                        <button
                          onClick={() =>
                            deleteScheduledMatch(match.id)
                          }
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <br />
            </div>
          )
        })
      )}
    </main>
  )
}