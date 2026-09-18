"use client"

import Link from "next/link"
import { useEffect, useState, type CSSProperties } from "react"
import PlayerProfileNavLink from "@/components/PlayerProfileNavLink"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import {
  currentDashboardLeagues,
  dashboardMembershipView,
  formatDashboardDate,
  matchDivisionAccent,
  selectedDashboardLeague,
  strokeDivisionAccent,
  type DashboardLeagueKey,
  type DashboardLeagueOption,
  type MatchDashboardAssignment,
  type MatchDashboardLeague,
  type PlayerDashboardPayload,
  type StrokeDashboardAssignment,
  type StrokeDashboardLeague,
} from "@/lib/playerDashboard"
import { supabase } from "@/lib/supabase"
import styles from "./player-dashboard.module.css"

const DASHBOARD_ERROR = "Your player dashboard is temporarily unavailable. Please try again."

export default function PlayerDashboardClient() {
  const [dashboard, setDashboard] = useState<PlayerDashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [message, setMessage] = useState("")
  const [selectedLeague, setSelectedLeague] = useState<DashboardLeagueKey | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setMessage("")
      setAuthRequired(false)

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (cancelled) return

      if (sessionError) {
        console.error("Player dashboard session check failed", { code: sessionError.code })
        setMessage(DASHBOARD_ERROR)
        setLoading(false)
        return
      }

      if (!sessionData.session) {
        setAuthRequired(true)
        setLoading(false)
        return
      }

      const response = await supabase.rpc("get_player_dashboard_v1")
      if (cancelled) return

      if (response.error || !isPlayerDashboardPayload(response.data)) {
        console.error("Player dashboard reader failed", { code: response.error?.code || "invalid_payload" })
        setMessage(DASHBOARD_ERROR)
        setLoading(false)
        return
      }

      const currentLeagues = currentDashboardLeagues(response.data.leagues)
      setDashboard(response.data)
      setSelectedLeague(selectedDashboardLeague(null, currentLeagues))
      setLoading(false)
    }

    void loadDashboard().catch(() => {
      if (cancelled) return
      console.error("Player dashboard reader failed", { code: "unexpected_client_error" })
      setMessage(DASHBOARD_ERROR)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [])

  async function signInWithDiscord() {
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: createDiscordAuthCallbackUrl("player", "/player-dashboard") },
    })
  }

  const match = dashboard?.leagues.match ?? null
  const stroke = dashboard?.leagues.stroke ?? null
  const availableLeagues = dashboard ? currentDashboardLeagues(dashboard.leagues) : []
  const activeLeague = selectedDashboardLeague(selectedLeague, availableLeagues)
  const membershipView = dashboard ? dashboardMembershipView(dashboard.leagues) : null

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topBar}>
          <Link href="/" className={styles.backButton}>← Krys Leagues</Link>
        </nav>

        <header className={styles.headerCard}>
          <p className={styles.kicker}>KRYS LEAGUES</p>
          <h1>Player Dashboard</h1>
          <p>Your current league participation.</p>
        </header>

        {loading ? (
          <div className={styles.stateCard}>Loading dashboard…</div>
        ) : authRequired ? (
          <section className={styles.stateCard}>
            <h2>Sign in to open your dashboard</h2>
            <p>Your personal league information is available after Discord authentication.</p>
            <button type="button" onClick={() => void signInWithDiscord()} className={styles.primaryAction}>Sign in with Discord</button>
          </section>
        ) : message ? (
          <div className={styles.stateCard} role="alert">{message}</div>
        ) : dashboard && match && stroke ? (
          <>
            <section className={styles.playerCard}>
              <span>PLAYER</span>
              <h2>{dashboard.player.screen_name}</h2>
            </section>

            {membershipView === "coverage-pending" ? (
              <MembershipCoveragePending />
            ) : membershipView === "authoritative-empty" ? (
              <GlobalJoinState />
            ) : (
              <>
                <LeagueSwitcher
                  leagues={availableLeagues}
                  selected={activeLeague}
                  onSelect={setSelectedLeague}
                />

                {activeLeague === "match" ? (
                  <MatchDashboardCard match={match} />
                ) : activeLeague === "stroke" ? (
                  <StrokeDashboardCard stroke={stroke} />
                ) : (
                  <FutureLeagueCard league={availableLeagues.find((league) => league.key === activeLeague) ?? null} />
                )}

                <section className={styles.actionGrid}>
                  <Link href={activeLeague === "stroke" ? "/stroke" : "/match-play"} className={styles.actionButton}>
                    {activeLeague === "stroke" ? "Public Stroke" : "Public Match Play"}
                  </Link>
                  <PlayerProfileNavLink className={styles.actionButton}>Player Profile</PlayerProfileNavLink>
                  <Link href="/standings" className={styles.actionButton}>View Standings</Link>
                  <Link href="/records" className={styles.actionButton}>View Records</Link>
                </section>
              </>
            )}
          </>
        ) : (
          <div className={styles.stateCard} role="alert">{DASHBOARD_ERROR}</div>
        )}
      </div>
    </main>
  )
}

function MembershipCoveragePending() {
  return (
    <section className={styles.futureLeague}>
      <p className={styles.kicker}>CURRENT LEAGUES</p>
      <h2>Your league dashboard is on the way</h2>
      <p>Your current league information is still being connected. Please check back soon.</p>
    </section>
  )
}

function GlobalJoinState() {
  return (
    <section className={styles.joinCard}>
      <p className={styles.kicker}>CURRENT LEAGUES</p>
      <h2>Ready to play?</h2>
      <p>You are not currently rostered in a Krys League.</p>
      <Link href="/join" className={styles.joinButton}>JOIN NOW</Link>
    </section>
  )
}

function LeagueSwitcher({
  leagues,
  selected,
  onSelect,
}: {
  leagues: DashboardLeagueOption[]
  selected: DashboardLeagueKey | null
  onSelect: (league: DashboardLeagueKey | null) => void
}) {
  if (leagues.length === 1) {
    return (
      <section className={styles.leagueSwitcher} aria-label="Viewing league">
        <span className={styles.leagueSwitcherLabel}>VIEWING LEAGUE</span>
        <strong className={styles.singleLeague}>{leagues[0].label}</strong>
      </section>
    )
  }

  return (
    <section className={styles.leagueSwitcher} aria-label="Current league switcher">
      <label className={styles.leagueSwitcherLabel} htmlFor="dashboard-league">CURRENT LEAGUE</label>
      <select
        id="dashboard-league"
        className={styles.leagueSelect}
        value={selected ?? ""}
        onChange={(event) => onSelect(selectedDashboardLeague(event.currentTarget.value as DashboardLeagueKey, leagues))}
      >
        {leagues.map((league) => <option value={league.key} key={league.key}>{league.label}</option>)}
      </select>
    </section>
  )
}

function FutureLeagueCard({ league }: { league: DashboardLeagueOption | null }) {
  return (
    <section className={styles.futureLeague}>
      <p className={styles.kicker}>CURRENT LEAGUE</p>
      <h2>{league?.label ?? "League"}</h2>
      <p>Your current membership is confirmed. Personal details for this league will be added in a future dashboard update.</p>
    </section>
  )
}

function MatchDashboardCard({ match }: { match: MatchDashboardLeague }) {
  if (!match.rostered || match.division_number === null) {
    return (
      <section className={styles.matchCard}>
        <div className={styles.matchIdentity}>
          <p>MATCH PLAY</p>
          <h2>{match.season_number === null ? "Current season" : `Season ${match.season_number}`}</h2>
        </div>
        <div className={styles.notRostered}>You are not currently rostered in Match Play.</div>
      </section>
    )
  }

  const accent = matchDivisionAccent(match.division_number)
  const deadline = formatDashboardDate(match.season_due_date)
  const remainingAssignments = match.assignments.filter((assignment) => !assignment.completed)

  return (
    <section className={styles.matchCard} style={{ "--match-accent": accent } as CSSProperties}>
      <div className={styles.matchIdentity}>
        <p>MATCH PLAY</p>
        <h2>Season {match.season_number ?? "—"}</h2>
        {deadline && <span>Season deadline: {deadline}</span>}
      </div>

      <h3 className={styles.divisionHeading}>MATCH DIVISION {match.division_number}</h3>

      <section className={styles.dashboardSection} aria-labelledby="match-current-standing">
        <div className={styles.sectionTitle}>
          <p>CURRENT STANDING</p>
          <h4 id="match-current-standing">My Match totals</h4>
        </div>
        <div className={styles.statGrid}>
          <Stat label="Rank" value={match.displayed_rank ?? "—"} />
          <Stat label="Record" value={`${match.wins}-${match.losses}-${match.draws}`} />
          <Stat label="Played" value={match.played} />
          <Stat label="Points" value={match.points} />
          <Stat label="Holes won" value={match.holes_won} />
        </div>
        {!match.results_started && <p className={styles.rankNote}>Preseason rank follows the approved roster order until this division begins play.</p>}
      </section>

      <section className={styles.dashboardSection} aria-labelledby="match-course-assignments">
        <div className={styles.sectionTitle}>
          <p>MY COURSE ASSIGNMENTS</p>
          <h4 id="match-course-assignments">My Match schedule</h4>
        </div>
        {match.assignments.length === 0 ? (
          <p className={styles.empty}>No Match course assignments are currently published.</p>
        ) : (
          <div className={styles.assignmentList}>
            {match.assignments.map((assignment) => <AssignmentRow assignment={assignment} key={`${assignment.game_number}:${assignment.opponent_screen_name}`} />)}
          </div>
        )}
      </section>

      <section className={styles.dashboardSection} aria-labelledby="match-results">
        <div className={styles.sectionTitle}>
          <p>MY RESULTS</p>
          <h4 id="match-results">Completed Match games</h4>
        </div>
        {match.results.length === 0 ? (
          <p className={styles.empty}>No completed Match results are recorded yet.</p>
        ) : (
          <div className={styles.resultList}>
            {match.results.map((result) => (
              <article className={styles.resultRow} key={`${result.game_number}:${result.opponent_screen_name}`}>
                <div>
                  <span>GAME {result.game_number}</span>
                  <strong>vs {result.opponent_screen_name || "Opponent unavailable"}</strong>
                  <small>{result.course || "Course not set"}</small>
                </div>
                <div className={styles.resultScore}>
                  <strong>{result.player_holes_won}–{result.opponent_holes_won}</strong>
                  <span>{result.outcome.toUpperCase()}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.dashboardSection} aria-labelledby="match-remaining">
        <div className={styles.sectionTitle}>
          <p>REMAINING</p>
          <h4 id="match-remaining">{match.remaining_count} game{match.remaining_count === 1 ? "" : "s"} remaining</h4>
        </div>
        {remainingAssignments.length === 0 ? (
          <p className={styles.empty}>No remaining Match games.</p>
        ) : (
          <ul className={styles.remainingList}>
            {remainingAssignments.map((assignment) => (
              <li key={`${assignment.game_number}:${assignment.opponent_screen_name}`}>
                Game {assignment.game_number} · {assignment.opponent_screen_name || "Opponent unavailable"} · {assignment.course || "Course not set"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

function StrokeDashboardCard({ stroke }: { stroke: StrokeDashboardLeague }) {
  if (!stroke.rostered || stroke.division_number === null) {
    return (
      <section className={styles.matchCard}>
        <div className={styles.matchIdentity}>
          <p>STROKE</p>
          <h2>{stroke.season_number === null ? "Current season" : `Season ${stroke.season_number}`}</h2>
        </div>
        <div className={styles.notRostered}>You are not currently rostered in Stroke.</div>
      </section>
    )
  }

  const accent = strokeDivisionAccent(stroke.division_number)
  const deadline = formatDashboardDate(stroke.season_due_date)
  const remainingAssignments = stroke.assignments.filter((assignment) => !assignment.completed)

  return (
    <section className={styles.matchCard} style={{ "--match-accent": accent } as CSSProperties}>
      <div className={styles.matchIdentity}>
        <p>STROKE</p>
        <h2>Season {stroke.season_number ?? "—"}</h2>
        {deadline && <span>Season deadline: {deadline}</span>}
      </div>

      <h3 className={styles.divisionHeading}>STROKE DIVISION {stroke.division_number}</h3>

      <section className={styles.dashboardSection} aria-labelledby="stroke-current-standing">
        <div className={styles.sectionTitle}>
          <p>CURRENT STANDING</p>
          <h4 id="stroke-current-standing">My Stroke totals</h4>
        </div>
        <div className={styles.statGrid}>
          <Stat label="Rank" value={stroke.displayed_rank ?? "—"} />
          <Stat label="Record" value={`${stroke.wins}-${stroke.losses}-${stroke.draws}`} />
          <Stat label="Played" value={stroke.played} />
          <Stat label="Points" value={stroke.points} />
          <Stat label="Strokes" value={stroke.strokes} />
        </div>
      </section>

      <section className={styles.dashboardSection} aria-labelledby="stroke-course-assignments">
        <div className={styles.sectionTitle}>
          <p>MY COURSE ASSIGNMENTS</p>
          <h4 id="stroke-course-assignments">My Stroke schedule</h4>
        </div>
        {stroke.assignments.length === 0 ? (
          <p className={styles.empty}>No Stroke course assignments are currently published.</p>
        ) : (
          <div className={styles.assignmentList}>
            {stroke.assignments.map((assignment) => <StrokeAssignmentRow assignment={assignment} key={`${assignment.game_number}:${assignment.opponent_screen_name}`} />)}
          </div>
        )}
      </section>

      <section className={styles.dashboardSection} aria-labelledby="stroke-results">
        <div className={styles.sectionTitle}>
          <p>MY RESULTS</p>
          <h4 id="stroke-results">Completed Stroke games</h4>
        </div>
        {stroke.results.length === 0 ? (
          <p className={styles.empty}>No completed Stroke results are recorded yet.</p>
        ) : (
          <div className={styles.resultList}>
            {stroke.results.map((result) => (
              <article className={styles.resultRow} key={`${result.game_number}:${result.opponent_screen_name}`}>
                <div>
                  <span>GAME {result.game_number}</span>
                  <strong>vs {result.opponent_screen_name || "Opponent unavailable"}</strong>
                  <small>{result.course || "Course not set"}</small>
                </div>
                <div className={styles.resultScore}>
                  <strong>{result.player_score}–{result.opponent_score}</strong>
                  <span>{result.outcome.toUpperCase()}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.dashboardSection} aria-labelledby="stroke-remaining">
        <div className={styles.sectionTitle}>
          <p>REMAINING</p>
          <h4 id="stroke-remaining">{stroke.remaining_count} game{stroke.remaining_count === 1 ? "" : "s"} remaining</h4>
        </div>
        {remainingAssignments.length === 0 ? (
          <p className={styles.empty}>No remaining Stroke games.</p>
        ) : (
          <ul className={styles.remainingList}>
            {remainingAssignments.map((assignment) => (
              <li key={`${assignment.game_number}:${assignment.opponent_screen_name}`}>
                Game {assignment.game_number} · {assignment.opponent_screen_name || "Opponent unavailable"} · {assignment.course || "Course not set"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

function AssignmentRow({ assignment }: { assignment: MatchDashboardAssignment }) {
  const dueDate = formatDashboardDate(assignment.due_date)
  return (
    <article className={styles.assignmentRow}>
      <div className={styles.gameNumber}>GAME {assignment.game_number}</div>
      <div className={styles.assignmentMain}>
        <strong>vs {assignment.opponent_screen_name || "Opponent unavailable"}</strong>
        <span>{assignment.course || "Course not set"}</span>
        {dueDate && <small>Season deadline: {dueDate}</small>}
      </div>
      <span className={`${styles.status} ${assignment.completed ? styles.complete : styles.remaining}`}>
        {assignment.completed ? "Completed" : "Remaining"}
      </span>
    </article>
  )
}

function StrokeAssignmentRow({ assignment }: { assignment: StrokeDashboardAssignment }) {
  const dueDate = formatDashboardDate(assignment.due_date)
  return (
    <article className={styles.assignmentRow}>
      <div className={styles.gameNumber}>GAME {assignment.game_number}</div>
      <div className={styles.assignmentMain}>
        <strong>vs {assignment.opponent_screen_name || "Opponent unavailable"}</strong>
        <span>{assignment.course || "Course not set"}</span>
        {dueDate && <small>Season deadline: {dueDate}</small>}
      </div>
      <span className={`${styles.status} ${assignment.completed ? styles.complete : styles.remaining}`}>
        {assignment.completed ? "Completed" : "Remaining"}
      </span>
    </article>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className={styles.stat}><span>{label}</span><strong>{value}</strong></div>
}

function isPlayerDashboardPayload(value: unknown): value is PlayerDashboardPayload {
  if (!value || typeof value !== "object") return false
  const payload = value as Partial<PlayerDashboardPayload>
  return typeof payload.player?.screen_name === "string"
    && typeof payload.leagues?.match?.rostered === "boolean"
    && Array.isArray(payload.leagues.match.assignments)
    && Array.isArray(payload.leagues.match.results)
    && typeof payload.leagues?.stroke?.rostered === "boolean"
    && Array.isArray(payload.leagues.stroke.assignments)
    && Array.isArray(payload.leagues.stroke.results)
}
