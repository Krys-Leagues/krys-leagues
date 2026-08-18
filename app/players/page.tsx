"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadCanonicalPublicPlayers, type CanonicalPublicPlayer } from "@/lib/publicPlayers"

type Player = CanonicalPublicPlayer

type Result = {
  id: string
  player1_id: string | null
  player2_id: string | null
  winner: string | null
  is_draw: boolean | null
  league_type: string | null
  division: string | null
  season_number: number | null
}

type Membership = {
  id: string
  player_id: string
  league_type: string | null
  division: string | null
  season_number: number | null
}

type Trophy = {
  id: string
  player_id: string
  trophy_title: string | null
  placement: string | null
  event_name: string | null
  division: string | null
  season: string | null
}

export default function CareerAdminPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    loadCareerData()
  }, [])

  async function loadCareerData() {
    setLoading(true)
    setMessage("")

    const [
      playersResponse,
      resultsResponse,
      membershipsResponse,
      trophiesResponse,
    ] = await Promise.all([
      loadCanonicalPublicPlayers(),

      supabase
        .from("results")
        .select(
          "id, player1_id, player2_id, winner, is_draw, league_type, division, season_number"
        ),

      supabase
        .from("player_league_memberships")
        .select("id, player_id, league_type, division, season_number"),

      supabase
        .from("player_trophies")
        .select(
          "id, player_id, trophy_title, placement, event_name, division, season"
        ),
    ])

    const firstError =
      playersResponse.error ||
      resultsResponse.error ||
      membershipsResponse.error ||
      trophiesResponse.error

    if (firstError) {
      setMessage(firstError.message)
      setLoading(false)
      return
    }

    const loadedPlayers = playersResponse.data || []

    setPlayers(loadedPlayers)
    setResults(resultsResponse.data || [])
    setMemberships(membershipsResponse.data || [])
    setTrophies(trophiesResponse.data || [])

    if (loadedPlayers.length > 0) {
      setSelectedPlayerId(loadedPlayers[0].id)
    }

    setLoading(false)
  }

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return players

    return players.filter((player) =>
      player.screen_name.toLowerCase().includes(query)
    )
  }, [players, search])

  const selectedPlayer = useMemo(() => {
    return (
      players.find((player) => player.id === selectedPlayerId) || null
    )
  }, [players, selectedPlayerId])

  const selectedIdentityIds = useMemo(
    () => new Set(selectedPlayer?.identity_player_ids || []),
    [selectedPlayer],
  )

  const playerResults = useMemo(() => {
    return results.filter(
      (result) => selectedIdentityIds.has(result.player1_id || "") || selectedIdentityIds.has(result.player2_id || "")
    )
  }, [results, selectedIdentityIds])

  const playerMemberships = useMemo(() => {
    return memberships
      .filter(
        (membership) => selectedIdentityIds.has(membership.player_id)
      )
      .sort(
        (first, second) =>
          Number(second.season_number || 0) -
          Number(first.season_number || 0)
      )
  }, [memberships, selectedIdentityIds])

  const playerTrophies = useMemo(() => {
    return trophies.filter(
      (trophy) => selectedIdentityIds.has(trophy.player_id)
    )
  }, [trophies, selectedIdentityIds])

  const careerStats = useMemo(() => {
    if (!selectedPlayer) {
      return {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winPercent: 0,
        seasons: 0,
        leagues: 0,
        trophies: 0,
      }
    }

    const matches = playerResults.length

    const draws = playerResults.filter(
      (result) => result.is_draw === true
    ).length

    const wins = playerResults.filter(
      (result) => result.winner === selectedPlayer.screen_name
    ).length

    const losses = Math.max(matches - wins - draws, 0)

    const winPercent =
      matches > 0 ? Math.round((wins / matches) * 100) : 0

    const seasons = new Set(
      playerMemberships
        .map((membership) => membership.season_number)
        .filter((seasonNumber) => seasonNumber !== null)
    ).size

    const leagues = new Set(
      playerMemberships
        .map((membership) => membership.league_type)
        .filter(Boolean)
    ).size

    return {
      matches,
      wins,
      draws,
      losses,
      winPercent,
      seasons,
      leagues,
      trophies: playerTrophies.length,
    }
  }, [
    selectedPlayer,
    playerResults,
    playerMemberships,
    playerTrophies,
  ])

  const leagueBreakdown = useMemo(() => {
    const grouped = new Map<
      string,
      {
        league: string
        played: number
        wins: number
        draws: number
        losses: number
      }
    >()

    if (!selectedPlayer) return []

    playerResults.forEach((result) => {
      const league = result.league_type || "Unknown League"

      if (!grouped.has(league)) {
        grouped.set(league, {
          league,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
        })
      }

      const row = grouped.get(league)!

      row.played += 1

      if (result.is_draw) {
        row.draws += 1
      } else if (result.winner === selectedPlayer.screen_name) {
        row.wins += 1
      } else {
        row.losses += 1
      }
    })

    return Array.from(grouped.values()).sort((first, second) =>
      first.league.localeCompare(second.league)
    )
  }, [playerResults, selectedPlayer])

  const status =
    selectedPlayer?.status ||
    (selectedPlayer?.active === false ? "inactive" : "active")

  return (
    <main style={page}>
      <div style={container}>
        <Link href="/admin" style={backButton}>
          ← Admin Dashboard
        </Link>

        <section style={hero}>
          <h1 style={title}>Career Statistics</h1>

          <p style={subtitle}>
            Review career totals, league history, and trophies for every
            player.
          </p>

          <div style={controls}>
            <div>
              <label style={label}>Search Player</label>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search screen names..."
                style={input}
              />
            </div>

            <div>
              <label style={label}>Player</label>

              <select
                value={selectedPlayerId}
                onChange={(event) =>
                  setSelectedPlayerId(event.target.value)
                }
                style={input}
              >
                {filteredPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.screen_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {loading ? (
          <div style={messageCard}>Loading career statistics...</div>
        ) : message ? (
          <div style={errorCard}>{message}</div>
        ) : !selectedPlayer ? (
          <div style={messageCard}>No player selected.</div>
        ) : (
          <>
            <section style={playerCard}>
              <div>
                <h2 style={playerName}>
                  {selectedPlayer.screen_name}
                </h2>

                <span style={statusBadge}>
                  {status.toUpperCase()}
                </span>
              </div>

              <Link
                href={`/admin/players/${selectedPlayer.id}`}
                style={profileButton}
              >
                Open Full Admin Profile
              </Link>
            </section>

            <section style={statsGrid}>
              <StatCard
                label="Matches"
                value={careerStats.matches}
              />

              <StatCard
                label="Wins"
                value={careerStats.wins}
              />

              <StatCard
                label="Draws"
                value={careerStats.draws}
              />

              <StatCard
                label="Losses"
                value={careerStats.losses}
              />

              <StatCard
                label="Win Percentage"
                value={`${careerStats.winPercent}%`}
              />

              <StatCard
                label="Seasons"
                value={careerStats.seasons}
              />

              <StatCard
                label="Leagues"
                value={careerStats.leagues}
              />

              <StatCard
                label="Trophies"
                value={careerStats.trophies}
              />
            </section>

            <section style={card}>
              <h2 style={sectionTitle}>League Breakdown</h2>

              {leagueBreakdown.length === 0 ? (
                <p style={muted}>
                  No completed league results were found.
                </p>
              ) : (
                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>League</th>
                        <th style={th}>Played</th>
                        <th style={th}>Wins</th>
                        <th style={th}>Draws</th>
                        <th style={th}>Losses</th>
                      </tr>
                    </thead>

                    <tbody>
                      {leagueBreakdown.map((row) => (
                        <tr key={row.league}>
                          <td style={playerCell}>{row.league}</td>
                          <td style={td}>{row.played}</td>
                          <td style={td}>{row.wins}</td>
                          <td style={td}>{row.draws}</td>
                          <td style={td}>{row.losses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={card}>
              <h2 style={sectionTitle}>League History</h2>

              {playerMemberships.length === 0 ? (
                <p style={muted}>
                  No league memberships were found.
                </p>
              ) : (
                <div style={historyGrid}>
                  {playerMemberships.map((membership) => (
                    <div key={membership.id} style={historyCard}>
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
              <h2 style={sectionTitle}>
                Trophy History ({playerTrophies.length})
              </h2>

              {playerTrophies.length === 0 ? (
                <p style={muted}>
                  No trophies have been added for this player.
                </p>
              ) : (
                <div style={historyGrid}>
                  {playerTrophies.map((trophy) => (
                    <div key={trophy.id} style={historyCard}>
                      <strong>
                        {trophy.trophy_title ||
                          trophy.placement ||
                          "Trophy"}
                      </strong>

                      <span>
                        {trophy.event_name || "Event not listed"}
                      </span>

                      <span style={muted}>
                        {[
                          trophy.division,
                          trophy.season
                            ? `Season ${trophy.season}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={actionGrid}>
              <Link
                href={`/players/${selectedPlayer.id}`}
                style={actionButton}
              >
                View Public Profile
              </Link>

              <Link href="/admin/players" style={actionButton}>
                Player Manager
              </Link>

              <Link href="/admin/handicaps" style={actionButton}>
                Handicap Manager
              </Link>

              <Link
                href="/admin/records/combined"
                style={actionButton}
              >
                Combined Records
              </Link>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div style={statCard}>
      <strong>{label}</strong>
      <span style={statNumber}>{value}</span>
    </div>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: "28px 18px",
  background:
    "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
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
  gridTemplateColumns:
    "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
  marginTop: 22,
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

const playerCard: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 16,
  padding: 24,
  marginBottom: 18,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 18,
}

const playerName: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 34,
}

const statusBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  background: "#166534",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
}

const profileButton: React.CSSProperties = {
  padding: "12px 16px",
  background: "#2563eb",
  borderRadius: 10,
  color: "white",
  textDecoration: "none",
  fontWeight: 800,
}

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: 18,
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
  marginBottom: 18,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 18,
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
}

const historyGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
}

const historyCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
}

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
}

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 600,
  borderCollapse: "collapse",
}

const th: React.CSSProperties = {
  padding: 12,
  textAlign: "left",
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

const muted: React.CSSProperties = {
  color: "#94a3b8",
}

const messageCard: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  textAlign: "center",
  color: "#cbd5e1",
}

const errorCard: React.CSSProperties = {
  ...messageCard,
  border: "1px solid #991b1b",
  color: "#fecaca",
}

const actionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(210px, 1fr))",
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
