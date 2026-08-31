"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import { classifyRecord, climbersPoints, deriveFullCardStats, sha256Hex, type FullCardStats, type NormalEntryType } from "@/lib/all-time/normal-records"
import { supabase } from "@/lib/supabase"

type Course = { id: string; code: string; display_name: string; difficulty: "Easy" | "Hard"; par: number | null; hole_pars: number[] | null }
type Player = { id: string; screen_name: string }
type Best = { player_id: string; score: number }

function parseScore(value: string) { return /^-?\d+$/.test(value.trim()) ? Number(value) : null }

export default function NormalRecordsEntryPage() {
  const [courses, setCourses] = useState<Course[]>([]), [players, setPlayers] = useState<Player[]>([])
  const [courseId, setCourseId] = useState(""), [playerId, setPlayerId] = useState(""), [entryType, setEntryType] = useState<NormalEntryType>("quick_score")
  const [scoreText, setScoreText] = useState(""), [holes, setHoles] = useState<string[]>(Array(18).fill(""))
  const [source, setSource] = useState(""), [reference, setReference] = useState(""), [notes, setNotes] = useState("")
  const [best, setBest] = useState<Best | null>(null), [courseBests, setCourseBests] = useState<Best[]>([])
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [activeSeason, setActiveSeason] = useState(false)
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    void (async () => {
      const [courseResult, playerResult] = await Promise.all([
        supabase.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        supabase.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
      ])
      if (courseResult.error || playerResult.error) { setError(courseResult.error?.message || playerResult.error?.message || "The protected records catalog could not be loaded."); setLoading(false); return }
      const nextCourses = (courseResult.data ?? []) as Course[], nextPlayers = (playerResult.data ?? []) as Player[]
      setCourses(nextCourses); setPlayers(nextPlayers); setCourseId(nextCourses[0]?.id ?? ""); setPlayerId(nextPlayers[0]?.id ?? ""); setLoading(false)
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      const result = await supabase.from("climbers_seasons").select("id").eq("status", "active").lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()).limit(1)
      if (!result.error) setActiveSeason(Boolean(result.data?.length))
    })()
  }, [])

  const course = courses.find((item) => item.id === courseId) ?? null
  const player = players.find((item) => item.id === playerId) ?? null
  const holePars = Array.isArray(course?.hole_pars) ? course.hole_pars : []
  const parsedHoles = holes.map((value) => /^-?\d+$/.test(value.trim()) ? Number(value) : null)
  const fullStats: FullCardStats | null = entryType === "full_card" && parsedHoles.every((value): value is number => value !== null) && holePars.length === 18
    ? (() => { const result = deriveFullCardStats(parsedHoles, holePars); return "error" in result ? null : result })()
    : null
  const submittedScore = entryType === "full_card" ? fullStats?.scoreRelativeToPar ?? null : parseScore(scoreText)
  const classification = submittedScore === null ? null : classifyRecord(best?.score ?? null, submittedScore)
  const peoplePassed = activeSeason && classification === "BETTER" && submittedScore !== null ? courseBests.filter((item) => item.player_id !== playerId && item.score > submittedScore).length : 0
  const points = classification ? climbersPoints(classification, peoplePassed) : 0

  useEffect(() => {
    if (!courseId || !playerId) return
    void (async () => {
      setError(""); setBest(null); setCourseBests([])
      const [bestResult, allResult] = await Promise.all([
        supabase.from("all_time_best_records").select("player_id,score").eq("course_id", courseId).eq("player_id", playerId).maybeSingle(),
        supabase.from("all_time_best_records").select("player_id,score").eq("course_id", courseId),
      ])
      if (bestResult.error || allResult.error) setError(bestResult.error?.message || allResult.error?.message || "Current All-Time records could not be loaded.")
      setBest((bestResult.data as Best | null) ?? null); setCourseBests((allResult.data ?? []) as Best[])
    })()
  }, [courseId, playerId])

  const previewText = useMemo(() => {
    if (!classification || submittedScore === null) return "Enter a valid score to preview the protected result."
    if (classification === "FIRST") return "First score — establishes PB — earns 0 Climbers points."
    if (classification === "EQUAL") return "Ties current best — All-Time record unchanged — earns 0 Climbers points."
    if (classification === "WORSE") return `Current record is ${best?.score}. New score ${submittedScore} does not improve the record.`
    return points ? `New PB — passes ${points} player${points === 1 ? "" : "s"} — earns ${points} Climbers point${points === 1 ? "" : "s"}.` : activeSeason ? "PB improves but passes nobody — earns 0 Climbers points." : "PB improves — no active Climbers season — earns 0 Climbers points."
  }, [activeSeason, best?.score, classification, points, submittedScore])

  async function save() {
    if (!course || !player || submittedScore === null || (entryType === "full_card" && !fullStats)) { setError("Complete a valid preview before saving."); return }
    setBusy(true); setError(""); setMessage("")
    try {
      const entryKey = crypto.randomUUID(), fingerprint = await sha256Hex(JSON.stringify({ courseId, playerId, entryType, score: submittedScore, holes: entryType === "full_card" ? parsedHoles : null, source, reference }))
      const result = await supabase.rpc("record_all_time_normal_entry", { p_course_id: course.id, p_player_id: player.id, p_entry_key: entryKey, p_fingerprint: fingerprint, p_score: submittedScore, p_hole_strokes: entryType === "full_card" ? parsedHoles : null, p_entry_type: entryType, p_source_label: source || null, p_provenance_reference: reference || null, p_notes: notes || null })
      if (result.error) throw result.error
      setSaved(result.data as Record<string, unknown>); setMessage("Saved through the protected All-Time entry path. Derived records and any Climbers event were recalculated by the database."); setScoreText(""); setHoles(Array(18).fill("")); setSource(""); setReference(""); setNotes("")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The protected entry could not be saved.") } finally { setBusy(false) }
  }

  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/backfill" className={styles.button}>Late / Backfill</a><a href="/admin/records/history" className={styles.button}>Records history</a><a href="/admin/records/climbers" className={styles.button}>Climbers</a></nav>
    <AdminRecordsHero title="Normal All-Time Entry" description="Enter a source attempt once. The protected workflow preserves history, never worsens a record, and calculates Climbers from actual players passed." />
    <AdminGlassCard>
      <div className="grid gap-5 md:grid-cols-3">
        <label className={styles.field}>Course<select className={styles.select} value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.difficulty} · {item.code}</option>)}</select></label>
        <label className={styles.field}>Canonical player<select className={styles.select} value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{players.map((item) => <option key={item.id} value={item.id}>{item.screen_name}</option>)}</select></label>
        <label className={styles.field}>Entry method<select className={styles.select} value={entryType} onChange={(event) => setEntryType(event.target.value as NormalEntryType)}><option value="quick_score">Quick Final Score</option><option value="full_card" disabled={holePars.length !== 18}>Full Card{holePars.length !== 18 ? " (needs hole pars)" : ""}</option></select></label>
      </div>
      {course && <p className={styles.sectionKicker}>Selected {course.difficulty} · catalog par {course.par ?? "not loaded"}. Full Card requires 18 authoritative hole pars; Quick Score never invents hole data.</p>}
      {entryType === "quick_score" ? <label className={styles.field}>Score relative to par<input className={styles.input} inputMode="numeric" value={scoreText} onChange={(event) => setScoreText(event.target.value)} placeholder="-25, 0, or +5" /></label> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">{holes.map((value, index) => <label className={styles.field} key={index}>Hole {index + 1}<input className={styles.input} inputMode="numeric" value={value} onChange={(event) => setHoles((current) => current.map((item, hole) => hole === index ? event.target.value : item))} placeholder={String(holePars[index] ?? "par")}/></label>)}</div>}
      {fullStats && <p className={styles.sectionKicker}>Derived card: {fullStats.totalStrokes} strokes · {fullStats.scoreRelativeToPar} relative · HN1 {fullStats.hn1Count} · birdies {fullStats.birdies} · eagles {fullStats.eagles} · pars {fullStats.pars} · bogeys {fullStats.bogeys}</p>}
      <div className="grid gap-4 md:grid-cols-3"><label className={styles.field}>Source / league<input className={styles.input} value={source} onChange={(event) => setSource(event.target.value)} /></label><label className={styles.field}>Reference<input className={styles.input} value={reference} onChange={(event) => setReference(event.target.value)} /></label><label className={styles.field}>Notes<input className={styles.input} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>
    </AdminGlassCard>
    <AdminGlassCard><h2 className={styles.sectionHeading}>Protected preview</h2><p className={styles.sectionKicker}>{player?.screen_name ?? "Player"} · {course?.display_name ?? "Course"} · {course?.difficulty ?? "Difficulty"}</p><div className={styles.recordRow}><span>Current PB</span><strong>{best?.score ?? "First score"}</strong><span>Submitted</span><strong>{submittedScore ?? "—"}</strong><span>{classification ?? "—"}</span></div><p role="status" className={styles.sectionKicker}>{previewText}</p><button className={styles.button} disabled={busy || loading || !classification || submittedScore === null || (entryType === "full_card" && !fullStats)} onClick={() => void save()}>{busy ? "Saving…" : "Save entry"}</button>{message && <p role="status" className={styles.sectionKicker}>{message}</p>}{error && <p role="alert" className={styles.empty}>{error}</p>}{saved && <pre className="mt-4 overflow-auto rounded bg-black/20 p-3 text-xs">{JSON.stringify(saved, null, 2)}</pre>}</AdminGlassCard>
  </AdminRecordsShell>
}
