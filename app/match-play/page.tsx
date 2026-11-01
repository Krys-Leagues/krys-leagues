"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { historicalCourseLabel, publicMatchDivisions, type PublicHistoricalMatchCourse, type PublicMatchPayload } from "@/lib/publicMatch"
import styles from "./match-play.module.css"

export default function MatchPlayPage() {
  const [data, setData] = useState<PublicMatchPayload | null>(null)
  const [historicalSeason, setHistoricalSeason] = useState<number | null>(null)
  const [currentDivision, setCurrentDivision] = useState<number | null>(null)
  const [historicalDivision, setHistoricalDivision] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void supabase.rpc("get_public_match_play").then(({ data: payload, error: loadError }) => {
      if (cancelled) return
      if (loadError) setError("Match Play history is temporarily unavailable.")
      else {
        const loaded = payload as PublicMatchPayload
        setData(loaded)
        setHistoricalSeason(loaded.historical_seasons[0]?.season_number ?? null)
        setCurrentDivision(publicMatchDivisions(loaded.current.standings)[0] ?? null)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const selectedHistory = data?.historical_seasons.find((season) => season.season_number === historicalSeason) ?? null
  const historicalRows = useMemo(() => data?.historical_standings.filter((row) => row.season_number === historicalSeason) ?? [], [data, historicalSeason])
  const historyDivisions = useMemo(() => publicMatchDivisions(historicalRows), [historicalRows])
  const shownHistoryDivision = historyDivisions.includes(historicalDivision ?? -1) ? historicalDivision : historyDivisions[0] ?? null
  const currentDivisions = publicMatchDivisions(data?.current.standings ?? [])
  const shownCurrentDivision = currentDivisions.includes(currentDivision ?? -1) ? currentDivision : currentDivisions[0] ?? null

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.topNav}><Link href="/league-play">← League Play</Link><div><Link href="/matches">Matches &amp; Results</Link><Link href="/match-standings">Classic standings</Link></div></nav>
      <header className={styles.hero}>
        <Image src="/league-media/BIG LOGO TRANSPARENT.png" alt="Krys Leagues logo" width={190} height={190} priority className={styles.logo} />
        <div><p className={styles.eyebrow}>KRYS LEAGUES</p><h1>MATCH PLAY</h1><p>Head-to-head mini golf. Current competition and frozen league history, together in one place.</p></div>
      </header>

      {loading && <div className={styles.message}>Loading Match Play…</div>}
      {error && <div className={styles.message}>{error}</div>}
      {!loading && !error && <>
        <section className={styles.section} aria-labelledby="current-title">
          <div className={styles.sectionHead}><div><p className={styles.kicker}>LIVE LEAGUE</p><h2 id="current-title">Current Season</h2><p>{data?.current.season_number ? `Season ${data.current.season_number} · Authoritative managed Match standings` : "No current Match season available"}</p></div><span className={styles.currentBadge}>CURRENT</span></div>
          {data?.current.standings.length ? <><DivisionTabs divisions={currentDivisions} selected={shownCurrentDivision} onSelect={setCurrentDivision} /><StandingsTable rows={data.current.standings.filter((row) => row.division_number === shownCurrentDivision).map((row) => ({ ...row, name: row.player_screen_name }))} /></> : <div className={styles.empty}>No current Match standings are available yet.</div>}
        </section>

        <section className={`${styles.section} ${styles.history}`} aria-labelledby="history-title">
          <div className={styles.sectionHead}><div><p className={styles.kicker}>LEAGUE ARCHIVE</p><h2 id="history-title">Historical Seasons</h2><p>Original final ranks and player names, preserved exactly as recorded.</p></div>{data?.historical_seasons.length ? <label className={styles.seasonSelect}>Season<select value={historicalSeason ?? ""} onChange={(event) => { setHistoricalSeason(Number(event.target.value)); setHistoricalDivision(null) }}>{data.historical_seasons.map((season) => <option value={season.season_number} key={season.season_number}>Season {season.season_number}</option>)}</select></label> : null}</div>
          {!data?.historical_seasons.length ? <div className={styles.empty}>No historical Match seasons have been published yet.</div> : selectedHistory && <>
            <div className={styles.historyMeta}><strong>Season {selectedHistory.season_number}</strong><span>{selectedHistory.historical_label}</span>{selectedHistory.historical_year !== null && <span>{selectedHistory.historical_year}</span>}<span>{selectedHistory.evidence_level === "aggregate_course" ? "Standings + course history" : "Final standings"}</span></div>
            <DivisionTabs divisions={historyDivisions} selected={shownHistoryDivision} onSelect={setHistoricalDivision} />
            <StandingsTable historical rows={historicalRows.filter((row) => row.division_number === shownHistoryDivision).map((row) => ({ rank: row.source_final_rank, name: row.historical_display_name, ...row }))} courses={data.historical_courses.filter((course) => course.season_number === historicalSeason && course.division_number === shownHistoryDivision)} />
            {selectedHistory.evidence_level === "standings_only" && <p className={styles.note}>This season is preserved from final standings. No course-level history was recorded.</p>}
          </>}
        </section>
      </>}
    </div>
  </main>
}

function DivisionTabs({ divisions, selected, onSelect }: { divisions: number[]; selected: number | null; onSelect: (division: number) => void }) {
  return <div className={styles.tabs} aria-label="Match divisions">{divisions.map((division) => <button type="button" key={division} className={selected === division ? styles.activeTab : ""} onClick={() => onSelect(division)}>Division {division}</button>)}</div>
}

type DisplayRow = { rank: number; name: string; played: number; wins: number; losses: number; draws: number; points: number; holes_won: number; source_final_rank?: number }
function StandingsTable({ rows, historical = false, courses = [] }: { rows: DisplayRow[]; historical?: boolean; courses?: PublicHistoricalMatchCourse[] }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Rank</th><th>Player</th><th>P</th><th>W</th><th>L</th><th>D</th><th>PTS</th><th>HW</th>{historical && courses.length > 0 && <th>Course history</th>}</tr></thead><tbody>{rows.map((row) => {
    const playerCourses = courses.filter((course) => course.source_final_rank === row.rank)
    return <tr key={`${row.rank}:${row.name}`}><td className={styles.rank}>{row.rank}</td><td className={styles.player}>{row.name}</td><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.draws}</td><td className={styles.points}>{row.points}</td><td>{row.holes_won}</td>{historical && courses.length > 0 && <td><details className={styles.courseDetails}><summary>{playerCourses.some((course) => course.played) ? "View courses" : "Courses unplayed"}</summary><div>{playerCourses.map((course) => <p key={course.course_order}><span>{course.historical_course_name}</span><strong className={course.played ? styles.played : styles.unplayed}>{historicalCourseLabel(course)}</strong></p>)}</div></details></td>}</tr>
  })}</tbody></table></div>
}
