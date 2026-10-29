"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { PublicRecordsHero, PublicRecordsShell, publicRecordsStyles as styles } from "@/components/records/PublicRecordsUI"
import { canonicalPlayerName, type PublicCourse, type PublicSingleRecord } from "@/lib/all-time/public-records"

type RankedSingleRecord = PublicSingleRecord & { rank: number | null }
type CourseBoard = { course: PublicCourse; records: RankedSingleRecord[] }

export default function PublicSingleRecordsPage() {
  const [boards, setBoards] = useState<CourseBoard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const catalogResponse = await fetch("/api/records/public?view=courses")
        const catalogPayload = await catalogResponse.json() as { courses?: PublicCourse[]; error?: string }
        if (!catalogResponse.ok) throw new Error(catalogPayload.error)

        const catalog = catalogPayload.courses ?? []
        const loadedBoards = await Promise.all(catalog.map(async (course) => {
          const response = await fetch(`/api/records/public?view=single&courseId=${encodeURIComponent(course.id)}`)
          const payload = await response.json() as { records?: RankedSingleRecord[]; error?: string }
          if (!response.ok) throw new Error(payload.error)
          return { course, records: payload.records ?? [] }
        }))

        if (!cancelled) setBoards(loadedBoards)
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Course records could not be loaded.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const renderDifficulty = (difficulty: PublicCourse["difficulty"]) => (
    <section className={`${styles.glass} ${styles.pad} ${styles.difficultyPanel}`} aria-labelledby={`${difficulty.toLowerCase()}-courses-heading`}>
      <h2 id={`${difficulty.toLowerCase()}-courses-heading`} className={styles.difficultyTitle}>{difficulty} Courses</h2>
      <div className={styles.courseBoards}>
        {boards.filter(({ course }) => course.difficulty === difficulty).map(({ course, records }) => (
          <section className={styles.courseBoard} key={course.id} aria-labelledby={`course-${course.id}`}>
            <header className={styles.courseBoardHeader}>
              <h3 id={`course-${course.id}`} className={styles.courseTitle}>{course.display_name}</h3>
              <span className={styles.badge}>{records.length} records</span>
            </header>
            <div className={styles.courseRecordList}>
              {records.map((record) => (
                <div className={styles.courseRecordRow} key={record.id}>
                  <span className={styles.courseRank}>#{record.rank}</span>
                  <Link className={styles.coursePlayer} href={`/players/${record.player_id}`}>
                    {canonicalPlayerName(record)}
                  </Link>
                  <span className={`${styles.courseScore} ${difficulty === "Easy" ? styles.easy : styles.hard}`}>
                    {record.score}
                  </span>
                </div>
              ))}
              {!loading && records.length === 0 && <div className={styles.empty}>No records are available for this course yet.</div>}
            </div>
          </section>
        ))}
      </div>
    </section>
  )

  return (
    <PublicRecordsShell>
      <nav className={styles.nav}>
        <Link href="/records" className={styles.button}>← Course Records</Link>
        <Link href="/records/combined" className={styles.button}>Combined Records</Link>
      </nav>
      <PublicRecordsHero
        title="Single Course Records"
        description="Easy and Hard are separate official course leaderboards. Lower scores lead, and ties share the same rank."
      />
      {error && <div role="alert" className={styles.empty}>{error}</div>}
      {loading && <div className={styles.empty}>Loading course records…</div>}
      <div className={styles.difficultyPanels}>
        {renderDifficulty("Easy")}
        {renderDifficulty("Hard")}
      </div>
    </PublicRecordsShell>
  )
}
