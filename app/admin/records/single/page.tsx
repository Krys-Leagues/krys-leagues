"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import { denseRanks } from "@/lib/all-time/dense-rank"

type SingleRecord = {
  id: string
  course_id: string
  course_code: string
  player_name: string
  historical_player_name: string
  identity_linked: boolean
  score: number
}

type AllTimeCourse = {
  id: string
  code: string
  display_name: string
  difficulty: "Easy" | "Hard"
}

type BestRecordRow = {
  id: string
  course_id: string
  score: number
  historical_player_name: string
  player: { screen_name: string } | Array<{ screen_name: string }> | null
}

type UnresolvedObservationRow = {
  id: string
  course_id: string
  score: number
  historical_player_name: string
}

export function individualCourseLabel(course: AllTimeCourse) {
  const name = course.display_name.toLowerCase().endsWith(course.difficulty.toLowerCase())
    ? course.display_name
    : `${course.display_name} ${course.difficulty}`
  return `${name} (${course.code})`
}

export default function SingleRecordsPage() {
  const router = useRouter()

  const [records, setRecords] = useState<SingleRecord[]>([])
  const [courses, setCourses] = useState<AllTimeCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [courseFilter, setCourseFilter] = useState("")

  useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(() => void (async () => {
      try {
        const response = await fetch("/api/admin/records/all-time?view=single-catalog", { credentials: "same-origin", cache: "no-store" })
        const payload = await response.json() as { error?: string; courses?: AllTimeCourse[] }
        if (!response.ok) throw new Error(payload.error || "All-Time courses could not be loaded.")
        if (cancelled) return
        const catalog = (payload.courses ?? []) as AllTimeCourse[]
        setCourses(catalog); setCourseFilter((current) => current || catalog[0]?.id || "")
        if (!catalog.length) setLoading(false)
      } catch (caught) {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : "All-Time courses could not be loaded."); setCourses([]); setRecords([]); setLoading(false)
      }
    })(), 0)
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [])

  useEffect(() => {
    const selected = courses.find((course) => course.id === courseFilter)
    if (!selected) return
    let cancelled = false
    const timeout = window.setTimeout(() => void (async () => {
      setLoading(true); setError(""); setRecords([])
      try {
        const response = await fetch(`/api/admin/records/all-time?view=single-records&courseId=${encodeURIComponent(selected.id)}`, { credentials: "same-origin", cache: "no-store" })
        const payload = await response.json() as { error?: string; records?: BestRecordRow[]; unresolved?: UnresolvedObservationRow[] }
        if (!response.ok) throw new Error(payload.error || "All-Time records could not be loaded.")
        if (cancelled) return
        const linked = ((payload.records ?? []) as BestRecordRow[]).map((row) => {
          const player = Array.isArray(row.player) ? row.player[0] : row.player
          return { id: row.id, course_id: selected.id, course_code: selected.code, player_name: player?.screen_name ?? row.historical_player_name, historical_player_name: row.historical_player_name, identity_linked: Boolean(player), score: row.score }
        })
        const unresolvedBest = new Map<string, SingleRecord>()
        for (const row of (payload.unresolved ?? []) as UnresolvedObservationRow[]) {
          const existing = unresolvedBest.get(row.historical_player_name)
          if (!existing || row.score < existing.score) unresolvedBest.set(row.historical_player_name, { id: row.id, course_id: selected.id, course_code: selected.code, player_name: row.historical_player_name, historical_player_name: row.historical_player_name, identity_linked: false, score: row.score })
        }
        setRecords([...linked, ...unresolvedBest.values()])
      } catch (caught) {
        if (!cancelled) { setError(caught instanceof Error ? caught.message : "All-Time records could not be loaded."); setRecords([]) }
      } finally { if (!cancelled) setLoading(false) }
    })(), 0)
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [courseFilter, courses])

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => record.course_id === courseFilter)
      .sort((left, right) => left.score - right.score || left.player_name.localeCompare(right.player_name))
  }, [records, courseFilter])

  const selectedCourse = courses.find((course) => course.id === courseFilter) ?? null
  const ranks = denseRanks(filteredRecords)

  return <AdminRecordsShell>
    <nav className={styles.nav}>
      <button onClick={() => router.push("/admin/records")} className={styles.button}>← Records hub</button>
      <button onClick={() => router.push("/admin/records/combined")} className={styles.button}>Combined Records</button>
    </nav>
    <AdminRecordsHero title="Single Course Records" description="Every Easy and Hard course has its own All-Time leaderboard. Lower scores lead; equal scores share the same dense rank." />
    <AdminGlassCard>
      <div className={styles.toolbar}>
        <div><h2 className={styles.sectionHeading}>Leaderboard</h2><p className={styles.sectionKicker}>Choose one individual course to view its current best records.</p></div>
        <label className={styles.field}>Course
          <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className={styles.select}>
            {courses.map((course) => <option key={course.id} value={course.id}>{individualCourseLabel(course)}</option>)}
          </select>
        </label>
      </div>

      {selectedCourse && <div key={selectedCourse.id} className={styles.recordList}>
        <div className={styles.courseHeader}>
          <div><h3 className={styles.sectionHeading}>{selectedCourse.display_name}</h3><p className={`${styles.sectionKicker} ${selectedCourse.difficulty === "Easy" ? styles.difficultyEasy : styles.difficultyHard}`}>{selectedCourse.difficulty} course · {filteredRecords.length} records</p></div>
          <span className={styles.courseCode}>{selectedCourse.code}</span>
        </div>
        {filteredRecords.map((record, index) => <div key={record.id} className={styles.recordRow}>
          <div className={styles.rank}>{ranks[index] === null ? "—" : `#${ranks[index]}`}</div>
          <div><div className={styles.player}>{record.player_name}</div><div className={styles.meta}>{record.identity_linked ? `Historical source: ${record.historical_player_name}` : "Unresolved historical identity"}</div></div>
          <div className={`${styles.score} ${selectedCourse.difficulty === "Easy" ? styles.difficultyEasy : styles.difficultyHard}`}>{record.score}</div>
        </div>)}
        {!filteredRecords.length && !loading && <div className={styles.empty}>No {selectedCourse.difficulty} records found for this course.</div>}
      </div>}
      {loading && <div className={styles.empty}>Loading course records…</div>}
      {error && <div role="alert" className={styles.empty}>{error}</div>}
    </AdminGlassCard>
  </AdminRecordsShell>
}
