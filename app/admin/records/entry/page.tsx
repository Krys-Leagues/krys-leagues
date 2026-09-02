"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import scorecardStyles from "@/components/admin/records/NormalScorecard.module.css"
import { classifyRecord, climbersPoints, deriveFullCardStats, sha256Hex, type FullCardStats, type NormalEntryType } from "@/lib/all-time/normal-records"
import { compareRelativeScoreToPb, formatPb } from "@/lib/all-time/pb-precheck"
import { nextHoleAfterCompleteInput, parsePositiveHoleScore, sanitizeHoleScoreInput } from "@/lib/all-time/score-input"
import { supabase } from "@/lib/supabase"

type Period = "current" | "previous"
type Course = { id: string; code: string; display_name: string; difficulty: "Easy" | "Hard"; par: number | null; hole_pars: number[] | null }
type Player = { id: string; screen_name: string }
type Best = { player_id: string; score: number }
type Season = { id: string; starts_at: string; ends_at: string; status: string }
type SessionEntry = { player: string; course: string; score: number; hio: number | null; classification: string; points: number; period: string; status: string }

const emptyHoles = () => Array.from({ length: 18 }, () => "")
const parseScore = (value: string) => /^-?\d+$/.test(value.trim()) ? Number(value) : null
const errorMessage = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : caught && typeof caught === "object" && "message" in caught ? String(caught.message) : fallback

function validHolePars(course: Course | null): course is Course & { par: number; hole_pars: number[] } {
  if (!course || !Array.isArray(course.hole_pars) || course.hole_pars.length !== 18) return false
  const totalPar = typeof course.par === "number" ? course.par : null
  if (totalPar === null || !Number.isInteger(totalPar) || totalPar <= 0) return false
  return course.hole_pars.every((par) => Number.isInteger(par) && par > 0) && course.hole_pars.reduce((sum, par) => sum + par, 0) === totalPar
}

export default function NormalRecordsEntryPage() {
  const [courses, setCourses] = useState<Course[]>([]), [players, setPlayers] = useState<Player[]>([])
  const [period, setPeriod] = useState<Period>("current"), [courseId, setCourseId] = useState(""), [playerId, setPlayerId] = useState(""), [playerSearch, setPlayerSearch] = useState(""), [entryType, setEntryType] = useState<NormalEntryType>("full_card")
  const [scoreText, setScoreText] = useState(""), [holes, setHoles] = useState<string[]>(emptyHoles)
  const [source, setSource] = useState(""), [reference, setReference] = useState(""), [notes, setNotes] = useState("")
  const [best, setBest] = useState<Best | null>(null), [courseBests, setCourseBests] = useState<Best[]>([]), [bestLoading, setBestLoading] = useState(false)
  const [season, setSeason] = useState<Season | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false), [previewFingerprint, setPreviewFingerprint] = useState(""), [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]), [finished, setFinished] = useState(false)
  const nextActionRef = useRef<HTMLButtonElement>(null), entryKeyRef = useRef(crypto.randomUUID())

  useEffect(() => {
    void (async () => {
      const [courseResult, playerResult, seasonResult] = await Promise.all([
        supabase.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        supabase.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
        supabase.from("climbers_seasons").select("id,starts_at,ends_at,status").eq("status", "active").lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()).limit(1),
      ])
      const queryError = courseResult.error || playerResult.error
      if (queryError) setError(queryError.message)
      setCourses((courseResult.data ?? []) as Course[]); setPlayers((playerResult.data ?? []) as Player[]); setSeason(((seasonResult.data ?? [])[0] as Season | undefined) ?? null); setLoading(false)
    })()
  }, [])

  const course = courses.find((item) => item.id === courseId) ?? null
  const player = players.find((item) => item.id === playerId) ?? null
  const filteredPlayers = useMemo(() => { const query = playerSearch.trim().toLowerCase(); return query ? players.filter((item) => item.screen_name.toLowerCase().includes(query)) : players }, [playerSearch, players])
  const holePars = validHolePars(course) ? course.hole_pars : []
  const parsedHoles = holes.map(parsePositiveHoleScore)
  const fullStats: FullCardStats | null = entryType === "full_card" && parsedHoles.every((value): value is number => value !== null) && holePars.length === 18 ? (() => { const result = deriveFullCardStats(parsedHoles, holePars); return "error" in result ? null : result })() : null
  const submittedScore = entryType === "full_card" ? fullStats?.scoreRelativeToPar ?? null : parseScore(scoreText)
  const relevantPb = best?.score ?? null
  const classification = submittedScore !== null && relevantPb !== undefined ? classifyRecord(relevantPb, submittedScore) : null
  const peoplePassed = season && classification === "BETTER" && submittedScore !== null ? courseBests.filter((item) => item.player_id !== playerId && item.score > submittedScore).length : 0
  const localPoints = classification ? climbersPoints(classification, peoplePassed) : 0
  const points = localPoints
  const targetPeriod = period === "current" ? season ? `${new Date(season.starts_at).toLocaleDateString()}–${new Date(season.ends_at).toLocaleDateString()}` : "Current period · no active season (0 points)" : "Previous period · use Late / Backfill tools"
  const needsPar = entryType === "full_card" && !validHolePars(course)

  useEffect(() => {
    if (!courseId || !playerId) return
    let cancelled = false
    void (async () => {
      setError(""); setBest(null); setCourseBests([]); setBestLoading(true)
      const [bestResult, allResult] = await Promise.all([
        supabase.from("all_time_best_records").select("player_id,score").eq("course_id", courseId).eq("player_id", playerId).maybeSingle(),
        supabase.from("all_time_best_records").select("player_id,score").eq("course_id", courseId),
      ])
      if (cancelled) return
      if (bestResult.error || allResult.error) setError(bestResult.error?.message || allResult.error?.message || "Current All-Time records could not be loaded.")
      setBest((bestResult.data as Best | null) ?? null); setCourseBests((allResult.data ?? []) as Best[]); setBestLoading(false)
    })()
    return () => { cancelled = true }
  }, [courseId, playerId])

  function focusAfterHole(index: number, value: string) {
    const nextIndex = nextHoleAfterCompleteInput(value, index)
    const next = nextIndex === null ? null : document.querySelector<HTMLInputElement>(`[data-normal-hole-index="${nextIndex}"]`)
    if (next) next.focus()
    else if (parsePositiveHoleScore(value) !== null) nextActionRef.current?.focus()
  }

  function updateHole(index: number, value: string) {
    const sanitized = sanitizeHoleScoreInput(value)
    setHoles((current) => current.map((hole, holeIndex) => holeIndex === index ? sanitized : hole))
    if (parsePositiveHoleScore(sanitized) !== null) focusAfterHole(index, sanitized)
  }

  function invalidatePreview() { setPreviewFingerprint(""); setConfirmed(false) }

  function validateEntry() {
    if (!course || !player) return "Select one Easy/Hard course and one canonical Global Player."
    if (!source.trim()) return "Enter a source or provenance label."
    if (submittedScore === null) return entryType === "full_card" ? "Enter all 18 positive hole scores." : "Enter a valid integer score relative to par."
    if (entryType === "full_card" && (!validHolePars(course) || !fullStats)) return "This course needs 18 authoritative positive hole pars before a full card can be saved."
    if (period === "previous") return "Previous Period saves are handled in the protected Late / Backfill tools. This intake is for current-period entries."
    if (!classification) return "Complete the protected preview before saving."
    return null
  }

  async function fingerprintForEntry() {
    return sha256Hex(JSON.stringify({ period, courseId, playerId, entryType, score: submittedScore, holes: entryType === "full_card" ? parsedHoles : null, source: source.trim(), reference: reference.trim(), notes: notes.trim() }))
  }

  async function previewEntry() {
    const problem = validateEntryForPreview(); if (problem) { setError(problem); return }
    const selectedCourse = course, selectedPlayer = player, score = submittedScore
    if (!selectedCourse || !selectedPlayer || score === null) { setError("Complete the player, course, and score before previewing."); return }
    setBusy(true); setError(""); setMessage(""); setConfirmed(false)
    try {
      const fingerprint = await fingerprintForEntry()
      if (period === "previous") { setError("Previous Period saves are handled in the protected Late / Backfill tools. This intake is for current-period entries."); return }
      setPreviewFingerprint(fingerprint)
      setMessage("Protected preview ready. Review it and explicitly confirm this one-player entry.")
    } catch (caught) { setError(errorMessage(caught, "The protected preview could not be loaded.")) } finally { setBusy(false) }
  }

  function validateEntryForPreview() {
    if (!course || !player) return "Select one Easy/Hard course and one canonical Global Player."
    if (!source.trim()) return "Enter a source or provenance label."
    if (entryType === "full_card" && (!validHolePars(course) || !fullStats)) return "Enter all 18 positive hole scores; authoritative 18-hole pars are required."
    if (entryType === "quick_score" && submittedScore === null) return "Enter a valid integer score relative to par."
    if (period === "previous") return "Previous Period saves are handled in the protected Late / Backfill tools. This intake is for current-period entries."
    return null
  }

  function resetEntry() { setCourseId(""); setPlayerId(""); setPlayerSearch(""); setScoreText(""); setHoles(emptyHoles()); setSource(""); setReference(""); setNotes(""); setConfirmed(false); setPreviewFingerprint(""); entryKeyRef.current = crypto.randomUUID() }

  async function saveEntry(finish: boolean) {
    const problem = validateEntry(); if (problem) { setError(problem); return }
    if (!confirmed) { setError("Review the protected preview and check the confirmation box before saving."); return }
    const selectedCourse = course, selectedPlayer = player, score = submittedScore, stats = fullStats
    if (!selectedCourse || !selectedPlayer || score === null || (entryType === "full_card" && !stats)) { setError("Complete the protected preview before saving."); return }
    setBusy(true); setError(""); setMessage("")
    try {
      const fingerprint = await fingerprintForEntry(); if (fingerprint !== previewFingerprint) throw new Error("The entry changed after preview; run a fresh protected preview.")
      if (period === "previous") throw new Error("Previous Period saves are handled in the protected Late / Backfill tools. This intake is for current-period entries.")
      const result = await supabase.rpc("record_all_time_normal_entry", { p_course_id: selectedCourse.id, p_player_id: selectedPlayer.id, p_entry_key: entryKeyRef.current, p_fingerprint: fingerprint, p_score: score, p_hole_strokes: entryType === "full_card" ? parsedHoles : null, p_entry_type: entryType, p_source_label: source.trim(), p_provenance_reference: reference.trim() || null, p_notes: notes.trim() || null })
      if (result.error) throw result.error
      setSessionEntries((current) => [...current, { player: selectedPlayer.screen_name, course: `${selectedCourse.display_name} · ${selectedCourse.difficulty}`, score, hio: stats?.hn1Count ?? null, classification: classification ?? "—", points, period: targetPeriod, status: "SAVED" }])
      setMessage(finish ? "Entry saved. Intake session finished." : "Entry saved. Add another player from any course or submitted card.")
      if (finish) setFinished(true)
      else resetEntry()
    } catch (caught) { setError(errorMessage(caught, "The protected All-Time entry could not be saved.")) } finally { setBusy(false) }
  }

  const previewReady = Boolean(previewFingerprint && submittedScore !== null && period === "current")
  const previewText = period === "previous" ? "Previous Period saves are handled in the protected Late / Backfill tools. This intake is for current-period entries." : !classification || submittedScore === null ? "Enter the score to calculate the protected result." : classification === "FIRST" ? "FIRST — establishes a PB — 0 Climbers points." : classification === "EQUAL" ? "EQUAL — tie does not change the PB — 0 Climbers points." : classification === "WORSE" ? "WORSE — current PB remains unchanged — 0 Climbers points." : points ? `BETTER — passes ${points} canonical player${points === 1 ? "" : "s"} — ${points} Climbers point${points === 1 ? "" : "s"}.` : "BETTER — PB improves but no canonical players are passed — 0 Climbers points."

  if (finished) return <AdminRecordsShell><nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/history" className={styles.button}>Records history</a></nav><AdminRecordsHero title="Intake session finished" description="The saved entries below were added during this admin intake session." /><SessionLog entries={sessionEntries} /></AdminRecordsShell>
  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/backfill" className={styles.button}>Late / Backfill tools</a><a href="/admin/records/history" className={styles.button}>Records history</a><a href="/admin/records/climbers" className={styles.button}>Climbers</a></nav>
    <AdminRecordsHero title="All-Time Intake" description="Enter one player at a time. The protected preview preserves the selected period, authoritative course pars, PB effect, and Climbers result before any save." />
    <AdminGlassCard>
      <div className="grid gap-5 md:grid-cols-4">
        <label className={styles.field}>Climbers period<select className={styles.select} value={period} onChange={(event) => { setPeriod(event.target.value as Period); invalidatePreview() }}><option value="current">CURRENT PERIOD — DEFAULT</option><option value="previous">PREVIOUS PERIOD</option></select></label>
        <label className={styles.field}>Course<select className={styles.select} value={courseId} onChange={(event) => { setCourseId(event.target.value); setBest(null); setCourseBests([]); setHoles(emptyHoles()); setScoreText(""); invalidatePreview() }}><option value="">Choose an Easy/Hard course</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.difficulty} · {item.code}</option>)}</select></label>
        <label className={styles.field}>Search Global Players<input className={styles.input} value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Filter canonical players" aria-label="Search canonical Global Players" /></label>
        <label className={styles.field}>Canonical Global Player<select className={styles.select} value={playerId} onChange={(event) => { setPlayerId(event.target.value); setBest(null); setCourseBests([]); invalidatePreview() }} aria-label="Canonical Global Player"><option value="">Choose one player</option>{filteredPlayers.map((item) => <option key={item.id} value={item.id}>{item.screen_name}</option>)}</select></label>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3"><label className={styles.field}>Entry method<select className={styles.select} value={entryType} onChange={(event) => { setEntryType(event.target.value as NormalEntryType); invalidatePreview() }}><option value="full_card">18-hole scorecard</option><option value="quick_score">Quick Score</option></select></label><label className={styles.field}>Source / provenance<input className={styles.input} value={source} onChange={(event) => { setSource(event.target.value); invalidatePreview() }} /></label><label className={styles.field}>Reference<input className={styles.input} value={reference} onChange={(event) => { setReference(event.target.value); invalidatePreview() }} placeholder="URL, message, or source row" /></label><label className={`${styles.field} md:col-span-3`}>Notes<textarea className={styles.textarea} value={notes} onChange={(event) => { setNotes(event.target.value); invalidatePreview() }} /></label></div>
      {course && <p className={styles.sectionKicker}>Selected {course.difficulty} · authoritative total par: {course.par ?? "not loaded"}. Selecting data is read-only and never creates an observation, PB, season, or Climbers event.</p>}
      {course && player && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-950/20 p-3" aria-live="polite"><strong className="block text-sm text-amber-100">{bestLoading ? "PB LOOKUP PENDING" : `CURRENT ALL-TIME PB: ${formatPb(best?.score ?? null)}`}</strong>{best && <span className="block text-xs text-amber-50">NEED TO BEAT: {formatPb(best.score)}</span>}{submittedScore !== null && !bestLoading && <span className="mt-2 block text-xs font-bold text-amber-100">{compareRelativeScoreToPb(submittedScore, best?.score ?? null)}</span>}{period === "previous" && <span className="mt-2 block text-xs text-amber-100">Current PB shown for reference only; use Late / Backfill tools for previous-period saves.</span>}<span className="mt-1 block text-xs text-slate-300">Read-only lookup. Selecting a player or course never creates an observation, season, or Climbers event.</span></div>}
    </AdminGlassCard>
    <AdminGlassCard>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className={styles.sectionHeading}>{entryType === "full_card" ? "18-hole scorecard" : "Quick Score"}</h2><p className={styles.sectionKicker}>{entryType === "full_card" ? "HOLE · PAR · SCORE — all 18 holes stay in one compact row." : "Enter the final relative score without transcribing hole data."}</p></div>{entryType === "full_card" && course && !validHolePars(course) && <span className="text-sm font-bold text-amber-200">Authoritative pars unavailable — save blocked</span>}</div>
      {entryType === "full_card" ? <div className="mt-5"><div className={scorecardStyles.scorecardScroller}><table className={scorecardStyles.scorecard} data-testid="normal-one-player-scorecard"><thead><tr><th scope="row">HOLE</th>{Array.from({ length: 18 }, (_, index) => <th key={index} scope="col">{index + 1}</th>)}</tr><tr><th scope="row">PAR</th>{Array.from({ length: 18 }, (_, index) => <td className={scorecardStyles.parCell} key={index}>{holePars[index] ?? "—"}</td>)}</tr></thead><tbody><tr><th scope="row">SCORE</th>{holes.map((value, index) => <td key={index}><input className={scorecardStyles.scoreInput} data-normal-hole-index={index} aria-label={`Score hole ${index + 1}`} inputMode="numeric" pattern="[0-9]*" type="text" value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { updateHole(index, event.target.value); invalidatePreview() }} onWheel={(event) => event.currentTarget.blur()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); focusAfterHole(index, event.currentTarget.value) } }} /></td>)}</tr></tbody></table></div><p className={scorecardStyles.scorecardHint}>Scores advance immediately after each valid hole score. Use the horizontal scroll on smaller screens; no hole pars are inferred.</p></div> : <label className={`${styles.field} mt-5 max-w-sm`}>Final score relative to par<input className={styles.input} inputMode="numeric" value={scoreText} onChange={(event) => { setScoreText(event.target.value); invalidatePreview() }} placeholder="-25, 0, or 5" /></label>}
      {needsPar && <p role="alert" className={`${styles.notice} mt-4`}>This course cannot save a full card until its authoritative total par and all 18 positive hole pars are available.</p>}
      {fullStats && <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 md:grid-cols-8">{[["Strokes", fullStats.totalStrokes], ["Relative", fullStats.scoreRelativeToPar], ["HIO", fullStats.hn1Count], ["Pars", fullStats.pars], ["Birdies", fullStats.birdies], ["Bogeys", fullStats.bogeys], ["Eagles+", fullStats.eagles], ["Other", fullStats.otherHoles]].map(([label, value]) => <div className="rounded-lg border border-sky-300/20 bg-slate-950/40 p-2 text-center" key={label}><span className="block text-xs text-slate-400">{label}</span><strong>{value}</strong></div>)}</div>}
    </AdminGlassCard>
      <AdminGlassCard><h2 className={styles.sectionHeading}>Protected preview</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><span className="block text-xs text-slate-400">Player</span><strong>{player?.screen_name ?? "—"}</strong></div><div><span className="block text-xs text-slate-400">Course</span><strong>{course ? `${course.display_name} · ${course.difficulty}` : "—"}</strong></div><div><span className="block text-xs text-slate-400">Submitted score</span><strong>{submittedScore ?? "—"}</strong></div><div><span className="block text-xs text-slate-400">Classification</span><strong>{classification ?? "—"}</strong></div><div><span className="block text-xs text-slate-400">New PB</span><strong>{formatPb(classification === "FIRST" || classification === "BETTER" ? submittedScore : best?.score ?? null)}</strong></div><div><span className="block text-xs text-slate-400">Climbers</span><strong>{points} points</strong></div><div><span className="block text-xs text-slate-400">Target period</span><strong>{targetPeriod}</strong></div><div><span className="block text-xs text-slate-400">Status</span><strong>{previewReady ? "READY TO REVIEW" : "DRAFT"}</strong></div></div><p role="status" className={styles.sectionKicker}>{previewText}</p><button className={`${styles.buttonPrimary} mt-4`} disabled={busy || loading || bestLoading || Boolean(validateEntryForPreview())} onClick={() => void previewEntry()}>{busy ? "Preparing…" : "Preview protected entry"}</button>{previewReady && <label className="mt-4 flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the player, course, score, PB effect, Climbers effect, period, and provenance, and confirm this one-player entry.</span></label>}<div className="mt-4 flex flex-wrap gap-3"><button ref={nextActionRef} className={styles.buttonSuccess} disabled={busy || !previewReady || !confirmed} onClick={() => void saveEntry(false)}>ADD AGAIN</button><button className={styles.buttonPrimary} disabled={busy || !previewReady || !confirmed} onClick={() => void saveEntry(true)}>ADD &amp; FINISH</button></div>{message && <p role="status" className={styles.sectionKicker}>{message}</p>}{error && <p role="alert" className={styles.empty}>{error}</p>}</AdminGlassCard>
    <SessionLog entries={sessionEntries} />
  </AdminRecordsShell>
}

function SessionLog({ entries }: { entries: SessionEntry[] }) {
  return <AdminGlassCard><h2 className={styles.sectionHeading}>SESSION ENTRIES</h2>{entries.length === 0 ? <p className={styles.sectionKicker}>Saved entries from this intake session will appear here.</p> : <div className="mt-4 space-y-2">{entries.map((entry, index) => <div className="grid gap-1 rounded-lg border border-sky-300/15 bg-slate-950/35 p-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center" key={`${entry.player}-${index}`}><strong>{index + 1}. {entry.player}</strong><span>{entry.course} · {entry.score} · HIO {entry.hio ?? "—"} · {entry.classification} · {entry.points} Climbers · {entry.period}</span><span className="text-emerald-300">{entry.status}</span></div>)}</div>}</AdminGlassCard>
}
