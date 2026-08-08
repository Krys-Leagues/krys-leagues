"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  status: string | null
  active: boolean | null
}

type Membership = {
  id: string
  league_type: string | null
  division: string | null
  season_number: number | null
}

type Trophy = {
  id: string
  trophy_title: string | null
  placement: string | null
  event_name: string | null
  division: string | null
  season: string | null
  week: string | null
  image_url: string | null
}

type Result = {
  id: string
  player1_id: string | null
  player2_id: string | null
  winner: string | null
  is_draw: boolean | null
}

type CareerStats = {
  matches: number
  wins: number
  draws: number
  losses: number
  winPercent: number
}

type StrokeSeasonHistory = {
  season_number: number
  season_id: string
  player_screen_name: string
  division_number: number
  division_rank: number
  completed_game_count: number
  wins: number
  losses: number
  ties: number
  points: number
  strokes: number
}

export default function PublicPlayerProfilePage() {
  const params = useParams()
  const playerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [player, setPlayer] = useState<Player | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [strokeHistory, setStrokeHistory] = useState<StrokeSeasonHistory[]>([])
  const [strokeHistoryError, setStrokeHistoryError] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    loadProfile()
  }, [playerId])

  async function loadProfile() {
    if (!playerId) {
      setMessage("Player not found.")
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage("")
    setStrokeHistoryError("")

    const [
      playerResponse,
      membershipsResponse,
      trophiesResponse,
      resultsResponse,
      strokeHistoryResponse,
    ] = await Promise.all([
      supabase
        .from("players")
        .select("id, screen_name, status, active")
        .eq("id", playerId)
        .maybeSingle(),

      supabase
        .from("player_league_memberships")
        .select("id, league_type, division, season_number")
        .eq("player_id", playerId)
        .order("season_number", { ascending: false }),

      supabase
        .from("player_trophies")
        .select(
          "id, trophy_title, placement, event_name, division, season, week, image_url"
        )
        .eq("player_id", playerId),

      supabase
        .from("results")
        .select("id, player1_id, player2_id, winner, is_draw")
        .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`),

      supabase.rpc("get_public_stroke_player_history", {
        p_player_id: playerId,
      }),
    ])

    if (playerResponse.error) {
      setMessage(playerResponse.error.message)
      setLoading(false)
      return
    }

    if (!playerResponse.data) {
      setMessage("Player not found.")
      setLoading(false)
      return
    }

    setPlayer(playerResponse.data)
    setMemberships(membershipsResponse.data || [])
    setTrophies(trophiesResponse.data || [])
    setResults(resultsResponse.data || [])
    setStrokeHistory(
      (strokeHistoryResponse.data || []) as StrokeSeasonHistory[]
    )
    if (strokeHistoryResponse.error) {
      setStrokeHistoryError(
        `Stroke season history could not be loaded: ${strokeHistoryResponse.error.message}`
      )
    }
    setLoading(false)
  }

  const careerStats = useMemo<CareerStats>(() => {
    if (!player) {
      return {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winPercent: 0,
      }
    }

    const matches = results.length
    const draws = results.filter((result) => result.is_draw).length
    const wins = results.filter(
      (result) => result.winner === player.screen_name
    ).length
    const losses = Math.max(matches - wins - draws, 0)
    const winPercent =
      matches > 0 ? Math.round((wins / matches) * 100) : 0

    return {
      matches,
      wins,
      draws,
      losses,
      winPercent,
    }
  }, [player, results])

  const totalSeasons = useMemo(() => {
    return new Set(
      memberships
        .map((membership) => membership.season_number)
        .filter((seasonNumber) => seasonNumber !== null)
    ).size
  }, [memberships])

  const status =
    player?.status ||
    (player?.active === false ? "inactive" : "active")

  if (loading) {
    return (
      <main style={page}>
        <div style={container}>
          <div style={messageCard}>Loading player profile...</div>
        </div>
      </main>
    )
  }

  if (!player) {
    return (
      <main style={page}>
        <div style={container}>
          <Link href="/players" style={backButton}>
            ← Player Profiles
          </Link>

          <div style={messageCard}>
            {message || "Player not found."}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <Link href="/players" style={backButton}>
            ← Player Profiles
          </Link>

          <Link href="/" style={backButton}>
            ← Krys Leagues
          </Link>
        </div>

        <section style={hero}>
          <h1 style={title}>{player.screen_name}</h1>

          <p style={subtitle}>
            Career history, league progression, statistics, trophies, and
            achievements.
          </p>

          <span style={statusBadge}>{status.toUpperCase()}</span>
        </section>

        <section style={statsGrid}>
          <div style={statCard}>
            <strong>Matches</strong>
            <span style={statNumber}>{careerStats.matches}</span>
          </div>

          <div style={statCard}>
            <strong>Wins</strong>
            <span style={statNumber}>{careerStats.wins}</span>
          </div>

          <div style={statCard}>
            <strong>Draws</strong>
            <span style={statNumber}>{careerStats.draws}</span>
          </div>

          <div style={statCard}>
            <strong>Losses</strong>
            <span style={statNumber}>{careerStats.losses}</span>
          </div>

          <div style={statCard}>
            <strong>Win Percentage</strong>
            <span style={statNumber}>{careerStats.winPercent}%</span>
          </div>

          <div style={statCard}>
            <strong>Seasons</strong>
            <span style={statNumber}>{totalSeasons}</span>
          </div>

          <div style={statCard}>
            <strong>Trophies</strong>
            <span style={statNumber}>{trophies.length}</span>
          </div>
        </section>

        <section style={card}>
          <h2 style={sectionTitle}>League History</h2>

          {memberships.length === 0 ? (
            <p style={muted}>No league history is available yet.</p>
          ) : (
            <div style={grid}>
              {memberships.map((membership) => (
                <div key={membership.id} style={miniCard}>
                  <strong>
                    {membership.league_type || "League"}
                  </strong>

                  <span>
                    {membership.division || "No division"}
                  </span>

                  <span style={muted}>
                    Season {membership.season_number ?? "?"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={card}>
          <h2 style={sectionTitle}>Stroke Season History</h2>

          {strokeHistoryError ? (
            <p style={historyError}>{strokeHistoryError}</p>
          ) : strokeHistory.length === 0 ? (
            <p style={muted}>
              No approved Stroke season history is available yet.
            </p>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Season</th>
                    <th style={th}>Division</th>
                    <th style={th}>Final Rank</th>
                    <th style={th}>Points</th>
                    <th style={th}>Wins</th>
                    <th style={th}>Losses</th>
                    <th style={th}>Ties</th>
                    <th style={th}>Strokes</th>
                    <th style={th}>Completed Games</th>
                  </tr>
                </thead>

                <tbody>
                  {strokeHistory.map((history) => (
                    <tr key={history.season_id}>
                      <td style={td}>{history.season_number}</td>
                      <td style={td}>Stroke D{history.division_number}</td>
                      <td style={td}>{history.division_rank}</td>
                      <td style={td}>{history.points}</td>
                      <td style={td}>{history.wins}</td>
                      <td style={td}>{history.losses}</td>
                      <td style={td}>{history.ties}</td>
                      <td style={td}>{history.strokes}</td>
                      <td style={td}>{history.completed_game_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={card}>
          <h2 style={sectionTitle}>
            🏆 Trophy Case
          </h2>

          {trophies.length === 0 ? (
            <p style={muted}>No trophies have been added yet.</p>
          ) : (
            <div style={grid}>
              {trophies.map((trophy) => (
                <div key={trophy.id} style={trophyCard}>
                  <h3 style={trophyTitle}>
                    {trophy.trophy_title ||
                      trophy.placement ||
                      "Trophy"}
                  </h3>

                  <p>{trophy.event_name || "Event not listed"}</p>

                  <p style={muted}>
                    {trophy.division || "Division not listed"}
                  </p>

                  <p style={muted}>
                    {[trophy.season, trophy.week]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>

                  {trophy.image_url && (
                    <img
                      src={trophy.image_url}
                      alt={
                        trophy.trophy_title ||
                        `${player.screen_name} trophy`
                      }
                      style={trophyImage}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={linkGrid}>
          <Link href="/records" style={actionButton}>
            View League Records
          </Link>

          <Link href="/champions" style={actionButton}>
            View Hall of Champions
          </Link>

          <Link href="/standings" style={actionButton}>
            View Standings
          </Link>

          <Link href="/matches" style={actionButton}>
            View Matches
          </Link>
        </section>
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

const topBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 20,
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

const hero: React.CSSProperties = {
  padding: 26,
  background: "rgba(2, 6, 23, 0.9)",
  border: "1px solid #334155",
  borderRadius: 20,
  marginBottom: 20,
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(36px, 8vw, 52px)",
}

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.5,
}

const statusBadge: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "7px 12px",
  background: "#166534",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
}

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: 20,
}

const statCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 14,
  textAlign: "center",
}

const statNumber: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
}

const card: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 18,
  marginBottom: 20,
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
}

const miniCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
}

const trophyCard: React.CSSProperties = {
  padding: 16,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
}

const trophyTitle: React.CSSProperties = {
  marginTop: 0,
}

const trophyImage: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  borderRadius: 10,
}

const muted: React.CSSProperties = {
  color: "#94a3b8",
}

const historyError: React.CSSProperties = {
  color: "#fecaca",
}

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
}

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 850,
  borderCollapse: "collapse",
}

const th: React.CSSProperties = {
  padding: 12,
  textAlign: "left",
  borderBottom: "1px solid #475569",
  whiteSpace: "nowrap",
}

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #334155",
  whiteSpace: "nowrap",
}

const linkGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
}

const actionButton: React.CSSProperties = {
  padding: "16px 18px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 12,
  color: "white",
  textDecoration: "none",
  textAlign: "center",
  fontWeight: 800,
}

const messageCard: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  textAlign: "center",
  color: "#cbd5e1",
}
