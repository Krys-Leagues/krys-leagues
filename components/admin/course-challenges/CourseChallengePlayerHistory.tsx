"use client"

import { useEffect, useRef, useState } from "react"
import styles from "./CourseChallengePlayerHistory.module.css"

type PlayerChoice = { id: string; screenName: string; discordName: string | null; discordUsername: string | null; discordId: string | null; verifiedAliases: string[] }
type Track = { status: string; earned: boolean; completedAt?: string | null; earnedAt?: string | null; easyRequirements: string[]; hardRequirements: string[]; label?: string; level?: number; stage?: number }
type HistoryRow = { id: string; courseName: string; difficulty: string; stageLabel: string; status: string; statuses: string[]; grossScores: unknown[]; grossTotal: unknown; relativeToPar: unknown; gameMode: unknown; roundDate: unknown; roundTime: unknown; createdAt: unknown; reviewedAt: unknown; reviewReason: unknown; reviewNotes: unknown; proofAvailable: boolean; submissionIds: string[]; achievementUses: string[]; reviewEvents: Array<{ action: string; from_status: string | null; to_status: string; notes: string | null; created_at: string }> }
type HistoryData = { player: PlayerChoice; overview: { totalSubmissions: number; pageScorecards: number; pending: number; needsReview: number; approved: number; rejected: number; earnedRewards: number }; books: Array<{ slug: string; name: string; levels: Track[]; prestige: Track[]; ace: Track[] }>; submissions: HistoryRow[]; pagination: { page: number; pageSize: number; totalSubmissions: number; hasPrevious: boolean; hasNext: boolean } }
type RecentSubmission = { key: string; playerId: string; playerName: string; challenge: string; status: string; courseName: string; difficulty: string; createdAt: string; proofAvailable: boolean; submissionIds: string[]; challengeLabels: string[] }
type RecentData = { timeZone: string; dayOffset: number; dayLabel: string; dateKey: string; dateLabel: string; submissions: RecentSubmission[] }
type HistoryViewMode = "full" | "player-history" | "game-history"

const initialFilters = { courseSlug: "", difficulty: "all", status: "all", stage: "all", from: "", to: "" }

export default function CourseChallengePlayerHistory({ mode = "full", embedded = false }: { mode?: HistoryViewMode; embedded?: boolean } = {}) {
  const showPlayerHistory = mode !== "game-history"
  const showRecentSubmissions = mode !== "player-history"
  const [search, setSearch] = useState("")
  const [players, setPlayers] = useState<PlayerChoice[]>([])
  const [activePlayerIndex, setActivePlayerIndex] = useState(-1)
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerChoice | null>(null)
  const [filters, setFilters] = useState(initialFilters)
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [dayOffset, setDayOffset] = useState(() => {
    if (typeof window === "undefined") return 0
    const parsed = Number(new URLSearchParams(window.location.search).get("dayOffset") || "0")
    return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 0), 6) : 0
  })
  const [recent, setRecent] = useState<RecentData | null>(null)
  const [recentLoading, setRecentLoading] = useState(true)
  const [recentMessage, setRecentMessage] = useState("")
  const [viewer, setViewer] = useState<{ url: string; rotation: number; scale: number } | null>(null)
  const searchRequest = useRef<AbortController | null>(null)
  const historyPanelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const playerId = params.get("playerId")
    if (playerId) void loadHistory(playerId, 1)
    // The URL-selected player is an initial navigation hint; filter changes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const query = search.trim()
    searchRequest.current?.abort()
    if (query.length < 2) return
    const controller = new AbortController()
    searchRequest.current = controller
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/course-challenges/history?search=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal })
        const payload = await response.json() as { players?: PlayerChoice[]; error?: string }
        if (controller.signal.aborted) return
        if (!response.ok) { setPlayers([]); setMessage(payload.error || "Player search is unavailable."); return }
        setMessage("")
        setPlayers(payload.players || [])
      } catch (caught) {
        if (!controller.signal.aborted) setMessage(caught instanceof Error ? caught.message : "Player search is unavailable.")
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [search])

  useEffect(() => {
    if (!showRecentSubmissions) {
      return
    }
    const controller = new AbortController()
    fetch(`/api/admin/course-challenges/history?recent=1&dayOffset=${dayOffset}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as RecentData & { error?: string }
        if (!response.ok) throw new Error(payload.error || "Recent submissions are unavailable.")
        if (!controller.signal.aborted) setRecent(payload)
      })
      .catch((caught) => { if (!controller.signal.aborted) setRecentMessage(caught instanceof Error ? caught.message : "Recent submissions are unavailable.") })
      .finally(() => { if (!controller.signal.aborted) setRecentLoading(false) })
    return () => controller.abort()
  }, [dayOffset, showRecentSubmissions])

  function selectDay(nextOffset: number) {
    const bounded = Math.min(Math.max(nextOffset, 0), 6)
    setRecentLoading(true)
    setRecentMessage("")
    setDayOffset(bounded)
    const url = new URL(window.location.href)
    url.searchParams.set("dayOffset", String(bounded))
    window.history.replaceState(null, "", url)
  }

  function selectPlayer(player: PlayerChoice) {
    setSelectedPlayer(player)
    setPlayers([])
    setActivePlayerIndex(-1)
    void loadHistory(player.id, 1)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setActivePlayerIndex(-1)
    if (value.trim().length < 2) {
      searchRequest.current?.abort()
      setPlayers([])
      setSearchLoading(false)
    } else {
      setSearchLoading(true)
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActivePlayerIndex((current) => players.length ? (current + 1) % players.length : -1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActivePlayerIndex((current) => players.length ? (current <= 0 ? players.length - 1 : current - 1) : -1)
    } else if (event.key === "Enter" && activePlayerIndex >= 0 && players[activePlayerIndex]) {
      event.preventDefault()
      selectPlayer(players[activePlayerIndex])
    } else if (event.key === "Escape") {
      setPlayers([])
      setActivePlayerIndex(-1)
    }
  }

  async function loadHistory(playerId: string, page: number) {
    setLoading(true)
    setMessage("")
    try {
      const query = new URLSearchParams({ playerId, page: String(page), pageSize: "25" })
      Object.entries(filters).forEach(([key, value]) => { if (value && value !== "all") query.set(key, value) })
      const response = await fetch(`/api/admin/course-challenges/history?${query}`, { cache: "no-store" })
      const payload = await response.json() as HistoryData & { error?: string }
      if (!response.ok) { setMessage(payload.error || "Player history is unavailable."); return }
      setData(payload)
      setSelectedPlayer(payload.player)
      const url = new URL(window.location.href)
      url.searchParams.set("playerId", playerId)
      window.history.replaceState(null, "", url)
      window.setTimeout(() => historyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Player history is unavailable.")
    } finally {
      setLoading(false)
    }
  }

  async function openEvidence(submissionId: string) {
    setMessage("")
    const response = await fetch(`/api/admin/course-challenges/history/evidence?submissionId=${encodeURIComponent(submissionId)}`, { cache: "no-store" })
    const payload = await response.json() as { signedUrl?: string | null; error?: string }
    if (!response.ok || !payload.signedUrl) { setMessage(payload.error || "Private scorecard evidence is unavailable."); return }
    setViewer({ url: payload.signedUrl, rotation: 0, scale: 1 })
  }

  function openRecentSubmission(row: RecentSubmission) {
    if (row.proofAvailable && row.submissionIds[0]) void openEvidence(row.submissionIds[0])
    else void loadHistory(row.playerId, 1)
  }

  return <div className={`${styles.page} ${embedded ? styles.embeddedPage : ""}`}>
    {showPlayerHistory && <section className={styles.searchPanel}>
      <div><h1>Player Challenge History</h1><p className={styles.muted}>Admin-only, read-only history for canonical players. Search names, verified aliases, or linked Discord identity.</p></div>
      <form className={styles.searchRow} onSubmit={(event) => event.preventDefault()}>
        <input className={styles.searchInput} value={search} onChange={(event) => handleSearchChange(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Search player, alias, or Discord ID" aria-label="Search player challenge history" aria-autocomplete="list" aria-controls="course-challenge-player-results" aria-activedescendant={activePlayerIndex >= 0 ? `player-result-${players[activePlayerIndex]?.id}` : undefined} />
        <button className={styles.button} type="submit">SEARCH PLAYERS</button>
      </form>
      {search.trim().length >= 2 && <div id="course-challenge-player-results" className={styles.playerResults} role="listbox" aria-label="Canonical player search results">
        {searchLoading ? <p className={styles.muted}>Searching canonical players…</p> : players.length > 0 ? players.map((player, index) => <button id={`player-result-${player.id}`} key={player.id} className={styles.playerResult} data-active={index === activePlayerIndex} role="option" aria-selected={index === activePlayerIndex} type="button" onClick={() => selectPlayer(player)}><span><strong>{player.screenName}</strong>{player.verifiedAliases.length > 0 && <span className={styles.alias}> · {player.verifiedAliases.join(", ")}</span>}</span><span>{player.discordName || player.discordUsername || player.discordId || "Canonical player"}</span></button>) : <p className={styles.noMatches}>No matching players</p>}
      </div>}
    </section>}

    {showRecentSubmissions && <section className={styles.recentPanel} aria-labelledby="recent-submissions-heading">
      <div className={styles.recentHeading}><div><h2 id="recent-submissions-heading">RECENT SUBMISSIONS</h2><p className={styles.muted}>Read-only submissions received in the selected calendar day.</p></div><span className={styles.timeZoneNote}>{recent?.timeZone || "America/New_York"}</span></div>
      <div className={styles.dayNav} aria-label="Recent submission day navigation">
        <button className={styles.button} type="button" disabled={dayOffset >= 6 || recentLoading} onClick={() => selectDay(dayOffset + 1)}>OLDER ←</button>
        <div className={styles.dayLabel}><strong>{recent?.dayLabel || "TODAY"}</strong><span>{recent?.dateLabel || "Loading date…"}</span></div>
        <button className={styles.button} type="button" disabled={dayOffset <= 0 || recentLoading} onClick={() => selectDay(dayOffset - 1)}>→ NEWER</button>
      </div>
      {recentMessage && <p className={styles.notice}>{recentMessage}</p>}
      {recentLoading ? <p className={styles.muted}>Loading recent submissions…</p> : recent && recent.submissions.length === 0 ? <p className={styles.muted}>No Course Challenge submissions for this day.</p> : <div className={styles.recentList}>{recent?.submissions.map((row) => <div className={styles.recentRow} key={row.key}><button className={styles.recentPlayer} type="button" onClick={() => void loadHistory(row.playerId, 1)}>{row.playerName}</button><button className={styles.recentChallenge} type="button" onClick={() => openRecentSubmission(row)}>{row.challenge}</button></div>)}</div>}
    </section>}

    {message && <p className={styles.notice} role="status">{message}</p>}
    {selectedPlayer && <section ref={historyPanelRef} className={styles.panel}>
      <div className={styles.identity}><div><h2>{selectedPlayer.screenName}</h2><p className={styles.muted}>Canonical UUID: {selectedPlayer.id}</p></div><span className={styles.alias}>{selectedPlayer.discordName || selectedPlayer.discordUsername || selectedPlayer.discordId || "No linked Discord identity shown"}</span></div>
      <div className={styles.filterRow} aria-label="History filters">
        <select className={styles.filter} value={filters.courseSlug} onChange={(event) => setFilters({ ...filters, courseSlug: event.target.value })} aria-label="Filter by course"><option value="">All books / courses</option>{data?.books.map((book) => <option key={book.slug} value={book.slug}>{book.name}</option>)}</select>
        <select className={styles.filter} value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })} aria-label="Filter by difficulty"><option value="all">Easy + Hard</option><option>Easy</option><option>Hard</option></select>
        <select className={styles.filter} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} aria-label="Filter by status"><option value="all">All statuses</option><option value="pending">Pending</option><option value="needs_review">Needs review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
        <select className={styles.filter} value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })} aria-label="Filter by stage"><option value="all">All stages</option><option value="level">Levels 1–5</option><option value="ace">Ace Track</option><option value="prestige">Course Pro / Master</option></select>
        <input className={styles.dateInput} type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} aria-label="From date" />
        <input className={styles.dateInput} type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} aria-label="To date" />
        <button className={styles.button} type="button" disabled={loading} onClick={() => void loadHistory(selectedPlayer.id, 1)}>APPLY FILTERS</button>
      </div>
      {loading ? <p className={styles.muted}>Loading player history…</p> : data && <>
        <div className={styles.summaryGrid}><div className={styles.summaryItem}><strong>{data.overview.totalSubmissions}</strong><span>Submitted cards</span></div><div className={styles.summaryItem}><strong>{data.overview.approved}</strong><span>Approved</span></div><div className={styles.summaryItem}><strong>{data.overview.pending + data.overview.needsReview}</strong><span>Awaiting review</span></div><div className={styles.summaryItem}><strong>{data.overview.rejected}</strong><span>Rejected</span></div><div className={styles.summaryItem}><strong>{data.overview.earnedRewards}</strong><span>Earned rewards</span></div></div>
        <h2>Achievement Books and Progress</h2>
        <div className={styles.bookGrid}>{data.books.map((book) => <article className={styles.book} key={book.slug}><h3>{book.name}</h3><div className={styles.trackGrid}>{book.levels.map((track) => <TrackCard key={`level-${track.level}`} track={track} title={`Level ${track.level}`} />)}{book.prestige.map((track) => <TrackCard key={`prestige-${track.stage}`} track={track} title={track.label || `Prestige ${track.stage}`} />)}{book.ace.map((track) => <TrackCard key={`ace-${track.stage}`} track={track} title={track.label || `Ace ${track.stage}`} />)}</div></article>)}</div>
        <h2>Submitted Scorecards</h2>
        {data.submissions.length === 0 ? <p className={styles.muted}>No stored scorecards match these filters. Unavailable history is shown as unavailable; no events are fabricated.</p> : <div className={styles.historyList}>{data.submissions.map((row) => <HistoryCard key={row.id} row={row} onEvidence={openEvidence} />)}</div>}
        <div className={styles.pager}><button className={styles.button} type="button" disabled={!data.pagination.hasPrevious || loading} onClick={() => void loadHistory(selectedPlayer.id, data.pagination.page - 1)}>← PREVIOUS</button><span className={styles.muted}>Page {data.pagination.page} · {data.pagination.totalSubmissions} stored submissions</span><button className={styles.button} type="button" disabled={!data.pagination.hasNext || loading} onClick={() => void loadHistory(selectedPlayer.id, data.pagination.page + 1)}>NEXT →</button></div>
      </>}
    </section>}
    {viewer && <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Private scorecard evidence viewer"><div className={styles.viewer}><div className={styles.viewerToolbar}><button className={styles.button} type="button" onClick={() => setViewer({ ...viewer, scale: Math.max(.5, viewer.scale - .25) })}>Zoom out</button><button className={styles.button} type="button" onClick={() => setViewer({ ...viewer, scale: 1, rotation: 0 })}>Fit / reset</button><button className={styles.button} type="button" onClick={() => setViewer({ ...viewer, scale: Math.min(3, viewer.scale + .25) })}>Zoom in</button><button className={styles.button} type="button" onClick={() => setViewer({ ...viewer, rotation: (viewer.rotation + 90) % 360 })}>Rotate</button><button className={styles.button} type="button" onClick={() => setViewer(null)}>Close</button></div><div className={styles.viewerCanvas}><img className={styles.viewerImage} src={viewer.url} alt="Private original Course Challenge scorecard" style={{ width: `${viewer.scale * 100}%`, transform: `rotate(${viewer.rotation}deg)` }} /></div></div></div>}
  </div>
}

function TrackCard({ track, title }: { track: Track; title: string }) {
  const className = track.status === "earned" ? styles.earned : track.status === "pending" ? styles.pending : styles.notEarned
  return <div className={styles.track}><div className={styles.trackTitle}><span>{title}</span><span className={className}>{track.status === "earned" ? "EARNED" : track.status === "pending" ? "PENDING" : "NOT EARNED"}</span></div>{(track.earnedAt || track.completedAt) && <small className={styles.muted}>Awarded/completed: {new Date(String(track.earnedAt || track.completedAt)).toLocaleDateString()}</small>}<ul className={styles.requirements}>{track.easyRequirements.length > 0 && <li>Easy: {track.easyRequirements.join(" · ")}</li>}{track.hardRequirements.length > 0 && <li>Hard: {track.hardRequirements.join(" · ")}</li>}</ul></div>
}

function HistoryCard({ row, onEvidence }: { row: HistoryRow; onEvidence: (id: string) => Promise<void> }) {
  return <article className={styles.historyCard}><div className={styles.historyHeader}><h3>{row.courseName} · {row.stageLabel} · {row.difficulty}</h3><strong>{row.statuses.join(" / ").toUpperCase()}</strong></div>{row.achievementUses.length > 1 && <p className={styles.muted}>One stored scorecard reused for: {row.achievementUses.join(", ")}. Displayed once to avoid duplicate history.</p>}<div className={styles.facts}><span>Round date <strong>{String(row.roundDate || "Not recorded")}</strong></span><span>Round time <strong>{String(row.roundTime || "Not recorded")}</strong></span><span>Game mode <strong>{String(row.gameMode || "Not recorded")}</strong></span><span>Submitted <strong>{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : "Not recorded"}</strong></span><span>Reviewed <strong>{row.reviewedAt ? new Date(String(row.reviewedAt)).toLocaleString() : "Not reviewed"}</strong></span><span>Evidence <strong>{row.proofAvailable ? "Private proof available" : "Unavailable"}</strong></span></div><p className={styles.scoreLine}>Gross scorecard: <strong>{row.grossScores.length ? row.grossScores.join(", ") : "Not transcribed / unavailable"}</strong>{row.grossTotal !== null && row.grossTotal !== undefined ? ` · total ${String(row.grossTotal)} (${String(row.relativeToPar ?? "—")} to par)` : ""}</p>{row.reviewReason !== null && row.reviewReason !== undefined && <p className={styles.muted}>Review reason: {String(row.reviewReason)}</p>}{row.reviewNotes !== null && row.reviewNotes !== undefined && <p className={styles.muted}>Review notes: {String(row.reviewNotes)}</p>}{row.reviewEvents.length > 0 && <details><summary>Review history ({row.reviewEvents.length})</summary><ul className={styles.eventList}>{row.reviewEvents.map((event, index) => <li key={`${event.created_at}-${index}`}>{event.action}: {event.from_status || "—"} → {event.to_status}{event.notes ? ` — ${event.notes}` : ""} · {new Date(event.created_at).toLocaleString()}</li>)}</ul></details>}{row.proofAvailable && <button className={styles.evidenceButton} type="button" onClick={() => void onEvidence(row.submissionIds[0])}>VIEW ORIGINAL PRIVATE SCORECARD</button>}</article>
}
