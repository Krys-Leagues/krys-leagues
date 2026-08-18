"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadCanonicalPublicPlayers, type CanonicalPublicPlayer } from "@/lib/publicPlayers"

type Player = CanonicalPublicPlayer

type Membership = {
  id: string
  player_id: string
  league_type: string | null
  division: string | null
  season_number: number | null
}

type ScheduledMatch = {
  id: string
  player1_id: string | null
  player2_id: string | null
}

type Result = {
  id: string
  player1_id: string | null
  player2_id: string | null
}

export default function PlayerDashboardPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [schedule, setSchedule] = useState<ScheduledMatch[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [
      playersResponse,
      membershipsResponse,
      scheduleResponse,
      resultsResponse,
    ] = await Promise.all([
      loadCanonicalPublicPlayers(),

      supabase
        .from("player_league_memberships")
        .select("id, player_id, league_type, division, season_number"),

      supabase
        .from("schedule")
        .select("id, player1_id, player2_id"),

      supabase
        .from("results")
        .select("id, player1_id, player2_id"),
    ])

    const loadedPlayers = playersResponse.data || []

    setPlayers(loadedPlayers)
    setMemberships(membershipsResponse.data || [])
    setSchedule(scheduleResponse.data || [])
    setResults(resultsResponse.data || [])

    if (loadedPlayers.length > 0) {
      setSelectedPlayerId(loadedPlayers[0].id)
    }

    setLoading(false)
  }

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId),
    [players, selectedPlayerId]
  )

  const selectedIdentityIds = useMemo(
    () => new Set(selectedPlayer?.identity_player_ids || []),
    [selectedPlayer],
  )

  const playerMemberships = useMemo(
    () =>
      memberships.filter(
          (membership) => selectedIdentityIds.has(membership.player_id)
      ),
    [memberships, selectedIdentityIds]
  )

  const scheduledMatches = useMemo(
    () =>
      schedule.filter(
        (match) =>
          selectedIdentityIds.has(match.player1_id || "") ||
          selectedIdentityIds.has(match.player2_id || "")
      ),
    [schedule, selectedIdentityIds]
  )

  const completedMatches = useMemo(
    () =>
      results.filter(
        (result) =>
          selectedIdentityIds.has(result.player1_id || "") ||
          selectedIdentityIds.has(result.player2_id || "")
      ),
    [results, selectedIdentityIds]
  )

  const matchesLeft = Math.max(
    scheduledMatches.length - completedMatches.length,
    0
  )

  const status =
    selectedPlayer?.status ||
    (selectedPlayer?.active === false ? "inactive" : "active")

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <Link href="/" style={backButton}>
            ← Krys Leagues
          </Link>
        </div>

        <section style={headerCard}>
          <h1 style={title}>Player Dashboard</h1>

          <p style={subtitle}>
            Choose a player to see their leagues, matches, and progress.
          </p>

          <label style={label}>Player</label>

          <select
            value={selectedPlayerId}
            onChange={(event) => setSelectedPlayerId(event.target.value)}
            style={select}
          >
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.screen_name}
              </option>
            ))}
          </select>
        </section>

        {loading ? (
          <div style={card}>Loading dashboard...</div>
        ) : !selectedPlayer ? (
          <div style={card}>No player selected.</div>
        ) : (
          <>
            <section style={card}>
              <h2 style={playerName}>{selectedPlayer.screen_name}</h2>

              <div style={statsGrid}>
                <div style={statBox}>
                  <strong>Status</strong>
                  <span>{status}</span>
                </div>

                <div style={statBox}>
                  <strong>Current Leagues</strong>
                  <span>{playerMemberships.length}</span>
                </div>

                <div style={statBox}>
                  <strong>Matches Left</strong>
                  <span>{matchesLeft}</span>
                </div>

                <div style={statBox}>
                  <strong>Completed</strong>
                  <span>{completedMatches.length}</span>
                </div>
              </div>
            </section>

            <section style={card}>
              <h2>Current Leagues</h2>

              {playerMemberships.length === 0 ? (
                <p style={muted}>No league memberships found.</p>
              ) : (
                <div style={leagueGrid}>
                  {playerMemberships.map((membership) => (
                    <div key={membership.id} style={leagueCard}>
                      <strong>{membership.league_type || "League"}</strong>

                      <span>{membership.division || "No division"}</span>

                      <span style={muted}>
                        Season {membership.season_number || "?"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
<section style={actionGrid}>
  <Link href="/matches" style={actionButton}>
    View Matches
  </Link>

  <Link href="/players" style={actionButton}>
    Player Profiles
  </Link>

  <Link href="/standings" style={actionButton}>
    View Standings
  </Link>

  <Link href="/records" style={actionButton}>
    View Records
  </Link>
</section>
          </>
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

const label: React.CSSProperties = {
  display: "block",
  margin: "18px 0 8px",
  fontWeight: 700,
}

const select: React.CSSProperties = {
  width: "100%",
  padding: 12,
  background: "#0f172a",
  color: "white",
  border: "1px solid #475569",
  borderRadius: 10,
  fontSize: 17,
}

const card: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 18,
  marginBottom: 18,
}

const playerName: React.CSSProperties = {
  marginTop: 0,
  fontSize: 32,
}

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
}

const statBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
  fontSize: 18,
}

const leagueGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
}

const leagueCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
}

const muted: React.CSSProperties = {
  color: "#94a3b8",
}

const actionGrid: React.CSSProperties = {
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
