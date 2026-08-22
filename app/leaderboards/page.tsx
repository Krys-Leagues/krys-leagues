"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadCanonicalPublicPlayers, type CanonicalPublicPlayer } from "@/lib/publicPlayers"

type Player = {
  id: string
  status: string | null
  active: boolean | null
}

type ScheduledMatch = {
  id: string
  league_type: string | null
  division: string | null
  season_number: number | null
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

const CURRENT_SEASON = 59

export default function HomePage() {
  const [players, setPlayers] = useState<CanonicalPublicPlayer[]>([])
  const [schedule, setSchedule] = useState<ScheduledMatch[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoadingStats(true)

    const [playersResponse, scheduleResponse, resultsResponse] =
      await Promise.all([
        loadCanonicalPublicPlayers(),

        supabase
          .from("schedule")
          .select(
            "id, league_type, division, season_number, player1_id, player2_id"
          ),

        supabase
          .from("results")
          .select(
            "id, league_type, division, season_number, player1_id, player2_id"
          ),
      ])

    setPlayers(playersResponse.data || [])
    setSchedule(scheduleResponse.data || [])
    setResults(resultsResponse.data || [])
    setLoadingStats(false)
  }

  function normalizeLeague(value: string | null) {
    const text = (value || "").toLowerCase()

    if (text.includes("stroke")) return "Stroke Play"
    if (text.includes("match")) return "Match Play"
    if (text.includes("double")) return "Doubles"
    if (text.includes("pyp")) return "PYP"
    if (text.includes("pro")) return "Amateur to Pro"
    if (text.includes("amateur")) return "Amateur to Pro"
    if (text.includes("skin")) return "Skins"

    return ""
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

  const stats = useMemo(() => {
    const activePlayers = players.length

    const seasonSchedule = schedule.filter(
      (match) => Number(match.season_number) === CURRENT_SEASON
    )

    const seasonResults = results.filter(
      (result) => Number(result.season_number) === CURRENT_SEASON
    )

    const activeLeagueNames = new Set(
      seasonSchedule
        .map((match) => normalizeLeague(match.league_type || match.division))
        .filter(Boolean)
    )

    const matchesRemaining = seasonSchedule.filter((match) => {
      const completed = seasonResults.some(
        (result) =>
          result.division === match.division &&
          samePlayers(
            result.player1_id,
            result.player2_id,
            match.player1_id,
            match.player2_id
          )
      )

      return !completed
    }).length

    return {
      activePlayers,
      activeLeagues: activeLeagueNames.size,
      matchesRemaining,
      matchesCompleted: seasonResults.length,
    }
  }, [players, schedule, results])

  const displayValue = (value: number) =>
    loadingStats ? "Loading..." : value.toString()

  return (
    <main style={page}>
      <div style={container}>
        <section style={hero}>
          <img
            src="/league-media/BIG LOGO TRANSPARENT.png"
            alt="Krys Leagues"
            style={logo}
          />

          <h1 style={title}>Krys Leagues</h1>

          <p style={subtitle}>
            Walkabout Mini Golf leagues, tournaments, standings, and player
            history.
          </p>

          <div style={buttonGrid}>
            <Link href="/join" style={primaryButton}>
              Join Leagues
            </Link>

            <Link href="/dashboard" style={button}>
              Player Dashboard
            </Link>

            <Link href="/league-play" style={button}>
              League Play
            </Link>

            <Link href="/admin/stroke/standings" style={button}>
              Standings
            </Link>

            <Link href="/players" style={button}>
              Player Profiles
            </Link>

            <Link href="/kwt" style={button}>
              KWT
            </Link>

            <Link href="/monthlies" style={button}>
              Monthlies
            </Link>

            <Link href="/tournaments" style={button}>
              Bracket Tournaments
            </Link>

            <Link href="/leaderboards" style={button}>
              Overall Leaderboards
            </Link>

            <Link href="/records" style={button}>
              League Records
            </Link>

            <Link href="/champions" style={button}>
              Hall of Champions
            </Link>
          </div>
        </section>

        <section style={infoCard}>
          <h2 style={sectionTitle}>Season {CURRENT_SEASON}</h2>

          <div style={statsGrid}>
            <div style={statCard}>
              <strong>👥 Active Players</strong>
              <span style={statNumber}>
                {displayValue(stats.activePlayers)}
              </span>
            </div>

            <div style={statCard}>
              <strong>🏆 Active Leagues</strong>
              <span style={statNumber}>
                {displayValue(stats.activeLeagues)}
              </span>
            </div>

            <div style={statCard}>
              <strong>🎯 Matches Remaining</strong>
              <span style={statNumber}>
                {displayValue(stats.matchesRemaining)}
              </span>
            </div>

            <div style={statCard}>
              <strong>✅ Matches Completed</strong>
              <span style={statNumber}>
                {displayValue(stats.matchesCompleted)}
              </span>
            </div>
          </div>
        </section>

        <Link href="/admin" style={adminButton}>
          Admin Login
        </Link>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
  display: "flex",
  justifyContent: "center",
  padding: "30px 18px",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 900,
}

const hero: React.CSSProperties = {
  textAlign: "center",
  padding: "48px 24px",
  background: "rgba(2, 6, 23, 0.88)",
  border: "1px solid #334155",
  borderRadius: 24,
  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
}

const logo: React.CSSProperties = {
  width: "min(220px, 70vw)",
  height: "auto",
  display: "block",
  margin: "0 auto 24px",
  objectFit: "contain",
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(42px, 9vw, 72px)",
  lineHeight: 1,
  fontWeight: 900,
}

const subtitle: React.CSSProperties = {
  maxWidth: 650,
  margin: "20px auto 30px",
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.6,
}

const buttonGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
}

const primaryButton: React.CSSProperties = {
  padding: "16px 20px",
  background: "#16a34a",
  color: "white",
  borderRadius: 12,
  textDecoration: "none",
  fontSize: 18,
  fontWeight: 800,
}

const button: React.CSSProperties = {
  padding: "16px 20px",
  background: "#1e293b",
  border: "1px solid #475569",
  color: "white",
  borderRadius: 12,
  textDecoration: "none",
  fontSize: 18,
  fontWeight: 700,
}

const infoCard: React.CSSProperties = {
  marginTop: 20,
  padding: 24,
  background: "rgba(15, 23, 42, 0.9)",
  border: "1px solid #334155",
  borderRadius: 18,
  textAlign: "center",
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 28,
}

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 16,
  marginTop: 20,
}

const statCard: React.CSSProperties = {
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 14,
  padding: 18,
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontSize: 18,
}

const statNumber: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
}

const adminButton: React.CSSProperties = {
  display: "block",
  width: "fit-content",
  margin: "20px auto 0",
  color: "#94a3b8",
  textDecoration: "none",
  fontWeight: 700,
}
