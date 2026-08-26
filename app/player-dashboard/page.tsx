"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  status: string | null
  active: boolean | null
}

type Membership = {
  id: string
  player_id: string
  league_type: string | null
  division: string | null
  season_number: number | null
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
}

function leagueKey(value: string | null) {
  return (value || "").trim().toLowerCase().replace(/[\s_]+/g, "-")
}

function seasonKey(leagueType: string | null, seasonNumber: number | null) {
  return `${leagueKey(leagueType)}:${seasonNumber ?? ""}`
}

function samePair(firstPlayer1: string | null, firstPlayer2: string | null, secondPlayer1: string | null, secondPlayer2: string | null) {
  return (firstPlayer1 === secondPlayer1 && firstPlayer2 === secondPlayer2)
    || (firstPlayer1 === secondPlayer2 && firstPlayer2 === secondPlayer1)
}

export default function PlayerDashboardPage() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [identityIds, setIdentityIds] = useState<string[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [schedule, setSchedule] = useState<ScheduledMatch[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [activeSeasonKeys, setActiveSeasonKeys] = useState<Set<string>>(new Set())
  const [opponentNames, setOpponentNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [message, setMessage] = useState("")

  async function loadData() {
    setLoading(true)
    setMessage("")
    setAuthRequired(false)

    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setAuthRequired(true)
      setLoading(false)
      return
    }

    const { data: canonicalId, error: canonicalError } = await supabase.rpc("current_user_canonical_player_id")
    if (canonicalError || typeof canonicalId !== "string" || !canonicalId) {
      setMessage(canonicalError?.message || "Your player identity is not linked yet.")
      setLoading(false)
      return
    }

    const [playerResponse, identityResponse, activeSeasonsResponse] = await Promise.all([
      supabase.from("players").select("id, screen_name, status, active").eq("id", canonicalId).maybeSingle(),
      supabase.rpc("get_public_player_canonical_identity", { p_player_id: canonicalId }),
      supabase.from("seasons").select("league_type, season_number, is_active").eq("is_active", true),
    ])

    if (playerResponse.error || identityResponse.error || activeSeasonsResponse.error || !playerResponse.data) {
      setMessage(playerResponse.error?.message || identityResponse.error?.message || activeSeasonsResponse.error?.message || "Your player dashboard could not be loaded.")
      setLoading(false)
      return
    }

    const identity = (Array.isArray(identityResponse.data) ? identityResponse.data[0] : identityResponse.data) as { identity_player_ids?: string[] | null } | null
    const loadedIdentityIds = identity?.identity_player_ids?.length ? Array.from(new Set(identity.identity_player_ids)) : [canonicalId]
    const loadedActiveSeasonKeys = new Set((activeSeasonsResponse.data || []).map((season) => seasonKey(season.league_type, season.season_number)))
    const [membershipsResponse, scheduleResponse, resultsResponse] = await Promise.all([
      supabase.from("player_league_memberships").select("id, player_id, league_type, division, season_number").in("player_id", loadedIdentityIds),
      supabase.from("schedule").select("id, league_type, division, season_number, game, course, player1_id, player2_id").order("game", { ascending: true }),
      supabase.from("results").select("id, league_type, division, season_number, player1_id, player2_id"),
    ])

    if (membershipsResponse.error || scheduleResponse.error || resultsResponse.error) {
      setMessage(membershipsResponse.error?.message || scheduleResponse.error?.message || resultsResponse.error?.message || "Your current league data could not be loaded.")
      setLoading(false)
      return
    }

    const loadedSchedule = (scheduleResponse.data || []) as ScheduledMatch[]
    const sourceOpponentIds = loadedSchedule.flatMap((match) => [match.player1_id, match.player2_id]
      .filter((id): id is string => Boolean(id))
      .filter((id) => !loadedIdentityIds.includes(id)))
    const displayResponse = sourceOpponentIds.length
      ? await Promise.all(Array.from(new Set(sourceOpponentIds)).map(async (sourcePlayerId) => {
        const { data: identityData } = await supabase.rpc("get_public_player_canonical_identity", { p_player_id: sourcePlayerId })
        const resolved = (Array.isArray(identityData) ? identityData[0] : identityData) as { canonical_player_id?: string } | null
        const resolvedId = resolved?.canonical_player_id
        if (typeof resolvedId !== "string") return null
        const { data: currentPlayer } = await supabase.from("players").select("id, screen_name, status, active").eq("id", resolvedId).maybeSingle()
        return currentPlayer?.active === true && !["merged", "retired", "archived"].includes((currentPlayer.status || "").trim().toLowerCase())
          ? { sourcePlayerId, screenName: currentPlayer.screen_name }
          : null
      }))
      : []

    setPlayer(playerResponse.data as Player)
    setIdentityIds(loadedIdentityIds)
    setActiveSeasonKeys(loadedActiveSeasonKeys)
    setMemberships((membershipsResponse.data || []) as Membership[])
    setSchedule(loadedSchedule)
    setResults((resultsResponse.data || []) as Result[])
    setOpponentNames(new Map(displayResponse.filter((display): display is { sourcePlayerId: string; screenName: string } => Boolean(display)).map((display) => [display.sourcePlayerId, display.screenName])))
    setLoading(false)
  }

  useEffect(() => {
    // The dashboard synchronizes its reader state with the authenticated session on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
  }, [])

  const playerMemberships = useMemo(
    () => memberships.filter((membership) => identityIds.includes(membership.player_id) && activeSeasonKeys.has(seasonKey(membership.league_type, membership.season_number))),
    [activeSeasonKeys, identityIds, memberships]
  )

  const scheduledMatches = useMemo(
    () => schedule.filter((match) => activeSeasonKeys.has(seasonKey(match.league_type, match.season_number)) && (identityIds.includes(match.player1_id || "") || identityIds.includes(match.player2_id || ""))),
    [activeSeasonKeys, identityIds, schedule]
  )

  const completedMatches = useMemo(
    () => results.filter((result) => activeSeasonKeys.has(seasonKey(result.league_type, result.season_number)) && (identityIds.includes(result.player1_id || "") || identityIds.includes(result.player2_id || ""))),
    [activeSeasonKeys, identityIds, results]
  )

  function hasResultFor(match: ScheduledMatch) {
    return completedMatches.some((result) => result.league_type === match.league_type && result.division === match.division && result.season_number === match.season_number && samePair(result.player1_id, result.player2_id, match.player1_id, match.player2_id))
  }

  const matchesLeft = scheduledMatches.filter((match) => !hasResultFor(match)).length

  const status =
    player?.status ||
    (player?.active === false ? "inactive" : "active")

  async function signInWithDiscord() {
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: createDiscordAuthCallbackUrl("player", "/player-dashboard") },
    })
  }

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
          <p style={subtitle}>Your current league participation.</p>
        </section>

        {loading ? (
          <div style={card}>Loading dashboard...</div>
        ) : authRequired ? (
          <section style={card}>
            <h2>Sign in to open your dashboard</h2>
            <button type="button" onClick={() => void signInWithDiscord()} style={actionButton}>Sign in with Discord</button>
          </section>
        ) : message ? (
          <div style={card}>{message}</div>
        ) : !player ? (
          <div style={card}>Your player profile is unavailable.</div>
        ) : playerMemberships.length === 0 ? (
          <section style={card}>
            <h2>No current league participation</h2>
            <Link href="/join" style={joinButton}>Join Leagues</Link>
          </section>
        ) : (
          <>
            <section style={card}>
              <h2 style={playerName}>{player.screen_name}</h2>

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

              <div style={leagueGrid}>
                {playerMemberships.map((membership) => (
                  <div key={membership.id} style={leagueCard}>
                    <strong>{membership.league_type || "League"}</strong>
                    <span>{membership.division || "No division"}</span>
                    <span style={muted}>Season {membership.season_number ?? "?"}</span>
                  </div>
                ))}
              </div>
            </section>

            {scheduledMatches.length > 0 && <section style={card}>
              <h2>Scheduled games</h2>
              <div style={leagueGrid}>
                {scheduledMatches.map((match) => {
                  const opponentId = identityIds.includes(match.player1_id || "") ? match.player2_id : match.player1_id
                  const opponentName = opponentId ? opponentNames.get(opponentId) : null
                  return <div key={match.id} style={leagueCard}>
                    <strong>{match.league_type || "League"}{match.division ? ` · ${match.division}` : ""}</strong>
                    {opponentName && <span>Opponent: {opponentName}</span>}
                    {match.game !== null && match.game !== undefined && <span>Game {match.game}</span>}
                    {match.course && <span>Course: {match.course}</span>}
                    <span style={muted}>{hasResultFor(match) ? "Result recorded" : "Not yet recorded"}</span>
                  </div>
                })}
              </div>
            </section>
            }

            <section style={actionGrid}>
              <Link href="/matches" style={actionButton}>
                View Matches
              </Link>

              <Link
                href={`/players/${player.id}`}
                style={actionButton}
              >
                Player Profile
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

const joinButton: React.CSSProperties = {
  display: "inline-block",
  marginTop: 16,
  padding: "14px 20px",
  background: "#0891b2",
  border: "1px solid #67e8f9",
  borderRadius: 12,
  color: "white",
  textDecoration: "none",
  fontWeight: 900,
}
