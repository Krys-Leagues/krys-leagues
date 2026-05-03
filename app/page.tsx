"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Player = {
  id: string
  screen_name: string
  division?: string | null
}

type Match = {
  id: string
  league_type?: string | null
  division?: string | null
  player1_id?: string | null
  player2_id?: string | null
  player1_score?: number | null
  player2_score?: number | null
  player1_points?: number | null
  player2_points?: number | null
  player1_total_holes?: number | null
  player2_total_holes?: number | null
}

type LeaderboardRow = {
  playerId: string
  name: string
  division: string
  games: number
  points: number
  holes: number
  wins: number
  draws: number
  losses: number
  totalScore: number
}

export default function HomePage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedLeagueType, setSelectedLeagueType] =
    useState("stroke_play")
  const [selectedDivision, setSelectedDivision] = useState("All")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .order("screen_name", { ascending: true })

    const { data: matchesData } = await supabase
      .from("matches")
      .select("*")
      .order("id", { ascending: false })

    setPlayers(playersData || [])
    setMatches(matchesData || [])
    setLoading(false)
  }

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>()
    players.forEach((p) => map.set(p.id, p))
    return map
  }, [players])

  // 🧠 CLEAN NORMALIZER (FIXES ALL STRING ISSUES)
  const normalize = (v?: string | null) =>
    (v || "").toLowerCase().replace(/\s+/g, "_")

  const leaderboard = useMemo(() => {
    const rows = new Map<string, LeaderboardRow>()

    function getRow(playerId: string): LeaderboardRow {
      const player = playerMap.get(playerId)

      if (!rows.has(playerId)) {
        rows.set(playerId, {
          playerId,
          name: player?.screen_name || "Unknown Player",
          division: player?.division || "No Division",
          games: 0,
          points: 0,
          holes: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          totalScore: 0,
        })
      }

      return rows.get(playerId)!
    }

    // 🔥 NEW STRUCTURE FILTER (CLEAN + STABLE)
    const filteredMatches = matches.filter((match) => {
      if (!match.player1_id || !match.player2_id) return false

      const matchLeague = normalize(match.league_type)

      // league filter (only if value exists)
      if (matchLeague && matchLeague !== selectedLeagueType) {
        return false
      }

      // division filter
      if (
        selectedDivision !== "All" &&
        match.division !== selectedDivision
      ) {
        return false
      }

      return true
    })

    filteredMatches.forEach((match) => {
      const p1 = getRow(match.player1_id!)
      const p2 = getRow(match.player2_id!)

      const p1Score = Number(match.player1_score ?? 0)
      const p2Score = Number(match.player2_score ?? 0)

      const p1Holes = Number(match.player1_total_holes ?? 0)
      const p2Holes = Number(match.player2_total_holes ?? 0)

      p1.games += 1
      p2.games += 1

      p1.totalScore += p1Score
      p2.totalScore += p2Score

      if (selectedLeagueType === "match_play_standard") {
        const p1Points =
          match.player1_points != null
            ? Number(match.player1_points)
            : p1Score > p2Score
            ? 3
            : p1Score === p2Score
            ? 1
            : 0

        const p2Points =
          match.player2_points != null
            ? Number(match.player2_points)
            : p2Score > p1Score
            ? 3
            : p2Score === p1Score
            ? 1
            : 0

        p1.points += p1Points
        p2.points += p2Points

        p1.holes += p1Holes
        p2.holes += p2Holes

        if (p1Points > p2Points) {
          p1.wins++
          p2.losses++
        } else if (p2Points > p1Points) {
          p2.wins++
          p1.losses++
        } else {
          p1.draws++
          p2.draws++
        }
      } else {
        if (p1Score < p2Score) {
          p1.wins++
          p2.losses++
          p1.points += 3
        } else if (p2Score < p1Score) {
          p2.wins++
          p1.losses++
          p2.points += 3
        } else {
          p1.draws++
          p2.draws++
          p1.points += 1
          p2.points += 1
        }
      }
    })

    return Array.from(rows.values()).sort((a, b) => {
      if (selectedLeagueType === "match_play_standard") {
        return b.points - a.points || b.holes - a.holes || b.wins - a.wins
      }

      return (
        b.points - a.points ||
        b.wins - a.wins ||
        a.totalScore - b.totalScore
      )
    })
  }, [matches, playerMap, selectedLeagueType, selectedDivision])

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">
          Walkabout Mini Golf Leaderboard
        </h1>

        <div className="flex gap-4 mb-6">
          <select
            value={selectedLeagueType}
            onChange={(e) => setSelectedLeagueType(e.target.value)}
            className="bg-slate-800 p-2 rounded"
          >
            <option value="stroke_play">Stroke Play</option>
            <option value="amateur_pro">Amateur → Pro</option>
            <option value="match_play_pick">Match Play Pick</option>
            <option value="match_play_standard">
              Match Play Standard
            </option>
          </select>

          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="bg-slate-800 p-2 rounded"
          >
            <option value="All">All</option>
          </select>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : leaderboard.length === 0 ? (
          <p>No matches found for this leaderboard.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
                <th>Wins</th>
                <th>Losses</th>
              </tr>
            </thead>

            <tbody>
              {leaderboard.map((row, i) => (
                <tr key={row.playerId}>
                  <td>{i + 1}</td>
                  <td>{row.name}</td>
                  <td>{row.points}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}