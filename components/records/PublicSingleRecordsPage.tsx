"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { PublicRecordsHero, PublicRecordsShell, publicRecordsStyles as styles } from "@/components/records/PublicRecordsUI"
import { filterCanonicalCourses, formatCanonicalCourse, normalizeCanonicalCourseDisplayName } from "@/lib/all-time/player-picker"
import { canonicalPlayerName, type PublicCourse, type PublicSingleRecord } from "@/lib/all-time/public-records"

type RankedSingleRecord = PublicSingleRecord & { rank: number | null }
type CourseBoard = { course: PublicCourse; records: RankedSingleRecord[] }
type Difficulty = PublicCourse["difficulty"]

export default function PublicSingleRecordsPage() {
  const [courses, setCourses] = useState<PublicCourse[]>([])
  const [boards, setBoards] = useState<Record<string, CourseBoard>>({})
  const [selectedEasyId, setSelectedEasyId] = useState("")
  const [selectedHardId, setSelectedHardId] = useState("")
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingCourseIds, setLoadingCourseIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch("/api/records/public?view=courses")
        const payload = await response.json() as { courses?: PublicCourse[]; error?: string }
        if (!response.ok) throw new Error(payload.error)
        if (!cancelled) setCourses(payload.courses ?? [])
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Course records could not be loaded.")
      } finally {
        if (!cancelled) setLoadingCatalog(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const selectedIds = [...new Set([selectedEasyId, selectedHardId].filter(Boolean))]
    const idsToLoad = selectedIds.filter((courseId) => !boards[courseId])
    if (idsToLoad.length === 0) return

    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) setLoadingCourseIds((current) => new Set([...current, ...idsToLoad]))
    })
    void Promise.all(idsToLoad.map(async (courseId) => {
      const response = await fetch(`/api/records/public?view=single&courseId=${encodeURIComponent(courseId)}`)
      const payload = await response.json() as { records?: RankedSingleRecord[]; error?: string }
      if (!response.ok) throw new Error(payload.error)
      return { courseId, records: payload.records ?? [] }
    })).then((loaded) => {
      if (cancelled) return
      setBoards((current) => loaded.reduce<Record<string, CourseBoard>>((next, { courseId, records }) => {
        const course = courses.find((candidate) => candidate.id === courseId)
        if (course) next[courseId] = { course, records }
        return next
      }, { ...current }))
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "Course records could not be loaded.")
    }).finally(() => {
      if (!cancelled) setLoadingCourseIds((current) => {
        const next = new Set(current)
        idsToLoad.forEach((courseId) => next.delete(courseId))
        return next
      })
    })
    return () => { cancelled = true }
  }, [boards, courses, selectedEasyId, selectedHardId])

  const easyCourses = useMemo(() => courses.filter((course) => course.difficulty === "Easy"), [courses])
  const hardCourses = useMemo(() => courses.filter((course) => course.difficulty === "Hard"), [courses])

  return (
    <PublicRecordsShell>
      <nav className={styles.nav}>
        <Link href="/records" className={styles.button}>← Course Records</Link>
        <Link href="/records/combined" className={styles.button}>Combined Records</Link>
      </nav>
      <PublicRecordsHero
        eyebrow="Krys Leagues · All-Time Leaderboards"
        title="Single Course Records"
        description="Search an Easy or Hard course to open its official leaderboard. Lower scores lead, and ties share the same rank."
      />
      {error && <div role="alert" className={styles.empty}>{error}</div>}
      {loadingCatalog && <div className={styles.empty}>Loading course choices…</div>}
      {!loadingCatalog && !error && (
        <div className={styles.difficultyPanels}>
          <CourseSelection
            difficulty="Easy"
            courses={easyCourses}
            selectedId={selectedEasyId}
            board={boards[selectedEasyId]}
            loading={loadingCourseIds.has(selectedEasyId)}
            onSelect={setSelectedEasyId}
          />
          <CourseSelection
            difficulty="Hard"
            courses={hardCourses}
            selectedId={selectedHardId}
            board={boards[selectedHardId]}
            loading={loadingCourseIds.has(selectedHardId)}
            onSelect={setSelectedHardId}
          />
        </div>
      )}
    </PublicRecordsShell>
  )
}

function CourseSelection({ difficulty, courses, selectedId, board, loading, onSelect }: {
  difficulty: Difficulty
  courses: PublicCourse[]
  selectedId: string
  board?: CourseBoard
  loading: boolean
  onSelect: (courseId: string) => void
}) {
  return (
    <section className={`${styles.glass} ${styles.pad} ${styles.difficultyPanel}`} aria-labelledby={`${difficulty.toLowerCase()}-courses-heading`}>
      <h2 id={`${difficulty.toLowerCase()}-courses-heading`} className={styles.difficultyTitle}>{difficulty} Course</h2>
      <CourseSearchSelect difficulty={difficulty} courses={courses} selectedId={selectedId} onSelect={onSelect} />
      {loading && <div className={styles.empty}>Loading {difficulty.toLowerCase()} leaderboard…</div>}
      {!loading && board && <CourseBoardView board={board} />}
      {!loading && !board && <div className={styles.courseSelectionHint}>Select a {difficulty.toLowerCase()} course to open its leaderboard.</div>}
    </section>
  )
}

function CourseSearchSelect({ difficulty, courses, selectedId, onSelect }: {
  difficulty: Difficulty
  courses: PublicCourse[]
  selectedId: string
  onSelect: (courseId: string) => void
}) {
  const selectedCourse = courses.find((course) => course.id === selectedId)
  const [query, setQuery] = useState(selectedCourse ? formatCanonicalCourse(selectedCourse) : "")
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const selectedLabel = selectedCourse ? formatCanonicalCourse(selectedCourse) : ""
  const options = useMemo(() => {
    const trimmed = query.trim()
    return trimmed && trimmed !== selectedLabel ? filterCanonicalCourses(courses, trimmed, 50) : courses.slice(0, 50)
  }, [courses, query, selectedLabel])
  const listboxId = `${difficulty.toLowerCase()}-course-options`

  function choose(course: PublicCourse) {
    onSelect(course.id)
    setQuery(formatCanonicalCourse(course))
    setOpen(false)
    setHighlightedIndex(0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(options.length - 1, 0)))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === "Enter" && open && options[highlightedIndex]) {
      event.preventDefault()
      choose(options[highlightedIndex])
    } else if (event.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className={styles.coursePicker}>
      <label className={styles.coursePickerLabel} htmlFor={`${difficulty.toLowerCase()}-course-search`}>{difficulty} Course</label>
      <input
        id={`${difficulty.toLowerCase()}-course-search`}
        className={styles.courseSearchInput}
        type="search"
        role="combobox"
        value={query}
        placeholder={`Search ${difficulty.toLowerCase()} courses`}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setHighlightedIndex(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div id={listboxId} className={styles.courseSearchOptions} role="listbox" aria-label={`${difficulty} course choices`}>
          {options.length > 0 ? options.map((course, index) => (
            <button
              key={course.id}
              type="button"
              role="option"
              aria-selected={course.id === selectedId}
              data-highlighted={index === highlightedIndex}
              className={styles.courseSearchOption}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(course)}
            >
              {formatCanonicalCourse(course)}
            </button>
          )) : <div className={styles.courseSearchEmpty}>No matching {difficulty.toLowerCase()} courses.</div>}
        </div>
      )}
    </div>
  )
}

function CourseBoardView({ board }: { board: CourseBoard }) {
  const { course, records } = board
  return (
    <section className={styles.courseBoard} aria-labelledby={`course-${course.id}`}>
      <header className={styles.courseBoardHeader}>
        <h3 id={`course-${course.id}`} className={styles.courseTitle}>{normalizeCanonicalCourseDisplayName(course.display_name)}</h3>
        <span className={styles.badge}>{records.length} records</span>
      </header>
      <div className={styles.courseRecordList}>
        {records.map((record) => (
          <div className={styles.courseRecordRow} key={record.id}>
            <span className={styles.courseRank}>#{record.rank}</span>
            <Link className={styles.coursePlayer} href={`/players/${record.player_id}`}>
              {canonicalPlayerName(record)}
            </Link>
            <span className={`${styles.courseScore} ${course.difficulty === "Easy" ? styles.easy : styles.hard}`}>
              {record.score}
            </span>
          </div>
        ))}
        {records.length === 0 && <div className={styles.empty}>No records are available for this course yet.</div>}
      </div>
    </section>
  )
}
