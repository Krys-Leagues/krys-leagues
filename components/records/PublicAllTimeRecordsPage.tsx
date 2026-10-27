"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { canonicalPlayerName, type PublicCombinedRecord, type PublicCourse, type PublicSingleRecord } from "@/lib/all-time/public-records"
import { PublicRecordsHero, PublicRecordsShell, publicRecordsStyles as styles } from "@/components/records/PublicRecordsUI"
import TourThisArea from "@/components/tour/TourThisArea"

type BoardType = "stroke" | "race" | "combined"
type RankedSingle = PublicSingleRecord & { rank: number | null }
type RankedCombined = PublicCombinedRecord & { rank: number | null }
type RaceBoardRecord = { id: string; player_id: string; historical_player_name: string; time_centiseconds: number; time_display: string; player: { screen_name: string } | Array<{ screen_name: string }> | null; rank: number }
type RaceBoardPayload = { benchmark: { time_display: string } | null; records: RaceBoardRecord[] }

const BOARD_OPTIONS: Array<{ id: BoardType; label: string }> = [
  { id: "stroke", label: "STROKE PLAY" },
  { id: "race", label: "RACE MODE" },
  { id: "combined", label: "COMBINED" },
]

function initialRecordsDifficulty(): "Easy" | "Hard" | "Both" {
  if (typeof window === "undefined") return "Easy"
  const value = new URLSearchParams(window.location.search).get("difficulty")?.toLowerCase()
  return value === "hard" ? "Hard" : value === "both" ? "Both" : "Easy"
}

function initialRecordBoards(): BoardType[] {
  if (typeof window === "undefined") return ["stroke"]
  const values = new URLSearchParams(window.location.search).get("boards")?.split(",").filter((value): value is BoardType => BOARD_OPTIONS.some((option) => option.id === value))
  return values?.length ? [...new Set(values)] : ["stroke"]
}

export default function PublicAllTimeRecordsPage() {
  const [courses, setCourses] = useState<PublicCourse[]>([])
  const [baseMap, setBaseMap] = useState("")
  const [difficulty, setDifficulty] = useState<"Easy" | "Hard" | "Both">(initialRecordsDifficulty)
  const [selectedBoards, setSelectedBoards] = useState<BoardType[]>(initialRecordBoards)
  const [singleBoards, setSingleBoards] = useState<Record<string, RankedSingle[]>>({})
  const [combinedBoard, setCombinedBoard] = useState<RankedCombined[]>([])
  const [raceBoards, setRaceBoards] = useState<Record<string, RaceBoardPayload>>({})
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingBoards, setLoadingBoards] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch("/api/records/public?view=courses")
        const payload = await response.json() as { courses?: PublicCourse[]; error?: string }
        if (!response.ok) throw new Error(payload.error || "Course catalog could not be loaded.")
        if (!cancelled) {
          const loaded = payload.courses ?? []
          setCourses(loaded)
          const maps = [...new Set(loaded.map((course) => course.base_map))]
          setBaseMap((current) => current || maps[0] || "")
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Course catalog could not be loaded.")
      } finally {
        if (!cancelled) setLoadingCatalog(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const maps = useMemo(() => [...new Set(courses.map((course) => course.base_map))], [courses])
  const selectedCourses = useMemo(() => courses.filter((course) => course.base_map === baseMap && (difficulty === "Both" || course.difficulty === difficulty)), [baseMap, courses, difficulty])

  useEffect(() => {
    if (!baseMap || !selectedBoards.length) return
    let cancelled = false
    const load = async () => {
      setLoadingBoards(true)
      setError("")
      try {
        const singleCourseIds = selectedBoards.includes("stroke") ? selectedCourses.map((course) => course.id) : []
        const requests: Array<Promise<{ courseId: string; records: RankedSingle[] } | { kind: "combined"; records: RankedCombined[] } | { kind: "race"; courseId: string; payload: RaceBoardPayload }>> = [
          ...singleCourseIds.map(async (courseId) => {
            const response = await fetch(`/api/records/public?view=single&courseId=${encodeURIComponent(courseId)}`)
            const payload = await response.json() as { records?: RankedSingle[]; error?: string }
            if (!response.ok) throw new Error(payload.error || "Stroke Play records could not be loaded.")
            return { courseId, records: payload.records ?? [] }
          }),
          ...(selectedBoards.includes("combined") ? [fetch(`/api/records/public?view=combined&baseMap=${encodeURIComponent(baseMap)}`).then(async (response) => {
            const payload = await response.json() as { records?: RankedCombined[]; error?: string }
            if (!response.ok) throw new Error(payload.error || "Combined records could not be loaded.")
            return { kind: "combined" as const, records: payload.records ?? [] }
          })] : []),
          ...(selectedBoards.includes("race") ? selectedCourses.map(async (course) => {
            const response = await fetch(`/api/records/public?view=race&courseId=${encodeURIComponent(course.id)}`)
            const payload = await response.json() as RaceBoardPayload & { error?: string }
            if (!response.ok) throw new Error(payload.error || "Race Mode records could not be loaded.")
            return { kind: "race" as const, courseId: course.id, payload: { benchmark: payload.benchmark ?? null, records: payload.records ?? [] } }
          }) : []),
        ]
        const results = await Promise.all(requests)
        if (cancelled) return
        const nextStrokeBoards: Record<string, RankedSingle[]> = {}
        let nextCombined: RankedCombined[] = []
        const nextRaceBoards: Record<string, RaceBoardPayload> = {}
        for (const resolved of results) {
          if ("kind" in resolved && resolved.kind === "race") nextRaceBoards[resolved.courseId] = resolved.payload
          else if ("courseId" in resolved) nextStrokeBoards[resolved.courseId] = resolved.records
          else nextCombined = resolved.records
        }
        setSingleBoards(nextStrokeBoards)
        setCombinedBoard(nextCombined)
        setRaceBoards(nextRaceBoards)
      } catch (caught) {
        if (!cancelled) { setError(caught instanceof Error ? caught.message : "Selected records could not be loaded."); setSingleBoards({}); setCombinedBoard([]); setRaceBoards({}) }
      } finally {
        if (!cancelled) setLoadingBoards(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [baseMap, difficulty, selectedBoards, selectedCourses])

  function toggleBoard(board: BoardType) {
    setSelectedBoards((current) => current.includes(board) ? (current.length === 1 ? current : current.filter((value) => value !== board)) : [...current, board])
  }

  return <PublicRecordsShell dataTour="leaderboards-page">
    <nav className={styles.nav}><Link href="/" className={styles.button}>← Krys Leagues</Link><Link href="/leaderboards/climbers" className={styles.button}>CLIMBERS</Link><Link href="/records/submit" className={`${styles.button} ${styles.primaryButton}`}>SUBMIT ALL-TIME SCORE</Link><TourThisArea tourId="leaderboards" /></nav>
    <PublicRecordsHero eyebrow="Krys Leagues · All-Time Records" title="KRYS LEAGUES ALL-TIME LEADERBOARDS" description="Choose one base map, the course difficulty, and any boards you want to compare. Pending player submissions appear provisionally until an admin verifies the evidence." />
    <section className={`${styles.glass} ${styles.pad} ${styles.recordsControls}`} aria-label="All-Time leaderboard controls">
      <label className={styles.selectWrap} data-tour="leaderboard-course">BASE MAP<select className={styles.select} value={baseMap} onChange={(event) => setBaseMap(event.target.value)}>{maps.map((map) => <option key={map} value={map}>{map}</option>)}</select></label>
      <fieldset className={styles.controlGroup} data-tour="leaderboard-difficulty"><legend>DIFFICULTY</legend>{(["Easy", "Hard", "Both"] as const).map((value) => <label key={value} className={styles.choice}><input type="radio" data-tour={value === "Easy" ? "leaderboard-difficulty-easy" : undefined} name="difficulty" checked={difficulty === value} onChange={() => setDifficulty(value)} />{value.toUpperCase()}</label>)}</fieldset>
      <fieldset className={styles.controlGroup} data-tour="leaderboard-types"><legend>LEADERBOARD TYPES</legend><div className={styles.choiceGrid}>{BOARD_OPTIONS.map((option) => <label key={option.id} className={styles.choice}><input type="checkbox" data-tour={option.id === "combined" ? "leaderboard-type-combined" : undefined} checked={selectedBoards.includes(option.id)} onChange={() => toggleBoard(option.id)} />{option.label}</label>)}</div></fieldset>
    </section>
    {error && <div role="alert" className={styles.empty}>{error}</div>}
    {loadingCatalog && <div className={styles.empty}>Loading map choices…</div>}
    {!loadingCatalog && !error && <section className={styles.boardGrid} aria-live="polite">
      {selectedBoards.includes("stroke") && selectedCourses.map((course) => <StrokeBoard key={course.id} course={course} records={singleBoards[course.id] || []} loading={loadingBoards} />)}
      {selectedBoards.includes("combined") && <CombinedBoard baseMap={baseMap} records={combinedBoard} loading={loadingBoards} />}
      {selectedBoards.includes("race") && selectedCourses.map((course) => <RaceBoard key={`race-${course.id}`} course={course} payload={raceBoards[course.id]} loading={loadingBoards} />)}
    </section>}
  </PublicRecordsShell>
}

function StrokeBoard({ course, records, loading }: { course: PublicCourse; records: RankedSingle[]; loading: boolean }) {
  return <BoardCard title={`STROKE PLAY · ${course.difficulty.toUpperCase()}`} subtitle={course.base_map}>
    {loading ? <div className={styles.empty}>Loading leaderboard…</div> : records.length ? <div className={styles.list}>{records.map((record, index) => <RecordRow key={`${record.status || "verified"}-${record.id}`} record={record} first={index === 0} />)}</div> : <div className={styles.empty}>No records are available for this course yet.</div>}
  </BoardCard>
}

function CombinedBoard({ baseMap, records, loading }: { baseMap: string; records: RankedCombined[]; loading: boolean }) {
  return <BoardCard title="COMBINED" subtitle={`${baseMap} · official KWT + Pro source`}>
    {loading ? <div className={styles.empty}>Loading combined leaderboard…</div> : records.length ? <div className={styles.list}>{records.map((record) => <div className={styles.row} key={record.id}><div className={styles.rank}>#{record.rank}</div><div><Link className={styles.player} href={`/players/${record.player_id}`}>{canonicalPlayerName(record)}</Link><div className={styles.components}><span className={styles.combinedEasy}>Easy {record.easy_score}</span><span className={styles.combinedHard}>Hard {record.hard_score}</span></div></div><div className={`${styles.score} ${styles.total}`}>{record.combined_score}</div></div>)}</div> : <div className={styles.empty}>No official combined records are available for this map yet.</div>}
  </BoardCard>
}

function RaceBoard({ course, payload, loading }: { course: PublicCourse; payload?: RaceBoardPayload; loading: boolean }) {
  return <BoardCard title={`RACE MODE · ${course.difficulty.toUpperCase()}`} subtitle={course.base_map}>
    {loading && !payload ? <div className={styles.empty}>Loading Race Mode leaderboard…</div> : payload?.records.length ? <>
      <div className={styles.raceBenchmark}>TIME TO BEAT: <strong>{payload.benchmark?.time_display ?? "Not available"}</strong></div>
      <div className={styles.list}>{payload.records.map((record) => <div className={styles.row} key={record.id}><div className={styles.rank}>#{record.rank}</div><Link className={styles.player} href={`/players/${record.player_id}`}>{canonicalPlayerName(record)}</Link><div className={styles.score}>{record.time_display}</div></div>)}</div>
    </> : <div className={styles.empty}>No Race Mode records are available for this course yet.</div>}
  </BoardCard>
}

function RecordRow({ record, first = false }: { record: RankedSingle; first?: boolean }) {
  const pending = record.status === "pending"
  return <div className={`${styles.row} ${pending ? styles.pendingRow : ""}`}><div className={styles.rank}>#{record.rank}</div><div><Link className={styles.player} data-tour={first ? "leaderboard-player-link" : undefined} href={`/players/${record.player_id}`}>{canonicalPlayerName(record)}</Link>{pending && <span className={styles.pendingBadge}>PENDING · PROVISIONAL</span>}</div><div className={`${styles.score} ${pending ? styles.pendingScore : ""}`}>{record.score}</div></div>
}

function BoardCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <article className={`${styles.glass} ${styles.pad} ${styles.boardCard}`}><header className={styles.boardHeader}><div><p className={styles.boardEyebrow}>ALL-TIME BOARD</p><h2 className={styles.heading}>{title}</h2><p className={styles.boardSubtitle}>{subtitle}</p></div></header>{children}</article>
}
