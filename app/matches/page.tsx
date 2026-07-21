"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

type ScheduledMatch = {
  id: string
  league_type: string | null
  division: string | null
  season_number: number | null
  game: string | number | null
  course: string | null
  player1_id: string | null
  player2_id: string | null
}

type Result = {
  id: string
  league_type: string | null
  division: string | null
  season_number: number | null
  player1_id: string | null
  player2_id: string | null
  player1_score: number | null
  player2_score: number | null
  is_draw: boolean | null
}

const DIVISIONS = [
  "Stroke D1",
  "Stroke D2",
  "Stroke D3",
  "Stroke D4",
  "Stroke D5",
  "Match Play D1",
  "Match Play D2",
  "Match Play D3",
  "Match Play D4",
  "Match Play D5",
  "Match Play D6",
  "Amateur D1",
  "Semi Pro D1",
  "Pro D1",
  "Pro D2",
  "Pro D3",
  "Doubles Elite",
  "Doubles D1",
  "Doubles D2",
  "Doubles D3",
  "Doubles D4",
  "Doubles D5",
  "Doubles D6",
  "PYP D1",
  "PYP D2",
  "PYP D3",
  "PYP D4",
  "PYP D5",
]

export default function MatchesPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [schedule, setSchedule] = useState<ScheduledMatch[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [division, setDivision] = useState("Stroke D1")
  const [seasonNumber, setSeasonNumber] = useState("59")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [playersResponse, scheduleResponse, resultsResponse] =
      await Promise.all([
        supabase.from("players").select("id, screen_name"),
        supabase
          .from("schedule")
          .select(
            "id, league_type, division, season_number, game, course, player1_id, player2_id"
          )
          .order("game", { ascending: true }),
        supabase
          .from("results")
          .select(
            "id, league_type, division, season_number, player1_id, player2_id, player1_score, player2_score, is_draw"
          ),
      ])

    setPlayers(playersResponse.data || [])
    setSchedule(scheduleResponse.data || [])
    setResults(resultsResponse.data || [])
    setLoading(false)
  }

  const playerNames = useMemo(() => {
    const map = new Map<string, string>()

    players.forEach((player) => {
      map.set(player.id, player.screen_name)
    })

    return map
  }, [players])

  function getPlayerName(playerId: string | null) {
    if (!playerId) return "Unknown Player"
    return playerNames.get(playerId) || "Unknown Player"
  }

  function samePlayers(
    firstPlayer1: string | null,
    firstPlayer2: string | null,
    secondPlayer1: string | null,
    secondPlayer2: string | null
  ) {
    return (
      (firstPlayer1 === secondPlayer1 && firstPlayer2 === secondPlayer2) ||
      (firstPlayer1 === secondPlayer2 && firstPlayer2 === secondPlayer1)
    )
  }

  const visibleMatches = useMemo(() => {
    return schedule
      .filter(
        (match) =>
          match.division === division &&
          Number(match.season_number) === Number(seasonNumber)
      )
      .map((match) => {
        const result = results.find(
          (row) =>
            row.division === match.division &&
            Number(row.season_number) === Number(match.season_number) &&
            samePlayers(
              row.player1_id,
              row.player2_id,
              match.player1_id,
              match.player2_id
            )
        )

        return {
          ...match,
          result,
        }
      })
  }, [schedule, results, division, seasonNumber])

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <Link href="/" style={backButton}>
            ← Krys Leagues
          </Link>
        </div>

        <div style={headerCard}>
          <h1 style={title}>My Matches</h1>

          <p style={subtitle}>
            See completed matches, scores, and games still waiting to be played.
          </p>

          <div style={filterGrid}>
            <div>
              <label style={label}>Division</label>

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
            </div>

            <div>
              <label style={label}>Season</label>

              <input
                value={seasonNumber}
                onChange={(event) => setSeasonNumber(event.target.value)}
                style={input}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div style={messageCard}>Loading matches...</div>
        ) : visibleMatches.length === 0 ? (
          <div style={messageCard}>
            No matches were found for this division and season.
          </div>
        ) : (
          <div style={matchGrid}>
            {visibleMatches.map((match) => {
              const complete = Boolean(match.result)

              return (
                <div key={match.id} style={matchCard}>
                  <div style={matchTopRow}>
                    <span style={gameBadge}>Game {match.game || "?"}</span>

                    <span style={complete ? completeBadge : waitingBadge}>
                      {complete ? "✓ Complete" : "Not Played"}
                    </span>
                  </div>

                  <div style={playersRow}>
                    <div style={playerBox}>
                      <strong>{getPlayerName(match.player1_id)}</strong>

                      <span style={score}>
                        {complete
                          ? match.result?.player1_score ?? "-"
                          : "Waiting"}
                      </span>
                    </div>

                    <span style={versus}>vs</span>

                    <div style={playerBox}>
                      <strong>{getPlayerName(match.player2_id)}</strong>

                      <span style={score}>
                        {complete
                          ? match.result?.player2_score ?? "-"
                          : "Waiting"}
                      </span>
                    </div>
                  </div>

                  <div style={matchDetails}>
                    <span>Course: {match.course || "Not assigned"}</span>

                    {!complete && <span>Due by: To be assigned</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
  padding: "28px 18px",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  margin: "0 auto",
}

const topBar: React.CSSProperties = {
  marginBottom: 18,
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 16px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 10,
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const headerCard: React.CSSProperties = {
  padding: 26,
  background: "rgba(2, 6, 23, 0.9)",
  border: "1px solid #334155",
  borderRadius: 20,
  marginBottom: 20,
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 40,
}

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
  lineHeight: 1.5,
}

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginTop: 20,
}

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontWeight: 700,
}

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  background: "#0f172a",
  color: "white",
  border: "1px solid #475569",
  borderRadius: 10,
  fontSize: 17,
}

const messageCard: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  textAlign: "center",
  color: "#cbd5e1",
}

const matchGrid: React.CSSProperties = {
  display: "grid",
  gap: 16,
}

const matchCard: React.CSSProperties = {
  padding: 20,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
}

const matchTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 18,
}

const gameBadge: React.CSSProperties = {
  padding: "6px 10px",
  background: "#1e293b",
  borderRadius: 999,
  fontWeight: 800,
}

const completeBadge: React.CSSProperties = {
  padding: "6px 10px",
  background: "#166534",
  borderRadius: 999,
  fontWeight: 800,
}

const waitingBadge: React.CSSProperties = {
  padding: "6px 10px",
  background: "#92400e",
  borderRadius: 999,
  fontWeight: 800,
}

const playersRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: 14,
  alignItems: "center",
}

const playerBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "#020617",
  borderRadius: 12,
  textAlign: "center",
  fontSize: 18,
}

const score: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
}

const versus: React.CSSProperties = {
  color: "#94a3b8",
  fontWeight: 800,
}

const matchDetails: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 16,
  color: "#cbd5e1",
}