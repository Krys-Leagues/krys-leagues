"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import PlayerProfileHero from "@/components/PlayerProfileHero"
import { getCanonicalPlayerAvatar } from "@/lib/playerAvatars"

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
  player1: string | null
  player2: string | null
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

type MatchSeasonHistory = {
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
  holes_won: number
}

type PypSeasonHistory = MatchSeasonHistory

type CanonicalIdentity = {
  canonical_player_id: string
  canonical_screen_name: string
  identity_player_ids: string[]
  aliases: string[]
  discord_linked: boolean
  is_server_booster?: boolean
  has_krys_server_tag?: boolean
  profile_badges?: string[]
}

type PypFixtureHistory = {
  season_number: number
  season_id: string
  division_number: number
  game_number: number
  player_screen_name: string
  opponent_screen_name: string
  player_role: "home" | "away"
  course1_name: string
  course1_difficulty: string | null
  course1_player_hw: number
  course1_opponent_hw: number
  course2_name: string
  course2_difficulty: string | null
  course2_player_hw: number
  course2_opponent_hw: number
  player_total_hw: number
  opponent_total_hw: number
  outcome: "W" | "L" | "D"
}

export default function PublicPlayerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const playerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [player, setPlayer] = useState<Player | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [strokeHistory, setStrokeHistory] = useState<StrokeSeasonHistory[]>([])
  const [strokeHistoryError, setStrokeHistoryError] = useState("")
  const [matchHistory, setMatchHistory] = useState<MatchSeasonHistory[]>([])
  const [matchHistoryError, setMatchHistoryError] = useState("")
  const [pypHistory, setPypHistory] = useState<PypSeasonHistory[]>([])
  const [pypFixtureHistory, setPypFixtureHistory] = useState<PypFixtureHistory[]>([])
  const [pypHistoryError, setPypHistoryError] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [aliases, setAliases] = useState<string[]>([])
  const [identityPlayerIds, setIdentityPlayerIds] = useState<string[]>([])
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [recognition, setRecognition] = useState({
    isServerBooster: false,
    hasKrysServerTag: false,
    profileBadges: [] as string[],
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadProfile()
    // Profile data is reloaded only when the UUID route parameter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setMatchHistoryError("")
    setPypHistoryError("")

    const { data: identityData, error: identityError } = await supabase.rpc(
      "get_public_player_canonical_identity",
      { p_player_id: playerId }
    )
    if (identityError) {
      setMessage(identityError.message)
      setLoading(false)
      return
    }
    const identity = (Array.isArray(identityData) ? identityData[0] : identityData) as CanonicalIdentity | null
    if (!identity) {
      setMessage("Player not found.")
      setLoading(false)
      return
    }
    const canonicalId = identity.canonical_player_id
    setRecognition({
      isServerBooster: Boolean(identity.is_server_booster),
      hasKrysServerTag: Boolean(identity.has_krys_server_tag),
      profileBadges: identity.profile_badges || [],
    })
    if (canonicalId !== playerId) {
      router.replace(`/players/${canonicalId}`)
    }
    const identityIds = identity.identity_player_ids.length > 0
      ? identity.identity_player_ids
      : [canonicalId]
    const resultIdentityFilter = identityIds.flatMap((id) => [
      `player1_id.eq.${id}`,
      `player2_id.eq.${id}`,
    ]).join(",")

    const [
      playerResponse,
      membershipsResponse,
      trophiesResponse,
      resultsResponse,
      strokeHistoryResponse,
      matchHistoryResponse,
      pypHistoryResponse,
      pypFixtureHistoryResponse,
      avatarResponse,
    ] = await Promise.all([
      supabase
        .from("players")
        .select("id, screen_name, status, active")
        .eq("id", canonicalId)
        .maybeSingle(),

      supabase
        .from("player_league_memberships")
        .select("id, league_type, division, season_number")
        .in("player_id", identityIds)
        .order("season_number", { ascending: false }),

      supabase
        .from("player_trophies")
        .select(
          "id, trophy_title, placement, event_name, division, season, week, image_url"
        )
        .in("player_id", identityIds),

      supabase
        .from("results")
        .select("id, player1, player2, player1_id, player2_id, winner, is_draw")
        .or(resultIdentityFilter),

      supabase.rpc("get_public_stroke_player_history", {
        p_player_id: playerId,
      }),
      supabase.rpc("get_public_match_player_history", {
        p_player_id: playerId,
      }),
      supabase.rpc("get_public_pyp_player_history", {
        p_player_id: playerId,
      }),
      supabase.rpc("get_public_pyp_player_fixture_history", {
        p_player_id: playerId,
      }),
      getCanonicalPlayerAvatar(playerId).catch(() => ({ canonicalPlayerId: playerId, avatarPath: null })),
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
    setAliases(identity.aliases || [])
    setIdentityPlayerIds(identityIds)
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
    setMatchHistory((matchHistoryResponse.data || []) as MatchSeasonHistory[])
    if (matchHistoryResponse.error) {
      setMatchHistoryError(`Match season history could not be loaded: ${matchHistoryResponse.error.message}`)
    }
    setPypHistory((pypHistoryResponse.data || []) as PypSeasonHistory[])
    if (pypHistoryResponse.error) {
      setPypHistoryError(`PYP season history could not be loaded: ${pypHistoryResponse.error.message}`)
    }
    setPypFixtureHistory((pypFixtureHistoryResponse.data || []) as PypFixtureHistory[])
    if (pypFixtureHistoryResponse.error && !pypHistoryResponse.error) {
      setPypHistoryError(`PYP fixture history could not be loaded: ${pypFixtureHistoryResponse.error.message}`)
    }
    setAvatarPath(avatarResponse.avatarPath)
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
    const playerIds = new Set(identityPlayerIds)
    const wins = results.filter((result) =>
      (result.player1_id && playerIds.has(result.player1_id) && result.winner === result.player1)
      || (result.player2_id && playerIds.has(result.player2_id) && result.winner === result.player2)
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
  }, [player, results, identityPlayerIds])

  const totalSeasons = useMemo(() => {
    return new Set(
      memberships
        .map((membership) => membership.season_number)
        .filter((seasonNumber) => seasonNumber !== null)
    ).size
  }, [memberships])

  const hasCareerParticipation = memberships.length > 0 || results.length > 0 ||
    strokeHistory.length > 0 || matchHistory.length > 0 || pypHistory.length > 0 ||
    pypFixtureHistory.length > 0

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

        <PlayerProfileHero
          screenName={player.screen_name}
          avatarPath={avatarPath}
          aliases={aliases}
          isServerBooster={recognition.isServerBooster}
          hasKrysServerTag={recognition.hasKrysServerTag}
          profileBadges={recognition.profileBadges}
        />

        {hasCareerParticipation && <details style={statsDisclosure}>
          <summary style={statsSummary}>Player Stats</summary>
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

        {memberships.length > 0 && <section style={card}>
          <h2 style={sectionTitle}>League History</h2>

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
        </section>}

        {(strokeHistory.length > 0 || strokeHistoryError) && <section style={card}>
          <h2 style={sectionTitle}>Stroke Season History</h2>

          {strokeHistoryError ? (
            <p style={historyError}>{strokeHistoryError}</p>
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
        </section>}

        {(matchHistory.length > 0 || matchHistoryError) && <section style={card}>
          <h2 style={sectionTitle}>Match Season History</h2>

          {matchHistoryError ? (
            <p style={historyError}>{matchHistoryError}</p>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Season</th><th style={th}>Division</th><th style={th}>Final Rank</th>
                    <th style={th}>Played</th><th style={th}>Wins</th><th style={th}>Draws</th>
                    <th style={th}>Losses</th><th style={th}>Points</th><th style={th}>HW</th>
                    <th style={th}>Completed Games</th>
                  </tr>
                </thead>
                <tbody>
                  {matchHistory.map((history) => (
                    <tr key={history.season_id}>
                      <td style={td}>{history.season_number}</td><td style={td}>Match D{history.division_number}</td>
                      <td style={td}>{history.division_rank}</td><td style={td}>{history.completed_game_count}</td>
                      <td style={td}>{history.wins}</td><td style={td}>{history.ties}</td><td style={td}>{history.losses}</td>
                      <td style={td}>{history.points}</td><td style={td}>{history.holes_won}</td>
                      <td style={td}>{history.completed_game_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>}

        {(pypHistory.length > 0 || pypHistoryError) && <section style={card}>
          <h2 style={sectionTitle}>PYP Season History</h2>

          {pypHistoryError ? (
            <p style={historyError}>{pypHistoryError}</p>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Season</th><th style={th}>Division</th><th style={th}>Final Rank</th>
                    <th style={th}>Played</th><th style={th}>Wins</th><th style={th}>Draws</th>
                    <th style={th}>Losses</th><th style={th}>Points</th><th style={th}>Holes Won</th>
                  </tr>
                </thead>
                <tbody>
                  {pypHistory.map((history) => (
                    <tr key={history.season_id}>
                      <td style={td}>{history.season_number}</td><td style={td}>PYP D{history.division_number}</td>
                      <td style={td}>{history.division_rank}</td><td style={td}>{history.completed_game_count}</td>
                      <td style={td}>{history.wins}</td><td style={td}>{history.ties}</td><td style={td}>{history.losses}</td>
                      <td style={td}>{history.points}</td><td style={td}>{history.holes_won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pypHistory.map((history) => {
                const fixtures = pypFixtureHistory.filter((fixture) => fixture.season_id === history.season_id)
                if (fixtures.length === 0) return null
                return <details key={`fixtures-${history.season_id}`} style={historyDetails}>
                  <summary>Season {history.season_number} fixture details</summary>
                  {fixtures.map((fixture) => <p key={`${fixture.season_id}-${fixture.game_number}`} style={muted}>
                    Round {fixture.game_number} · {fixture.player_role.toUpperCase()} vs {fixture.opponent_screen_name} · {fixture.course1_name}{fixture.course1_difficulty ? ` (${fixture.course1_difficulty})` : ""}: {fixture.player_screen_name} {fixture.course1_player_hw} – {fixture.opponent_screen_name} {fixture.course1_opponent_hw} · {fixture.course2_name}{fixture.course2_difficulty ? ` (${fixture.course2_difficulty})` : ""}: {fixture.player_screen_name} {fixture.course2_player_hw} – {fixture.opponent_screen_name} {fixture.course2_opponent_hw} · Combined {fixture.player_total_hw}–{fixture.opponent_total_hw} · {fixture.outcome}
                  </p>)}
                </details>
              })}
            </div>
          )}
        </section>}
        </details>}

        {trophies.length > 0 && <section style={card}>
          <h2 style={sectionTitle}>
            🏆 Trophy Case
          </h2>

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
        </section>}

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

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: 20,
}

const statsDisclosure: React.CSSProperties = {
  marginBottom: 20,
  padding: 16,
  border: "1px solid #334155",
  borderRadius: 16,
  background: "rgba(15, 23, 42, 0.86)",
}

const statsSummary: React.CSSProperties = {
  cursor: "pointer",
  color: "#e2e8f0",
  fontSize: "1.05rem",
  fontWeight: 850,
  letterSpacing: "0.02em",
  padding: "4px 2px",
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
  display: "block",
  width: "min(100%, 300px)",
  maxHeight: 280,
  objectFit: "contain",
  marginInline: "auto",
  marginTop: 12,
  borderRadius: 10,
}

const muted: React.CSSProperties = {
  color: "#94a3b8",
}

const historyError: React.CSSProperties = {
  color: "#fecaca",
}

const historyDetails: React.CSSProperties = {
  margin: "14px 12px",
  padding: 12,
  border: "1px solid #334155",
  borderRadius: 10,
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
