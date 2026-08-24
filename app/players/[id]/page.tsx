"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"
import PlayerProfileHero, { PlayerProfileRecognition } from "@/components/PlayerProfileHero"
import PlayerProfileEditor, { type ProfilePreferences } from "@/components/PlayerProfileEditor"
import { getCanonicalPlayerAvatar } from "@/lib/playerAvatars"
import { DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY, getPlayerProfileBackground } from "@/lib/playerProfileBackgrounds"
import { profileBackgroundPublicUrl } from "@/lib/profileBackgrounds"
import { DEFAULT_PROFILE_PRESENTATION, normalizeProfilePresentation, profilePresentationStyle } from "@/lib/playerProfilePresentation"
import styles from "./page.module.css"
import TrophyMedia from "@/components/TrophyMedia"
import PlayerCourseRecords from "@/components/records/PlayerCourseRecords"

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
  month: string | null
  week: string | null
  image_url: string | null
  created_at: string
}

const DEFAULT_PREFERENCES: ProfilePreferences = { background_key: DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY, background_id: null, background_path: null, background_display_name: null, name_effect: "auto", background_color: "#07111f", glow_color: "#ff2bd6", text_color: "#f8fafc", about_me: null, ...DEFAULT_PROFILE_PRESENTATION }

type Result = {
  id: string
  player1: string | null
  player2: string | null
  player1_id: string | null
  player2_id: string | null
  winner: string | null
  is_draw: boolean | null
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

type KwtHistory = {
  season_number: number
  week_number: number
  historical_player_name: string
  historical_rank: string | null
  easy_course_code: string
  easy_score: number
  hard_course_code: string
  hard_score: number
  total_score: number
  placement: number | null
  points: number | null
}

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
  const [kwtHistory, setKwtHistory] = useState<KwtHistory[]>([])
  const [kwtHistoryError, setKwtHistoryError] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [aliases, setAliases] = useState<string[]>([])
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [recognition, setRecognition] = useState({
    isServerBooster: false,
    hasKrysServerTag: false,
    profileBadges: [] as string[],
  })
  const [preferences, setPreferences] = useState<ProfilePreferences>(DEFAULT_PREFERENCES)
  const [hasSession, setHasSession] = useState(false)
  const [canEditProfile, setCanEditProfile] = useState(false)
  const [openProfileSection, setOpenProfileSection] = useState<"records" | "stats" | "aliases" | "trophies" | null>(null)

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
    setKwtHistoryError("")

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
      kwtHistoryResponse,
      avatarResponse,
      preferencesResponse,
      sessionResponse,
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
          "id, trophy_title, placement, event_name, division, season, month, week, image_url, created_at"
        )
        .eq("player_id", canonicalId)
        .order("created_at", { ascending: false }),

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
      supabase.rpc("get_public_player_kwt_history", {
        p_player_id: canonicalId,
      }),
      getCanonicalPlayerAvatar(playerId).catch(() => ({ canonicalPlayerId: playerId, avatarPath: null })),
      (async () => {
        const v5 = await supabase.rpc("get_public_player_profile_preferences_v5", { p_player_id: canonicalId })
        return v5.error ? supabase.rpc("get_public_player_profile_preferences_v4", { p_player_id: canonicalId }) : v5
      })(),
      supabase.auth.getSession(),
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

    const canonicalStatus = playerResponse.data.status?.trim().toLowerCase()
    if (
      playerResponse.data.active !== true ||
      canonicalStatus === "retired" ||
      canonicalStatus === "merged" ||
      canonicalStatus === "archived"
    ) {
      setMessage("This player profile is not currently available.")
      setLoading(false)
      return
    }

    setPlayer(playerResponse.data)
    setAliases(identity.aliases || [])
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
    setKwtHistory((kwtHistoryResponse.data || []) as KwtHistory[])
    if (kwtHistoryResponse.error) {
      setKwtHistoryError(`KWT history could not be loaded: ${kwtHistoryResponse.error.message}`)
    }
    setAvatarPath(avatarResponse.avatarPath)
    if (!preferencesResponse.error) {
      const loaded = Array.isArray(preferencesResponse.data) ? preferencesResponse.data[0] : preferencesResponse.data
      if (loaded) setPreferences({ ...DEFAULT_PREFERENCES, ...loaded, ...normalizeProfilePresentation({ ...loaded, avatar_glow_color: loaded.avatar_glow_color || loaded.glow_color }) } as ProfilePreferences)
    }
    const session = sessionResponse.data.session
    setHasSession(Boolean(session))
    if (session) {
      const { data: viewerCanonicalId } = await supabase.rpc("current_user_canonical_player_id")
      setCanEditProfile(typeof viewerCanonicalId === "string" && viewerCanonicalId === canonicalId)
    } else {
      setCanEditProfile(false)
    }
    setLoading(false)
  }

  async function signInWithDiscord() {
    if (!player) return

    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: createDiscordAuthCallbackUrl("player", `/players/${player.id}`),
      },
    })
  }

  const hasCareerParticipation = memberships.length > 0 || results.length > 0 ||
    strokeHistory.length > 0 || matchHistory.length > 0 || pypHistory.length > 0 ||
    pypFixtureHistory.length > 0 || kwtHistory.length > 0

  const statHighlights = [
    trophies.length > 0 ? { kind: "stat" as const, label: "Trophies", value: trophies.length } : null,
    strokeHistory.reduce((total, season) => total + season.wins, 0) > 0 ? { kind: "stat" as const, label: "Stroke Wins", value: strokeHistory.reduce((total, season) => total + season.wins, 0) } : null,
    matchHistory.reduce((total, season) => total + season.wins, 0) > 0 ? { kind: "stat" as const, label: "Match Wins", value: matchHistory.reduce((total, season) => total + season.wins, 0) } : null,
    pypHistory.reduce((total, season) => total + season.wins, 0) > 0 ? { kind: "stat" as const, label: "PYP Wins", value: pypHistory.reduce((total, season) => total + season.wins, 0) } : null,
  ].filter((highlight): highlight is NonNullable<typeof highlight> => highlight !== null)
  const monthlyHighlights = trophies.flatMap((trophy) => {
    const podium = trophy.placement?.trim().match(/^(1st|2nd|3rd)(?:\s+place)?$/i)?.[1]?.toLowerCase()
    const isMonthly = Boolean(trophy.month?.trim() || /\bmonthly\b/i.test(trophy.event_name || ""))
    if (!podium || !isMonthly || !trophy.division?.trim()) return []
    const placement = podium === "1st" ? "1st" : podium === "2nd" ? "2nd" : "3rd"
    const medal = placement === "1st" ? "🥇" : placement === "2nd" ? "🥈" : "🥉"
    const datedMonthly = [trophy.month?.trim(), trophy.season?.trim()].filter((part, index, parts) => Boolean(part) && (index === 0 || !parts[0]?.includes(part!))).join(" ")
    const label = trophy.event_name?.trim() || `${datedMonthly} Monthly`
    return [{ kind: "monthly" as const, label, division: trophy.division.trim(), placement, medal }]
  }).slice(0, 3)
  const careerHighlights = [...statHighlights, ...monthlyHighlights]

  const knownAliases = aliases.filter((alias) =>
    alias.trim().localeCompare(player?.screen_name.trim() || "", undefined, { sensitivity: "accent" }) !== 0
  )
  const profileBackgroundImage = profileBackgroundPublicUrl(preferences.background_path)
    || getPlayerProfileBackground(preferences.background_key).imagePath

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
    <main className={styles.page} data-glass-style={preferences.glass_style} data-blue-panel-glow={preferences.blue_panel_glow} style={{ "--profile-bg": preferences.background_color, "--profile-text": preferences.text_color, "--profile-background-image": `url("${profileBackgroundImage}")`, ...profilePresentationStyle(preferences) } as React.CSSProperties}>
      <div style={container} className={styles.profilePageContainer}>
        <PlayerProfileHero
          screenName={player.screen_name}
          avatarPath={avatarPath}
          isServerBooster={recognition.isServerBooster}
          hasKrysServerTag={recognition.hasKrysServerTag}
          nameEffect={preferences.name_effect}
          profileBadges={recognition.profileBadges}
          glowColor={preferences.glow_color}
          avatarGlowColor={preferences.avatar_glow_color}
          textColor={preferences.text_color}
          showAvatarGlow={preferences.show_avatar_glow}
          avatarGlowStrength={preferences.avatar_glow_strength}
          featuredTrophy={preferences.show_featured_trophy && trophies[0] ? {
            title: trophies[0].trophy_title || trophies[0].placement || "Trophy",
            meta: [trophies[0].event_name, trophies[0].division, trophies[0].season].filter(Boolean).join(" · "),
            imageUrl: trophies[0].image_url,
          } : null}
          careerHighlights={preferences.show_career_highlights ? careerHighlights : []}
          publicLayout
        />

        {preferences.about_me && <section style={aboutSection}>
          <p style={eyebrow}>About Me</p>
          <p style={aboutCopy}>{preferences.about_me}</p>
        </section>}

        <div className={styles.profileContent}>
        {preferences.show_recognition_box && <PlayerProfileRecognition
          isServerBooster={recognition.isServerBooster}
          hasKrysServerTag={recognition.hasKrysServerTag}
          profileBadges={recognition.profileBadges}
          glowColor={preferences.glow_color}
          textColor={preferences.text_color}
        />}

        <nav className={styles.profileActions} aria-label="Player profile sections and navigation">
          <Link href="/" style={backButton}>← Krys Leagues</Link>
          <Link href="/players" style={backButton}>← Player Profiles</Link>
          <button type="button" className={styles.profileActionButton} aria-pressed={openProfileSection === "records"} onClick={() => setOpenProfileSection(current => current === "records" ? null : "records")}>Course Records</button>
          {hasCareerParticipation && <button type="button" className={styles.profileActionButton} aria-pressed={openProfileSection === "stats"} onClick={() => setOpenProfileSection(current => current === "stats" ? null : "stats")}>Player Stats</button>}
          {knownAliases.length > 0 && <button type="button" className={styles.profileActionButton} aria-pressed={openProfileSection === "aliases"} onClick={() => setOpenProfileSection(current => current === "aliases" ? null : "aliases")}>Names / Known As</button>}
          {trophies.length > 0 && <button type="button" className={styles.profileActionButton} aria-pressed={openProfileSection === "trophies"} onClick={() => setOpenProfileSection(current => current === "trophies" ? null : "trophies")}>Trophies &amp; Achievements</button>}
          {!hasSession && <button type="button" className={styles.profileActionButton} onClick={() => void signInWithDiscord()}>Sign in with Discord</button>}
          {canEditProfile && <PlayerProfileEditor playerId={player.id} initial={preferences} isServerBooster={recognition.isServerBooster} hasKrysServerTag={recognition.hasKrysServerTag} profileBadges={recognition.profileBadges} onSaved={setPreferences} />}
        </nav>

        {openProfileSection === "records" && <PlayerCourseRecords playerId={player.id} />}

        {openProfileSection === "stats" && hasCareerParticipation && <section className={styles.profileSectionPanel} id="player-stats-panel" aria-label="Player Stats">
          <p className={styles.sectionDescription}>Career statistics and performance overview</p>
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

        {(kwtHistory.length > 0 || kwtHistoryError) && <section style={card}>
          <h2 style={sectionTitle}>Historical KWT Scores</h2>
          {kwtHistoryError ? (
            <p style={historyError}>{kwtHistoryError}</p>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead><tr>
                  <th style={th}>Season</th><th style={th}>Week</th><th style={th}>Historical rank</th>
                  <th style={th}>Easy</th><th style={th}>Hard</th><th style={th}>Total</th>
                  <th style={th}>Place</th><th style={th}>Points</th>
                </tr></thead>
                <tbody>{kwtHistory.map((history) => <tr key={`${history.season_number}-${history.week_number}-${history.easy_course_code}-${history.hard_course_code}`}>
                  <td style={td}>{history.season_number}</td><td style={td}>{history.week_number}</td>
                  <td style={td}>{history.historical_rank || "Unknown"}</td>
                  <td style={td}>{history.easy_course_code}: {history.easy_score}</td>
                  <td style={td}>{history.hard_course_code}: {history.hard_score}</td>
                  <td style={td}><strong>{history.total_score}</strong></td>
                  <td style={td}>{history.placement ?? "—"}</td><td style={td}>{history.points ?? "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>}
        </section>}

        {openProfileSection === "aliases" && knownAliases.length > 0 && <section className={styles.profileSectionPanel} id="names-known-as-panel" aria-label="Names / Known As">
          <p className={styles.sectionDescription}>Player identity and name history</p><ul className={styles.aliasList}>{knownAliases.map(alias => <li key={alias}>{alias}</li>)}</ul>
        </section>}

        {openProfileSection === "trophies" && trophies.length > 0 && <section className={`${styles.profileSectionPanel} ${styles.trophyCasePanel}`} id="trophy-case" aria-label="Trophies & Achievements">
          <p className={styles.sectionDescription}>Complete trophy case and achievement history</p>
          <h2 style={sectionTitle}>Trophy Case</h2>

            <div className={styles.trophyGrid}>
              {trophies.map((trophy) => (
                <article key={trophy.id} className={styles.trophyCard}>
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

                  {trophy.image_url && <TrophyMedia src={trophy.image_url} alt={trophy.trophy_title || `${player.screen_name} trophy`} className={styles.trophyMedia} />}
                </article>
              ))}
            </div>
        </section>}

        </div>

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

const eyebrow: React.CSSProperties = { margin: "0 0 8px", color: "#f8fafc", fontSize: "clamp(1.05rem, 1.35vw, 1.375rem)", fontWeight: 900, letterSpacing: ".12em", lineHeight: 1.2, textTransform: "uppercase" }
const aboutSection: React.CSSProperties = { width: "min(100%, 760px)", margin: "0 auto 28px", padding: "clamp(14px, 2vw, 20px) clamp(18px, 3vw, 32px)", border: "1px solid #ffffff30", borderRadius: 16, background: "#02061766", boxShadow: "inset 0 1px #ffffff1f, 0 10px 28px #0003", backdropFilter: "blur(7px)", color: "#f8fafc", textAlign: "center" }
const aboutCopy: React.CSSProperties = { margin: 0, color: "#f8fafc", fontSize: "clamp(1.25rem, 1.65vw, 1.625rem)", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }
const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1900,
  margin: "0 auto",
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 14px",
  background: "#0206172e",
  border: "1px solid #ffffff38",
  borderRadius: 10,
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
  lineHeight: 1.25,
  backdropFilter: "blur(7px)",
}

const card: React.CSSProperties = {
  padding: 24,
  background: "#0f172aa6",
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
  background: "#020617b8",
  border: "1px solid #334155",
  borderRadius: 12,
}

const trophyTitle: React.CSSProperties = {
  marginTop: 0,
}

const muted: React.CSSProperties = {
  color: "#cbd5e1",
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

const messageCard: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  textAlign: "center",
  color: "#cbd5e1",
}
