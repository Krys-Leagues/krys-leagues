"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { formatCanonicalCourse } from "@/lib/all-time/player-picker"
import type { PublicCourse } from "@/lib/all-time/public-records"
import { PublicRecordsHero, PublicRecordsShell, publicRecordsStyles as styles } from "@/components/records/PublicRecordsUI"

type Submission = { id: string; score: number; status: string; submitted_at: string; reviewed_at: string | null; rejection_reason: string | null; course: { base_map: string; display_name: string; difficulty: string } | null }

export default function AllTimeSubmissionPage() {
  const [courses, setCourses] = useState<PublicCourse[]>([])
  const [courseId, setCourseId] = useState("")
  const [holes, setHoles] = useState<string[]>(Array.from({ length: 18 }, () => ""))
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState("")
  const [history, setHistory] = useState<Submission[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void Promise.all([
      fetch("/api/records/public?view=courses").then(async (response) => response.json() as Promise<{ courses?: PublicCourse[] }>),
      fetch("/api/records/submissions", { cache: "no-store" }).then(async (response) => response.json() as Promise<{ submissions?: Submission[] }>),
    ]).then(([catalog, own]) => { setCourses(catalog.courses || []); setHistory(own.submissions || []) }).catch(() => setMessage("Sign in with Discord before submitting an All-Time card."))
  }, [])

  const selectedCourse = useMemo(() => courses.find((course) => course.id === courseId), [courseId, courses])
  const score = selectedCourse && holes.every((hole) => /^\d+$/.test(hole)) && selectedCourse.hole_pars?.length === 18
    ? holes.reduce((total, hole) => total + Number(hole), 0) - selectedCourse.hole_pars.reduce((total, par) => total + par, 0)
    : null

  function setHole(index: number, value: string) {
    setHoles((current) => current.map((hole, holeIndex) => holeIndex === index ? value : hole))
  }

  async function submit() {
    if (!courseId || !selectedCourse || !file || score === null) return setMessage("Choose a course, enter all 18 holes, and attach the scorecard image.")
    setBusy(true); setMessage("")
    const form = new FormData()
    form.set("course_id", courseId); form.set("score", String(score)); form.set("hole_strokes", JSON.stringify(holes.map(Number))); form.set("notes", notes); form.set("file", file)
    try {
      const response = await fetch("/api/records/submissions", { method: "POST", body: form })
      const body = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(body.error || "Submission failed.")
      setMessage(body.message || "ALL-TIME SCORE SUBMITTED — PENDING REVIEW"); setFile(null); setHoles(Array.from({ length: 18 }, () => "")); setNotes("")
      const refreshed = await fetch("/api/records/submissions", { cache: "no-store" }).then(async (item) => item.json() as Promise<{ submissions?: Submission[] }>); setHistory(refreshed.submissions || [])
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Submission failed.") } finally { setBusy(false) }
  }

  return <PublicRecordsShell>
    <nav className={styles.nav}><Link href="/records" className={styles.button}>← All-Time Leaderboards</Link></nav>
    <PublicRecordsHero eyebrow="Krys Leagues · Player Submission" title="SUBMIT ALL-TIME SCORE" description="Submit your actual scorecard for admin review. The canonical Global Player account attached to your Discord sign-in is the only identity used." />
    <section className={`${styles.glass} ${styles.pad} ${styles.submissionPanel}`}>
      <label className={styles.selectWrap}>COURSE<select className={styles.select} value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Choose an Easy or Hard course</option>{courses.map((course) => <option key={course.id} value={course.id}>{formatCanonicalCourse(course)}</option>)}</select></label>
      {selectedCourse && <p className={styles.copy}>Derived score: <strong>{score === null ? "enter all 18 holes" : score > 0 ? `+${score}` : score}</strong> · {selectedCourse.difficulty}</p>}
      <div className={styles.holeGrid}>{holes.map((hole, index) => <label key={index} className={styles.holeInput}>H{index + 1}<input type="number" min="1" value={hole} onChange={(event) => setHole(index, event.target.value)} /></label>)}</div>
      <label className={styles.formField}>SCORECARD EVIDENCE<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      <label className={styles.formField}>NOTES (OPTIONAL)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>
      <button className={styles.submitButton} type="button" disabled={busy} onClick={() => void submit()}>{busy ? "SUBMITTING…" : "SUBMIT FOR REVIEW"}</button>
      {message && <p role="status" className={styles.statusMessage}>{message}</p>}
    </section>
    <section className={`${styles.glass} ${styles.pad} ${styles.submissionPanel}`}><h2 className={styles.heading}>YOUR SUBMISSIONS</h2>{history.length ? <div className={styles.submissionHistory}>{history.map((item) => <div className={styles.submissionHistoryRow} key={item.id}><span>{item.course?.base_map || "Course"} · {item.course?.difficulty || ""}</span><strong>{item.score > 0 ? `+${item.score}` : item.score}</strong><span className={item.status === "pending" ? styles.pendingText : item.status === "verified" ? styles.verifiedText : styles.rejectedText}>{item.status.toUpperCase()}</span><time dateTime={item.submitted_at}>{new Date(item.submitted_at).toLocaleDateString()}</time>{item.rejection_reason && <small>{item.rejection_reason}</small>}</div>)}</div> : <p className={styles.empty}>No All-Time submissions yet.</p>}</section>
  </PublicRecordsShell>
}
