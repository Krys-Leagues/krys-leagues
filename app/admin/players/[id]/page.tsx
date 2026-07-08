"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  discord_username: string | null
  status: string | null
  active: boolean | null
}

type Membership = {
  id: string
  league_type: string | null
  season_number: number | null
  division: string | null
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

type ResultRow = {
  id: string
  player1_id: string | null
  player2_id: string | null
  winner: string | null
  is_draw: boolean | null
}

type CareerStats = {
  matchesPlayed: number
  wins: number
  losses: number
  draws: number
  winPercent: string
}

export default function PlayerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const playerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [player, setPlayer] = useState<Player | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [careerStats, setCareerStats] = useState<CareerStats>({
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winPercent: "0%",
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    if (!playerId) return

    setLoading(true)

    const { data: playerData } = await supabase
      .from("players")
      .select("id, screen_name, discord_username, status, active")
      .eq("id", playerId)
      .single()

    setPlayer(playerData)

    const { data: membershipData } = await supabase
      .from("player_league_memberships")
      .select("id, league_type, season_number, division")
      .eq("player_id", playerId)
      .order("season_number", { ascending: false })

    setMemberships(membershipData || [])

    const { data: trophyData } = await supabase
      .from("player_trophies")
      .select("*")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })

    setTrophies(trophyData || [])

    const { data: resultData } = await supabase
      .from("results")
      .select("id, player1_id, player2_id, winner, is_draw")
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)

    const results = (resultData || []) as ResultRow[]

    const matchesPlayed = results.length
    const draws = results.filter((result) => result.is_draw).length

    const wins = results.filter((result) => {
      if (!playerData?.screen_name) return false
      return result.winner === playerData.screen_name
    }).length

    const losses = matchesPlayed - wins - draws

    const winPercent =
      matchesPlayed > 0 ? `${Math.round((wins / matchesPlayed) * 100)}%` : "0%"

    setCareerStats({
      matchesPlayed,
      wins,
      losses,
      draws,
      winPercent,
    })

    setLoading(false)
  }
    if (loading) {
    return <p style={{ color: "white", padding: 20 }}>Loading player...</p>
  }

  if (!player) {
    return (
      <main style={page}>
        <div style={container}>
          <button onClick={() => router.push("/admin/players")} style={backButton}>
            ← Players
          </button>

          <div style={card}>
            <h1>Player not found</h1>
            <p style={muted}>This player profile could not be loaded.</p>
          </div>
        </div>
      </main>
    )
  }

  const status = player.status || (player.active === false ? "inactive" : "active")
const currentMembership = memberships[0]

const totalSeasons = new Set(
  memberships
    .map((m) => m.season_number)
    .filter((s) => s !== null)
).size
  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button onClick={() => router.push("/admin/players")} style={backButton}>
            ← Players
          </button>

          <button onClick={() => router.push("/admin")} style={backButtonSecondary}>
            ← Admin
          </button>
        </div>

        <div style={card}>
          <h1 style={playerName}>{player.screen_name}</h1>

          <div style={quickStats}>
            <div style={statBox}>
              <strong>Status</strong>
              <span>{status}</span>
            </div>

            <div style={statBox}>
              <strong>Leagues</strong>
              <span>{memberships.length}</span>
            </div>

            <div style={statBox}>
              <strong>Trophies</strong>
              <span>{trophies.length}</span>
            </div>

            <div style={statBox}>
              <strong>Matches</strong>
              <span>{careerStats.matchesPlayed}</span>
            </div>

            <div style={statBox}>
              <strong>Wins</strong>
              <span>{careerStats.wins}</span>
            </div>

            <div style={statBox}>
              <strong>Win %</strong>
              <span>{careerStats.winPercent}</span>
            </div>
          </div>

          <p style={muted}>Player ID: {player.id}</p>

          {player.discord_username && (
            <p style={muted}>Discord: {player.discord_username}</p>
          )}
        </div>

        <div style={card}>
          <h2>Career Stats</h2>

          <div style={quickStats}>
            <div style={statBox}>
              <strong>Matches Played</strong>
              <span>{careerStats.matchesPlayed}</span>
            </div>

            <div style={statBox}>
              <strong>Wins</strong>
              <span>{careerStats.wins}</span>
            </div>

            <div style={statBox}>
              <strong>Losses</strong>
              <span>{careerStats.losses}</span>
            </div>

            <div style={statBox}>
              <strong>Draws</strong>
              <span>{careerStats.draws}</span>
            </div>

            <div style={statBox}>
              <strong>Win %</strong>
              <span>{careerStats.winPercent}</span>
            </div>
          </div>
        </div>
        <div style={card}>
          <h2>Career Summary</h2>

          <div style={quickStats}>
            <div style={statBox}>
              <strong>Total Seasons</strong>
              <span>{totalSeasons}</span>
            </div>

            <div style={statBox}>
              <strong>Current League</strong>
              <span>{currentMembership?.league_type || "-"}</span>
            </div>

            <div style={statBox}>
              <strong>Current Division</strong>
              <span>{currentMembership?.division || "-"}</span>
            </div>

            <div style={statBox}>
              <strong>Status</strong>
              <span>{status}</span>
            </div>
          </div>
        </div>
        <div style={card}>
          <h2>League Memberships ({memberships.length})</h2>

          {memberships.length === 0 ? (
            <p style={emptyText}>No league memberships yet.</p>
          ) : (
            <div style={grid}>
              {memberships.map((membership) => (
                <div key={membership.id} style={miniCard}>
                  <h3>{membership.league_type || "League"}</h3>
                  <p>{membership.division || "No division"}</p>
                  <p style={muted}>Season {membership.season_number || "?"}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <h2>🏆 Trophies ({trophies.length})</h2>
                    {trophies.length === 0 ? (
            <p style={emptyText}>No trophies yet.</p>
          ) : (
            <div style={grid}>
              {trophies.map((t) => (
                <div key={t.id} style={trophyCard}>
                  <h3>{t.trophy_title || t.placement || "Trophy"}</h3>

                  <p>{t.event_name || "Event not listed"}</p>
                  <p>{t.division || "Division not listed"}</p>

                  <p style={muted}>
                    {[t.season, t.week].filter(Boolean).join(" / ")}
                  </p>

                  {t.image_url && (
                    <img
                      src={t.image_url}
                      alt={t.trophy_title || "Player trophy"}
                      style={{
                        width: "100%",
                        borderRadius: 10,
                        marginTop: 10,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  display: "flex",
  justifyContent: "center",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  padding: 30,
}

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 20,
}

const backButton: React.CSSProperties = {
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
  padding: 24,
  marginBottom: 20,
}

const playerName: React.CSSProperties = {
  fontSize: 36,
  marginBottom: 14,
}

const quickStats: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 16,
}

const statBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  background: "#111",
  border: "1px solid #333",
  borderRadius: 12,
  padding: 14,
}

const muted: React.CSSProperties = {
  color: "#aaa",
  margin: "6px 0",
}

const emptyText: React.CSSProperties = {
  color: "#888",
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 16,
}

const miniCard: React.CSSProperties = {
  background: "#111",
  border: "1px solid #444",
  borderRadius: 12,
  padding: 14,
}

const trophyCard: React.CSSProperties = {
  background: "#111",
  border: "1px solid #444",
  borderRadius: 12,
  padding: 14,
}