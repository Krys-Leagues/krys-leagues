"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"
import PlayerProfileHero, { PlayerProfileRecognition } from "@/components/PlayerProfileHero"
import PlayerProfileEditor, { type ProfilePreferences as SavedProfilePreferences } from "@/components/PlayerProfileEditor"
import { getCanonicalPlayerAvatar } from "@/lib/playerAvatars"
import { DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY, getPlayerProfileBackground } from "@/lib/playerProfileBackgrounds"
import { profileBackgroundPublicUrl } from "@/lib/profileBackgrounds"
import { DEFAULT_PROFILE_PRESENTATION, normalizeProfilePresentation, profilePresentationStyle } from "@/lib/playerProfilePresentation"
import type { PublicCourse } from "@/lib/all-time/public-records"
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

type ProfilePreferences = SavedProfilePreferences & { has_saved_preferences: boolean | null }

const DEFAULT_PREFERENCES: ProfilePreferences = { background_key: DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY, background_id: null, background_path: null, background_display_name: null, name_effect: "auto", background_color: "#07111f", glow_color: "#ff2bd6", text_color: "#f8fafc", about_me: null, has_saved_preferences: null, ...DEFAULT_PROFILE_PRESENTATION }

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

type StatsSectionKey = "kwt" | "stroke" | "match" | "pyp" | "doubles" | "pro" | "solo" | "monthly"

function average(values: number[]) {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null
}

function formatAverage(value: number | null) {
  return value === null ? "—" : value.toFixed(2)
}

function competitionKey(value: string | null) {
  return (value || "other").trim().toLowerCase().replace(/[\s_]+/g, "-")
}

function competitionLabel(value: string) {
  return value === "kwt" ? "KWT" : value === "pyp" ? "PYP" : value.split("-").map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ")
}

function mapNameForKwtCourse(courseCode: string | null, courseMap: Map<string, string>) {
  return courseMap.get((courseCode || "").trim().toUpperCase()) || null
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
  const [openStatsSection, setOpenStatsSection] = useState<StatsSectionKey | null>(null)
  const [kwtMapFilter, setKwtMapFilter] = useState("")
  const [kwtCourseCatalog, setKwtCourseCatalog] = useState<Array<Pick<PublicCourse, "code" | "base_map">>>([])

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
      kwtCourseCatalogResponse,
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
      fetch("/api/records/public?view=courses")
        .then(async response => {
          if (!response.ok) return []
          const payload = await response.json() as { courses?: Array<Pick<PublicCourse, "code" | "base_map">> }
          return payload.courses || []
        })
        .catch(() => []),
      getCanonicalPlayerAvatar(playerId).catch(() => ({ canonicalPlayerId: playerId, avatarPath: null })),
      supabase.rpc("get_public_player_profile_preferences_v6", { p_player_id: canonicalId }),
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
    setKwtCourseCatalog(kwtCourseCatalogResponse)
    if (kwtHistoryResponse.error) {
      setKwtHistoryError(`KWT history could not be loaded: ${kwtHistoryResponse.error.message}`)
    }
    setAvatarPath(avatarResponse.avatarPath)
    if (!preferencesResponse.error) {
      const loaded = Array.isArray(preferencesResponse.data) ? preferencesResponse.data[0] : preferencesResponse.data
      if (loaded) setPreferences({ ...DEFAULT_PREFERENCES, ...loaded, has_saved_preferences: loaded.has_saved_preferences === true, ...normalizeProfilePresentation({ ...loaded, avatar_glow_color: loaded.avatar_glow_color || loaded.glow_color }) } as ProfilePreferences)
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

  const orderedKwtHistory = [...kwtHistory].sort((left, right) => left.season_number - right.season_number || left.week_number - right.week_number)
  const kwtCourseMap = new Map(kwtCourseCatalog.map(course => [course.code.trim().toUpperCase(), course.base_map]))
  const kwtMapOptions = Array.from(new Set(orderedKwtHistory.flatMap(history => [
    mapNameForKwtCourse(history.easy_course_code, kwtCourseMap),
    mapNameForKwtCourse(history.hard_course_code, kwtCourseMap),
  ]).filter((map): map is string => Boolean(map)))).sort((left, right) => left.localeCompare(right))
  const filteredKwtHistory = kwtMapFilter
    ? orderedKwtHistory.filter(history => mapNameForKwtCourse(history.easy_course_code, kwtCourseMap) === kwtMapFilter || mapNameForKwtCourse(history.hard_course_code, kwtCourseMap) === kwtMapFilter)
    : orderedKwtHistory
  const kwtEasyScores = orderedKwtHistory.map(history => history.easy_score)
  const kwtHardScores = orderedKwtHistory.map(history => history.hard_score)
  const kwtCombinedScores = orderedKwtHistory.map(history => history.total_score)
  const kwtPlacements = orderedKwtHistory.map(history => history.placement).filter((placement): placement is number => placement !== null)
  const membershipTypes = Array.from(new Set(memberships.map(membership => competitionKey(membership.league_type))))
  const simpleCompetitionTypes = ["doubles", "pro", "solo", "monthly"].filter(type => membershipTypes.includes(type))
  const hasStrokeSection = strokeHistory.length > 0 || Boolean(strokeHistoryError) || membershipTypes.includes("stroke")
  const hasMatchSection = matchHistory.length > 0 || Boolean(matchHistoryError) || membershipTypes.includes("match")
  const hasPypSection = pypHistory.length > 0 || Boolean(pypHistoryError) || membershipTypes.includes("pyp")
  const careerRecordKeys = new Set([
    ...memberships.map(membership => `${competitionKey(membership.league_type)}:${membership.season_number ?? "unknown"}`),
    ...strokeHistory.map(history => `stroke:${history.season_number}`),
    ...matchHistory.map(history => `match:${history.season_number}`),
    ...pypHistory.map(history => `pyp:${history.season_number}`),
    ...orderedKwtHistory.map(history => `kwt:${history.season_number}:${history.week_number}`),
  ])
  const recordedWins = strokeHistory.reduce((total, history) => total + history.wins, 0)
    + matchHistory.reduce((total, history) => total + history.wins, 0)
    + pypHistory.reduce((total, history) => total + history.wins, 0)
  const matchWins = matchHistory.reduce((total, history) => total + history.wins, 0)
  const matchLosses = matchHistory.reduce((total, history) => total + history.losses, 0)
  const matchDraws = matchHistory.reduce((total, history) => total + history.ties, 0)
  const matchPlayed = matchWins + matchLosses + matchDraws
  const matchWinPercentage = matchPlayed > 0 ? matchWins / matchPlayed * 100 : null
  const careerSectionCount = [orderedKwtHistory.length > 0, hasStrokeSection, hasMatchSection, hasPypSection, simpleCompetitionTypes.length > 0].filter(Boolean).length

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
    <main className={styles.page} data-glass-style={preferences.glass_style} data-blue-panel-glow={preferences.blue_panel_glow} style={{ "--profile-bg": preferences.background_color, "--profile-text": preferences.text_color, "--profile-background-image": `url("${profileBackgroundImage}")`, ...profilePresentationStyle(preferences, preferences.has_saved_preferences === false) } as React.CSSProperties}>
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
          {canEditProfile && <PlayerProfileEditor playerId={player.id} initial={preferences} isServerBooster={recognition.isServerBooster} hasKrysServerTag={recognition.hasKrysServerTag} profileBadges={recognition.profileBadges} onSaved={(saved) => setPreferences(current => ({ ...current, ...saved }))} />}
        </nav>

        {openProfileSection === "records" && <PlayerCourseRecords playerId={player.id} />}

        {openProfileSection === "stats" && hasCareerParticipation && <section className={styles.profileSectionPanel} id="player-stats-panel" aria-label="Player Stats">
          <p className={styles.sectionDescription}>Overall career summary with separate, expandable competition statistics</p>

          <section className={styles.statsSummaryPanel} aria-label="Overall Career Summary">
            <h2 style={sectionTitle}>Overall Career Summary</h2>
            <p className={styles.statsSummaryNote}>Cross-competition score averages are intentionally not combined because each format uses different scoring rules.</p>
            <div className={styles.statsSummaryGrid}>
              <CareerStat label="Competition sections" value={careerSectionCount} />
              <CareerStat label="Verified seasons / events" value={careerRecordKeys.size} />
              <CareerStat label="Recorded wins" value={recordedWins} />
              <CareerStat label="Trophies & awards" value={trophies.length} />
            </div>
          </section>

          <div className={styles.statsSectionList}>
            {(orderedKwtHistory.length > 0 || kwtHistoryError) && <section className={styles.statsSection}>
              <button type="button" className={styles.statsSectionToggle} aria-expanded={openStatsSection === "kwt"} onClick={() => setOpenStatsSection(current => current === "kwt" ? null : "kwt")}>
                <span>KWT</span><span>{orderedKwtHistory.length ? `${orderedKwtHistory.length} events / weeks` : "Unavailable"}</span>
              </button>
              {openStatsSection === "kwt" && <div className={styles.statsSectionBody}>
                {kwtHistoryError ? <p style={historyError}>{kwtHistoryError}</p> : <>
                  <h3 style={sectionTitle}>KWT Score History</h3>
                  <div className={styles.statsGrid}>
                    <CareerStat label="Events / weeks played" value={orderedKwtHistory.length} />
                    <CareerStat label="Average Easy" value={formatAverage(average(kwtEasyScores))} />
                    <CareerStat label="Average Hard" value={formatAverage(average(kwtHardScores))} />
                    <CareerStat label="Average Combined" value={formatAverage(average(kwtCombinedScores))} />
                    <CareerStat label="Best Easy" value={kwtEasyScores.length ? Math.min(...kwtEasyScores) : "—"} />
                    <CareerStat label="Best Hard" value={kwtHardScores.length ? Math.min(...kwtHardScores) : "—"} />
                    <CareerStat label="Best Combined" value={kwtCombinedScores.length ? Math.min(...kwtCombinedScores) : "—"} />
                    <CareerStat label="Average placement" value={formatAverage(average(kwtPlacements))} />
                    <CareerStat label="Best placement" value={kwtPlacements.length ? Math.min(...kwtPlacements) : "—"} />
                  </div>
                  <div className={styles.kwtMapViewControl}>
                    <label htmlFor="kwt-map-filter">View KWT results by map</label>
                    <select id="kwt-map-filter" value={kwtMapFilter} onChange={event => setKwtMapFilter(event.target.value)}>
                      <option value="">All maps · chronological</option>
                      {kwtMapOptions.map(map => <option key={map} value={map}>{map}</option>)}
                    </select>
                  </div>
                  <div className={styles.kwtHistoryTableWrap}>
                    <table className={styles.kwtHistoryTable}>
                      <thead><tr><th>Season</th><th>Week</th><th>Easy</th><th>Hard</th><th>Total</th><th>Place</th></tr></thead>
                      <tbody>{filteredKwtHistory.map(history => <tr key={`${history.season_number}-${history.week_number}-${history.easy_course_code}-${history.hard_course_code}`}>
                        <td>{history.season_number}</td><td>{history.week_number}</td>
                        <td><span className={styles.kwtCourseCode}>{history.easy_course_code}</span><strong className={styles.kwtEasyScore}>{history.easy_score}</strong></td>
                        <td><span className={styles.kwtCourseCode}>{history.hard_course_code}</span><strong className={styles.kwtHardScore}>{history.hard_score}</strong></td>
                        <td><strong>{history.total_score}</strong></td><td>{history.placement ?? "—"}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                </>}
              </div>}
            </section>}

            {hasStrokeSection && <section className={styles.statsSection}>
              <button type="button" className={styles.statsSectionToggle} aria-expanded={openStatsSection === "stroke"} onClick={() => setOpenStatsSection(current => current === "stroke" ? null : "stroke")}>
                <span>Stroke</span><span>{strokeHistory.length ? `${strokeHistory.length} season records` : "Participation recorded"}</span>
              </button>
              {openStatsSection === "stroke" && <div className={styles.statsSectionBody}>
                {strokeHistoryError ? <p style={historyError}>{strokeHistoryError}</p> : strokeHistory.length ? <div style={tableWrap}><table style={table}><thead><tr><th style={th}>Season</th><th style={th}>Division</th><th style={th}>Final Rank</th><th style={th}>Points</th><th style={th}>Wins</th><th style={th}>Losses</th><th style={th}>Ties</th><th style={th}>Strokes</th><th style={th}>Completed Games</th></tr></thead><tbody>{strokeHistory.map(history => <tr key={history.season_id}><td style={td}>{history.season_number}</td><td style={td}>Stroke D{history.division_number}</td><td style={td}>{history.division_rank}</td><td style={td}>{history.points}</td><td style={td}>{history.wins}</td><td style={td}>{history.losses}</td><td style={td}>{history.ties}</td><td style={td}>{history.strokes}</td><td style={td}>{history.completed_game_count}</td></tr>)}</tbody></table></div> : <ParticipationRows memberships={memberships} type="stroke" />}
              </div>}
            </section>}

            {hasMatchSection && <section className={styles.statsSection}>
              <button type="button" className={styles.statsSectionToggle} aria-expanded={openStatsSection === "match"} onClick={() => setOpenStatsSection(current => current === "match" ? null : "match")}>
                <span>Match</span><span>{matchHistory.length ? `${matchHistory.length} season records` : "Participation recorded"}</span>
              </button>
              {openStatsSection === "match" && <div className={styles.statsSectionBody}>
                {matchHistoryError ? <p style={historyError}>{matchHistoryError}</p> : matchHistory.length ? <><div className={styles.statsGrid}><CareerStat label="Matches played" value={matchHistory.reduce((total, history) => total + history.completed_game_count, 0)} /><CareerStat label="Wins" value={matchWins} /><CareerStat label="Losses" value={matchLosses} /><CareerStat label="Draws" value={matchDraws} /><CareerStat label="Win percentage" value={formatAverage(matchWinPercentage)} /><CareerStat label="Holes won" value={matchHistory.reduce((total, history) => total + history.holes_won, 0)} /></div><div style={tableWrap}><table style={table}><thead><tr><th style={th}>Season</th><th style={th}>Division</th><th style={th}>Final Rank</th><th style={th}>Played</th><th style={th}>Wins</th><th style={th}>Draws</th><th style={th}>Losses</th><th style={th}>Points</th><th style={th}>Holes Won</th></tr></thead><tbody>{matchHistory.map(history => <tr key={history.season_id}><td style={td}>{history.season_number}</td><td style={td}>Match D{history.division_number}</td><td style={td}>{history.division_rank}</td><td style={td}>{history.completed_game_count}</td><td style={td}>{history.wins}</td><td style={td}>{history.ties}</td><td style={td}>{history.losses}</td><td style={td}>{history.points}</td><td style={td}>{history.holes_won}</td></tr>)}</tbody></table></div></> : <ParticipationRows memberships={memberships} type="match" />}
              </div>}
            </section>}

            {hasPypSection && <section className={styles.statsSection}>
              <button type="button" className={styles.statsSectionToggle} aria-expanded={openStatsSection === "pyp"} onClick={() => setOpenStatsSection(current => current === "pyp" ? null : "pyp")}>
                <span>PYP</span><span>{pypHistory.length ? `${pypHistory.length} season records` : "Participation recorded"}</span>
              </button>
              {openStatsSection === "pyp" && <div className={styles.statsSectionBody}>
                {pypHistoryError ? <p style={historyError}>{pypHistoryError}</p> : pypHistory.length ? <><div className={styles.statsGrid}><CareerStat label="Seasons played" value={pypHistory.length} /><CareerStat label="Wins" value={pypHistory.reduce((total, history) => total + history.wins, 0)} /><CareerStat label="Losses" value={pypHistory.reduce((total, history) => total + history.losses, 0)} /><CareerStat label="Draws" value={pypHistory.reduce((total, history) => total + history.ties, 0)} /><CareerStat label="Holes won" value={pypHistory.reduce((total, history) => total + history.holes_won, 0)} /></div><div style={tableWrap}><table style={table}><thead><tr><th style={th}>Season</th><th style={th}>Division</th><th style={th}>Final Rank</th><th style={th}>Played</th><th style={th}>Wins</th><th style={th}>Draws</th><th style={th}>Losses</th><th style={th}>Points</th><th style={th}>Holes Won</th></tr></thead><tbody>{pypHistory.map(history => <tr key={history.season_id}><td style={td}>{history.season_number}</td><td style={td}>PYP D{history.division_number}</td><td style={td}>{history.division_rank}</td><td style={td}>{history.completed_game_count}</td><td style={td}>{history.wins}</td><td style={td}>{history.ties}</td><td style={td}>{history.losses}</td><td style={td}>{history.points}</td><td style={td}>{history.holes_won}</td></tr>)}</tbody></table></div>{pypHistory.map(history => { const fixtures = pypFixtureHistory.filter(fixture => fixture.season_id === history.season_id); return fixtures.length ? <details key={`fixtures-${history.season_id}`} style={historyDetails}><summary>Season {history.season_number} fixture details</summary>{fixtures.map(fixture => <p key={`${fixture.season_id}-${fixture.game_number}`} style={muted}>Round {fixture.game_number} · {fixture.player_role.toUpperCase()} vs {fixture.opponent_screen_name} · {fixture.course1_name}{fixture.course1_difficulty ? ` (${fixture.course1_difficulty})` : ""}: {fixture.player_screen_name} {fixture.course1_player_hw} – {fixture.opponent_screen_name} {fixture.course1_opponent_hw} · {fixture.course2_name}{fixture.course2_difficulty ? ` (${fixture.course2_difficulty})` : ""}: {fixture.player_screen_name} {fixture.course2_player_hw} – {fixture.opponent_screen_name} {fixture.course2_opponent_hw} · Combined {fixture.player_total_hw}–{fixture.opponent_total_hw} · {fixture.outcome}</p>)}</details> : null })}</> : <ParticipationRows memberships={memberships} type="pyp" />}
              </div>}
            </section>}

            {simpleCompetitionTypes.map(type => <section className={styles.statsSection} key={type}>
              <button type="button" className={styles.statsSectionToggle} aria-expanded={openStatsSection === type} onClick={() => setOpenStatsSection(current => current === type ? null : type as StatsSectionKey)}>
                <span>{competitionLabel(type)}</span><span>Participation recorded</span>
              </button>
              {openStatsSection === type && <div className={styles.statsSectionBody}><p style={muted}>Only authoritative participation records are available for this competition in the public profile reader. Detailed score history is not fabricated here.</p><ParticipationRows memberships={memberships} type={type} /></div>}
            </section>)}
          </div>
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

function CareerStat({ label, value }: { label: string; value: string | number }) {
  return <div className={styles.statCard}><span>{label}</span><strong>{value}</strong></div>
}

function ParticipationRows({ memberships, type }: { memberships: Membership[]; type: string }) {
  const rows = memberships.filter(membership => competitionKey(membership.league_type) === type)
  return rows.length > 0
    ? <div className={styles.statsParticipationGrid}>{rows.map(membership => <div key={membership.id} className={styles.statCard}><strong>{membership.division || "Division not listed"}</strong><span>Season {membership.season_number ?? "?"}</span></div>)}</div>
    : <p style={muted}>No detailed {competitionLabel(type)} history is available for this profile.</p>
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

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
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
