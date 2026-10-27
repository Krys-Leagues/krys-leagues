"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { formatGolfHandicapIndex } from "@/lib/handicap/indexDisplay"
import { KWT_EXTERNAL_HOME } from "@/lib/kwtPublicContent"
import { buildKwtDisplayRanks, divisionMedalEmoji, type KwtDivision } from "@/lib/kwtNetCompetition"
import { KWT_NET_DIVISION_FILTERS, filterKwtDivision } from "@/lib/kwtSeason15Competition"
import type { KwtNetPublicPayload, KwtNetPublicResult } from "@/lib/kwtNetServer"
import styles from "./page.module.css"
import rankingStyles from "./ranking.module.css"

type View = "WEEKLY" | "SEASON"
type DivisionFilter = KwtDivision | "PROVISIONAL" | "ALL"

const divisionClasses: Record<string, string> = {
  ELITE: styles.elite,
  PRO: styles.pro,
  "SEMI-PRO": styles.semiPro,
  AMATEUR: styles.amateur,
  PROVISIONAL: styles.provisional,
}

const divisionBadgeClasses: Record<string, string> = {
  ELITE: rankingStyles.eliteBadge,
  PRO: rankingStyles.proBadge,
  "SEMI-PRO": rankingStyles.semiProBadge,
  AMATEUR: rankingStyles.amateurBadge,
  PROVISIONAL: rankingStyles.provisionalBadge,
}

export default function KwtNetPage() {
  const [payload, setPayload] = useState<KwtNetPublicPayload | null>(null)
  const [division, setDivision] = useState<DivisionFilter>("ALL")
  const [view, setView] = useState<View>("WEEKLY")
  const [showAllowance, setShowAllowance] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    void fetch("/api/kwt/net", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("KWT NET is temporarily unavailable.")
      setPayload(await response.json() as KwtNetPublicPayload)
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "KWT NET is temporarily unavailable."))
  }, [])

  const allRows = useMemo(() => view === "SEASON" ? payload?.season.rows ?? [] : payload?.rows ?? [], [payload, view])
  const visibleRows = useMemo(() => filterKwtDivision(allRows, division), [allRows, division])
  const courseTheme = view === "SEASON" ? styles.seasonTheme : (!payload?.event || payload.event.courseName.toLowerCase().includes("raptor") ? styles.raptorTheme : styles.neutralTheme)

  return <main className={`${styles.page} ${courseTheme}`} data-course-theme={payload?.event?.courseName ?? "pending"}>
    <div className={styles.backdrop} aria-hidden="true" />
    <div className={styles.shell}>
      <Link href="/kwt" className={styles.back}>← Back to KWT</Link>
      <header className={styles.header}>
        <p className={styles.eyebrow}>KRYS LEAGUES · KWT</p>
        <h1>KWT NET LEADERBOARD</h1>
        <p className={styles.intro}>See how you stack up in this week&apos;s KWT NET competition!</p>
        <div className={styles.actions}>
          <a className={styles.secondaryAction} href={KWT_EXTERNAL_HOME} target="_blank" rel="noopener noreferrer">GO TO KWT SITE — ENTER SCORES / VIEW GROSS</a>
        </div>
      </header>

      {error && <p role="alert" className={styles.empty}>{error}</p>}
      {!error && !payload && <p className={styles.empty}>Loading this week&apos;s leaderboard…</p>}
      <Board title={view === "WEEKLY" ? "WEEKLY NET" : "SEASON NET"} rows={visibleRows} allRows={allRows} season={view === "SEASON"} seasonAvailable={payload?.season.state === "AVAILABLE"} seasonNumber={payload?.season.season || "15"} view={view} setView={setView} division={division} setDivision={setDivision} showAllowance={showAllowance} setShowAllowance={setShowAllowance} payload={payload} />
      <BadgeKey />
      {view === "WEEKLY" && <p className={styles.pointsNote}>Official points follow the KWT ranking schedule.</p>}
    </div>
  </main>
}

function Board({ title, rows, allRows, season, seasonAvailable, seasonNumber, view, setView, division, setDivision, showAllowance, setShowAllowance, payload }: {
  title: string
  rows: KwtNetPublicResult[]
  allRows: KwtNetPublicResult[]
  season: boolean
  seasonAvailable: boolean
  seasonNumber: string | number
  view: View
  setView: (view: View) => void
  division: DivisionFilter
  setDivision: (division: DivisionFilter) => void
  showAllowance: boolean
  setShowAllowance: (show: boolean) => void
  payload: KwtNetPublicPayload | null
}) {
  return <section className={styles.board} aria-labelledby={title.toLowerCase().replaceAll(" ", "-")}>
    <div className={styles.boardHeading}>
      <div><p className={styles.sectionKicker}>{season ? `KWT SEASON ${seasonNumber}` : "LIVE NET RESULTS"}</p><h2 id={title.toLowerCase().replaceAll(" ", "-")}>{title}{!season && <span className={styles.scoreFormula}>Your Gross Score + Playing Handicap = NET Score</span>}</h2></div>
      <nav className={styles.periodNav} aria-label="Leaderboard period">
        <button className={view === "WEEKLY" ? styles.activeTab : ""} onClick={() => setView("WEEKLY")}>CURRENT WEEK</button>
        <Link href="/kwt/history">PAST WEEKS</Link>
        <button className={view === "SEASON" ? styles.activeTab : ""} onClick={() => setView("SEASON")}>SEASON NET</button>
      </nav>
    </div>
    <div className={styles.boardControls}>
      <div className={styles.filters} aria-label="Division filter">
        {KWT_NET_DIVISION_FILTERS.map((item) => <button key={item} className={division === item ? styles.activeFilter : ""} onClick={() => setDivision(item)}>{item === "ALL" ? "ALL PLAYERS" : item}</button>)}
      </div>
      <button className={styles.handicapToggle} type="button" onClick={() => setShowAllowance(!showAllowance)} aria-expanded={showAllowance} aria-controls="find-strokes-panel">FIND MY KWT STROKES</button>
    </div>
    {showAllowance && <section className={styles.allowancePanel} id="find-strokes-panel" aria-labelledby="find-strokes-title">
      <div><p className={styles.sectionKicker}>PLAYING HANDICAP</p><h2 id="find-strokes-title">YOUR KWT STROKES</h2><p>Easy and Hard allowances are shown before you play.</p></div>
      {!payload ? <p>Checking your allowance…</p> : payload.viewerAllowance ? <div className={styles.myStrokes}><span>EASY: {payload.viewerAllowance.easy.display}</span><span>HARD: {payload.viewerAllowance.hard.display}</span></div> : payload.event ? <p>Sign in with a published Handicap to see your Easy and Hard allowances.</p> : <p>Your weekend strokes will be available soon.</p>}
    </section>}
    {season && !seasonAvailable ? <p className={styles.emptyBoard}>Season standings will appear after verified weekly results are available.</p> : <BoardRows rows={rows} allRows={allRows} divisionFilter={division} season={season} loading={!payload} />}
  </section>
}

function BoardRows({ rows, allRows, divisionFilter, season = false, loading = false }: { rows: KwtNetPublicResult[]; allRows: KwtNetPublicResult[]; divisionFilter: DivisionFilter; season?: boolean; loading?: boolean }) {
  const ranks = buildKwtDisplayRanks(allRows)
  const overallRank = (row: KwtNetPublicResult) => season && "seasonRank" in row ? row.seasonRank : ranks.overall.get(row.playerId) ?? null
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <thead><tr>{divisionFilter === "ALL" ? <th>RANK</th> : <><th>DIVISION RANK</th><th>OVERALL RANK</th></>}<th>PLAYER</th><th>HANDICAP</th><th>EASY NET</th><th>HARD NET</th><th>TOTAL NET</th><th>POINTS</th><th>BADGES</th></tr></thead>
      <tbody>{rows.length ? rows.map((row) => {
        const rank = ranks.byDivision.get(row.division ?? "PROVISIONAL")?.get(row.playerId) ?? null
        const overall = overallRank(row)
        const points = season && "seasonPoints" in row ? row.seasonPoints : row.points
        const divisionClass = divisionClasses[row.division ?? "PROVISIONAL"] ?? styles.provisional
        const medal = row.combinedNet !== null ? divisionMedalEmoji(rank) : ""
        const division = row.division ?? "PROVISIONAL"
        const badgeClass = divisionBadgeClasses[division] ?? styles.provisionalBadge
        const placement = rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : ""
        const handicapDisplay = Number.isFinite(row.handicapIndex) ? formatGolfHandicapIndex(row.handicapIndex) : "UNRATED"
        const otherBadges = row.badges ?? []
        return <tr key={row.playerId}>
          {divisionFilter === "ALL" ? <td className={styles.rank}>{overall ?? "—"}</td> : <><td className={styles.rank}>{rank ?? "—"}</td><td className={styles.rank}>{overall ?? "—"}</td></>}
          <td><span className={`${styles.player} ${divisionClass}`}>{row.screenName}</span></td>
          <td className={rankingStyles.handicapCell}><span>{handicapDisplay}</span>{Number.isFinite(row.handicapIndex) && <small className={row.handicapStatus === "PROVISIONAL" ? styles.provisional : rankingStyles.official}>{row.handicapStatus}</small>}</td>
          <td>{row.easyNet ?? "—"}</td><td>{row.hardNet ?? "—"}</td><td><strong>{row.combinedNet ?? "—"}</strong></td><td>{points ?? "—"}</td>
          <td className={rankingStyles.badgeCell}><span className={rankingStyles.badgeContent}>{medal && <span className={`${rankingStyles.divisionMedal} ${badgeClass}`} role="img" aria-label={`${division} division ${placement} place medal`}>{medal}</span>}{otherBadges.map((badge) => badge === "KIWI_HARD" ? <span className={rankingStyles.specialBadge} role="img" aria-label="Bogey-free Hard round" key={badge}><Image className={rankingStyles.goldKiwi} src="/kwt/gold-kiwi-sticker.png" alt="" width={128} height={128} /></span> : badge === "KIWI_EASY" ? <span className={rankingStyles.specialBadge} role="img" aria-label="Bogey-free Easy round" key={badge}><Image className={rankingStyles.goldKiwi} src="/kwt/green-kiwi-sticker.png" alt="" width={128} height={128} /></span> : <span className={rankingStyles.specialBadge} role="img" aria-label="Bogey-free Easy and Hard round" key={badge}><Image className={rankingStyles.goldKiwi} src="/kwt/coconut-sticker.png" alt="" width={128} height={128} /></span>)}{!medal && !otherBadges.length ? "—" : null}</span></td>
        </tr>
      }) : <tr><td colSpan={divisionFilter === "ALL" ? 8 : 9} className={styles.emptyCell}>{loading ? "Loading this week's results…" : "Waiting for this week's results."}</td></tr>}</tbody>
    </table>
  </div>
}

function DivisionKey() {
  const divisions: Array<[string, string]> = [
    ["ELITE", styles.elite],
    ["PRO", styles.pro],
    ["SEMI-PRO", styles.semiPro],
    ["AMATEUR", styles.amateur],
    ["PROVISIONAL", styles.provisional],
  ]

  return <section className={styles.divisionKey} aria-label="Division color key">
    <div className={styles.divisionKeyItems}>
      {divisions.map(([label, className]) => <span key={label} className={`${styles.divisionKeyItem} ${className}`}>{label}</span>)}
    </div>
  </section>
}

function BadgeKey() {
  return <section className={styles.badgeKey} aria-labelledby="bogey-free-badge-key">
    <DivisionKey />
    <h2 id="bogey-free-badge-key">BOGEY-FREE BADGE KEY</h2>
    <div className={styles.badgeKeyGrid}>
      <div className={styles.badgeKeyItem}>
        <Image className={styles.badgeKeyImage} src="/kwt/green-kiwi-sticker.png" alt="Bogey-free Easy — All 18 holes" width={128} height={128} />
        <p>Bogey-free Easy — All 18 holes.</p>
      </div>
      <div className={styles.badgeKeyItem}>
        <Image className={styles.badgeKeyImage} src="/kwt/gold-kiwi-sticker.png" alt="Bogey-free Hard — All 18 holes" width={128} height={128} />
        <p>Bogey-free Hard — All 18 holes.</p>
      </div>
      <div className={styles.badgeKeyItem}>
        <Image className={styles.badgeKeyImage} src="/kwt/coconut-sticker.png" alt="Bogey-free Easy + Hard — Both 18-hole rounds" width={128} height={128} />
        <p>Bogey-free Easy + Hard — Both 18-hole rounds.</p>
      </div>
    </div>
  </section>
}
