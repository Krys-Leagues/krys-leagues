"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminGlassCard, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import { evaluateSubmission, type BoardScore } from "@/lib/all-time/climbers"
import { loadGlobalPlayerDirectory, type GlobalPlayerDirectoryEntry } from "@/lib/identity/globalPlayerDirectory"
import { supabase } from "@/lib/supabase"

type Course = { id: string; display_name: string; difficulty: "Easy" | "Hard"; active: boolean }
type Best = { player_id: string; course_id: string; score: number }

export default function CurrentRecordPreview() {
  const [players, setPlayers] = useState<GlobalPlayerDirectoryEntry[]>([]), [courses, setCourses] = useState<Course[]>([]), [bests, setBests] = useState<Best[]>([])
  const [members, setMembers] = useState<Set<string>>(new Set()), [playerId, setPlayerId] = useState(""), [courseId, setCourseId] = useState(""), [score, setScore] = useState("")
  const [scorecardAt, setScorecardAt] = useState(""), [submittedAt, setSubmittedAt] = useState(""), [room, setRoom] = useState(""), [witness, setWitness] = useState(""), [completed18, setCompleted18] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { void (async () => { try {
    const [directory, courseResult, bestResult, memberResult] = await Promise.all([loadGlobalPlayerDirectory(), supabase.from("all_time_courses").select("id, display_name, difficulty, active").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"), supabase.from("all_time_best_records").select("player_id, course_id, score"), supabase.from("discord_members").select("discord_id")])
    const problem = courseResult.error || bestResult.error || memberResult.error; if (problem) throw problem
    setPlayers(directory.filter((player) => player.active)); setCourses((courseResult.data ?? []) as Course[]); setBests((bestResult.data ?? []) as Best[]); setMembers(new Set((memberResult.data ?? []).map((row) => String(row.discord_id ?? "").trim()).filter(Boolean)))
  } catch (cause) { setError(cause instanceof Error ? cause.message : "Records preview data could not be loaded.") } })() }, [])
  const player = players.find((row) => row.id === playerId) ?? null, course = courses.find((row) => row.id === courseId) ?? null
  const board: BoardScore[] = bests.filter((row) => row.course_id === courseId).map((row) => ({ playerId: row.player_id, score: row.score }))
  const preview = useMemo(() => {
    if (!player || !course || !Number.isInteger(Number(score)) || !scorecardAt || !submittedAt) return null
    return evaluateSubmission({ id: "preview", playerId, courseId, courseKind: "individual", courseActive: course.active, score: Number(score), scorecardAt: new Date(scorecardAt).toISOString(), submittedAt: new Date(submittedAt).toISOString(), source: "current_submission", serverMember: Boolean(player.discordId && members.has(player.discordId)), properGame: Boolean(room.trim() && witness.trim()), witnessCompleted18: completed18 }, board, [{ id: "local-preview-season", startsAt: "2000-01-01T00:00:00Z", endsAt: "2100-01-01T00:00:00Z" }], "UTC")
  }, [board, completed18, course, courseId, members, player, playerId, room, score, scorecardAt, submittedAt, witness])
  return <div className={styles.gridTwo}><AdminGlassCard><h2 className={styles.sectionHeading}>Current score preview</h2><p className={styles.sectionKicker}>Read-only V2 workflow. Source type is always Current Submission. Calendar-month eligibility currently previews in UTC.</p><div className={styles.stack}>
    <label className={styles.field}>Player<select className={styles.select} value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Choose Global Player</option>{players.map((row) => <option key={row.id} value={row.id}>{row.screenName}</option>)}</select></label>
    <label className={styles.field}>Active course<select className={styles.select} value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Choose course</option>{courses.map((row) => <option key={row.id} value={row.id}>{row.display_name} · {row.difficulty}</option>)}</select></label>
    <label className={styles.field}>Score<input className={styles.input} value={score} onChange={(event) => setScore(event.target.value)} inputMode="numeric" /></label>
    <label className={styles.field}>Scorecard date/time<input className={styles.input} type="datetime-local" value={scorecardAt} onChange={(event) => setScorecardAt(event.target.value)} /></label>
    <label className={styles.field}>Discord submission date/time<input className={styles.input} type="datetime-local" value={submittedAt} onChange={(event) => setSubmittedAt(event.target.value)} /></label>
    <label className={styles.field}>Named room<input className={styles.input} value={room} onChange={(event) => setRoom(event.target.value)} /></label><label className={styles.field}>Other player / witness<input className={styles.input} value={witness} onChange={(event) => setWitness(event.target.value)} /></label>
    <label className={styles.notice}><input type="checkbox" checked={completed18} onChange={(event) => setCompleted18(event.target.checked)} /> Witness completed all 18 holes</label>
  </div></AdminGlassCard><AdminGlassCard><h2 className={styles.sectionHeading}>Eligibility and PB impact</h2>{error && <div className={styles.notice}>{error}</div>}{!preview ? <div className={styles.empty}>Complete the required fields to preview.</div> : <div className={styles.stack}><div className={styles.notice}><strong>{preview.eligible ? "ELIGIBLE" : "REJECTED"}</strong><br />Existing PB: {preview.previousPb ?? "First score"}<br />Result: {preview.pbResult?.toUpperCase()}<br />People climbed: {preview.climbersPoints}</div>{preview.rejectionReasons.length > 0 && <ul className={styles.notice}>{preview.rejectionReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}<button type="button" disabled className={styles.buttonSuccess}>Save disabled pending migration review</button></div>}</AdminGlassCard></div>
}
