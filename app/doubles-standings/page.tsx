"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { findCanonicalFamilyConflicts, loadCanonicalPlayerDisplays } from "@/lib/canonicalPlayerDisplay"

const DIVISIONS = [
  "Doubles Elite",
  "Doubles D1",
  "Doubles D2",
  "Doubles D3",
  "Doubles D4",
  "Doubles D5",
  "Doubles D6",
]

type StandingRow = {
  player_id: string
  points: number | null
  wins: number | null
  losses: number | null
  ties: number | null
  rank: number | null
}

type Standing = {
  playerId: string
  player: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  rank: number
}

type HistoricalStanding = {
  season_number: number
  division: string
  season_team_id: string
  global_team_id: string
  team_name: string
  player_1_id: string
  player_2_id: string | null
  player_1_name: string
  player_2_name: string | null
  player_2_state: string
  played: number | null
  wins: number | null
  losses: number | null
  draws: number | null
  points: number | null
  holes_won: number | null
}

export default function DoublesStandingsPage() {
  const [division, setDivision] = useState("Doubles Elite")
  const [season, setSeason] = useState("59")
  const [standings, setStandings] = useState<Standing[]>([])
  const [historicalStandings, setHistoricalStandings] = useState<HistoricalStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  async function loadStandings() {
    const seasonNumber = Number(season)

    if (!seasonNumber) {
      setStandings([])
      setHistoricalStandings([])
      setMessage("Enter a valid season number.")
      return
    }

    setLoading(true)
    setMessage("")
    setHistoricalStandings([])

    const historicalDivision = division.match(/D(\d+)$/)?.[1] || null
    if (seasonNumber <= 20 && historicalDivision) {
      const { data: historicalData, error: historicalError } = await supabase
        .from("doubles_historical_public_standings")
        .select("season_number, division, season_team_id, global_team_id, team_name, player_1_id, player_2_id, player_1_name, player_2_name, player_2_state, played, wins, losses, draws, points, holes_won")
        .eq("season_number", seasonNumber)
        .eq("division", historicalDivision)
        .order("points", { ascending: false, nullsFirst: false })
        .order("holes_won", { ascending: false, nullsFirst: false })
        .order("team_name", { ascending: true })

      if (!historicalError && historicalData && historicalData.length > 0) {
        setStandings([])
        setHistoricalStandings(historicalData as HistoricalStanding[])
        setLoading(false)
        return
      }
    }

    const { data, error } = await supabase
      .from("season_standings")
      .select("player_id, points, wins, losses, ties, rank")
      .eq("league_type", "doubles")
      .eq("division", division)
      .eq("season_number", seasonNumber)
      .order("rank", { ascending: true })

    if (error) {
      setStandings([])
      setHistoricalStandings([])
      setMessage(error.message)
      setLoading(false)
      return
    }

    const savedRows = (data || []) as StandingRow[]
    const playerIds = savedRows.map((row) => row.player_id).filter(Boolean)

    let playerMap = new Map<string, { id: string; screen_name: string }>()

    if (playerIds.length > 0) {
      const { data: playerData, error: playerError } = await loadCanonicalPlayerDisplays(playerIds)

      if (playerError) {
        setStandings([])
        setMessage(playerError.message)
        setLoading(false)
        return
      }

      const conflicts = findCanonicalFamilyConflicts(playerIds, playerData)
      if (conflicts.length > 0) {
        setStandings([])
        setMessage("Standings data conflict: multiple identity rows resolve to the same current player.")
        setLoading(false)
        return
      }

      playerMap = new Map(playerData.filter((player) => player.eligible && player.canonical_player_id && player.screen_name).map((player) => [
        player.source_player_id,
        { id: player.canonical_player_id!, screen_name: player.screen_name! },
      ]))
    }

    const rows = savedRows.filter((row) => playerMap.has(row.player_id)).map((row) => {
      const wins = Number(row.wins || 0)
      const draws = Number(row.ties || 0)
      const losses = Number(row.losses || 0)

      return {
        playerId: playerMap.get(row.player_id)!.id,
        player: playerMap.get(row.player_id)!.screen_name,
        played: wins + draws + losses,
        wins,
        draws,
        losses,
        points: Number(row.points || 0),
        rank: Number(row.rank || 0),
      }
    })

    setStandings(rows)
    setHistoricalStandings([])

    if (rows.length === 0) {
      setMessage("No saved standings found for this division and season.")
    }

    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadStandings())
    // The loader is intentionally recreated with the selected route controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [division, season])

  return (
    <main style={page}>
      <div style={container}>
        <Link href="/doubles" style={backButton}>
          ← Doubles
        </Link>

        <section style={hero}>
          <h1 style={title}>👥 Doubles Standings</h1>

          <p style={subtitle}>
            View current saved standings or available Historical Doubles standings.
          </p>

          <div style={controls}>
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
                value={season}
                onChange={(event) => setSeason(event.target.value)}
                style={input}
              />
            </div>
          </div>
        </section>

        {loading ? (
          <div style={messageCard}>Loading standings...</div>
        ) : historicalStandings.length > 0 ? (
          <div>
            <div style={historicalBanner}>Historical Doubles · Season {season} · {division}</div>
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Team</th>
                    <th style={th}>Players</th>
                    <th style={th}>Played</th>
                    <th style={th}>Wins</th>
                    <th style={th}>Draws</th>
                    <th style={th}>Losses</th>
                    <th style={th}>Points</th>
                    <th style={th}>Holes Won</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalStandings.map((row) => (
                    <tr key={row.season_team_id}>
                      <td style={playerCell}>{row.team_name}</td>
                      <td style={td}>{[row.player_1_name, row.player_2_name].filter(Boolean).join(" + ")}</td>
                      <td style={td}>{row.played ?? "—"}</td>
                      <td style={td}>{row.wins ?? "—"}</td>
                      <td style={td}>{row.draws ?? "—"}</td>
                      <td style={td}>{row.losses ?? "—"}</td>
                      <td style={playerCell}>{row.points ?? "—"}</td>
                      <td style={td}>{row.holes_won ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : standings.length === 0 ? (
          <div style={messageCard}>{message}</div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Rank</th>
                  <th style={th}>Player</th>
                  <th style={th}>Played</th>
                  <th style={th}>Wins</th>
                  <th style={th}>Draws</th>
                  <th style={th}>Losses</th>
                  <th style={th}>Points</th>
                </tr>
              </thead>

              <tbody>
                {standings.map((row) => (
                  <tr key={row.playerId}>
                    <td style={td}>{row.rank}</td>
                    <td style={playerCell}>{row.player}</td>
                    <td style={td}>{row.played}</td>
                    <td style={td}>{row.wins}</td>
                    <td style={td}>{row.draws}</td>
                    <td style={td}>{row.losses}</td>
                    <td style={playerCell}>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  padding: "30px 18px",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  margin: "0 auto",
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 18,
  padding: "10px 16px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 10,
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const hero: React.CSSProperties = {
  padding: 26,
  background: "rgba(2, 6, 23, 0.9)",
  border: "1px solid #334155",
  borderRadius: 20,
  marginBottom: 20,
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 42,
}

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.5,
}

const controls: React.CSSProperties = {
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

const historicalBanner: React.CSSProperties = {
  marginBottom: 12,
  padding: "12px 16px",
  border: "1px solid #0ea5e9",
  borderRadius: 12,
  background: "rgba(8, 47, 73, 0.7)",
  color: "#bae6fd",
  fontWeight: 800,
}

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 12,
}

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 680,
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: 12,
  borderBottom: "1px solid #475569",
}

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #334155",
}

const playerCell: React.CSSProperties = {
  ...td,
  fontWeight: 800,
}
