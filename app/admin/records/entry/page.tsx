"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import scorecardStyles from "@/components/admin/records/NormalScorecard.module.css"
import { ScorecardEvidence } from "@/components/admin/records/ScorecardEvidence"
import { sourceAfterScorecardSelection, validScorecardFile, workspaceAfterSuccessfulSave, type FastEntryAction } from "@/lib/all-time/fast-entry-workflow"
import { formatClimbersPeriodRange } from "@/lib/all-time/climbers-period-display"
import { classifyRecord, climbersPoints, deriveFullCardStats, sha256Hex, type FullCardStats, type NormalEntryType, type RecordClassification } from "@/lib/all-time/normal-records"
import { compareRelativeScoreToPb, formatPb } from "@/lib/all-time/pb-precheck"
import { nextHoleAfterCompleteInput, parsePositiveHoleScore, sanitizeHoleScoreInput } from "@/lib/all-time/score-input"
import { adminRecordsRequest } from "@/lib/admin/recordsClient"

type Period = "current" | "previous" | "two_periods_ago"
type Course = { id: string; code: string; display_name: string; difficulty: "Easy" | "Hard"; par: number | null; hole_pars: number[] | null }
type Player = { id: string; screen_name: string }
type Best = { player_id: string; score: number }
type Season = { id: string; starts_at: string; ends_at: string; status: string }
type VerifiedPeriodPreview = { action?: string; confirmation_token?: string; all_time_classification?: RecordClassification; current_pb_score?: number | null; new_pb_score?: number | null; climbers_points?: number | null; climbers_status?: string; replay_mode?: "LEGACY_V1_APPEND" | "SOURCE_V2" }
type SessionEntry = { player: string; course: string; score: number; hio: number | null; classification: string; points: number; period: string; pbBefore: number | null; pbAfter: number | null; scorecard: "YES" | "NO" | "FAILED"; savedAt: string; status: string }
type SavedEntryResult = { action?: string; observation_id?: string; current_best_score?: number | null; climbers_points?: number; climbers_status?: string }

const emptyHoles = () => Array.from({ length: 18 }, () => "")
const parseScore = (value: string) => /^-?\d+$/.test(value.trim()) ? Number(value) : null
const errorMessage = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : caught && typeof caught === "object" && "message" in caught ? String(caught.message) : fallback

type AdminEntryAction = "preview_verified_period" | "record_verified_period" | "record_normal_entry"

async function callAdminEntryRpc(action: AdminEntryAction, args: Record<string, unknown>) {
  const response = await fetch("/api/admin/records/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
    cache: "no-store",
  })
  const payload = await response.json() as { data?: unknown; error?: string }
  if (!response.ok) throw new Error(payload.error || "The protected All-Time entry action failed.")
  return { data: payload.data }
}

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
  const [verifiedDate, setVerifiedDate] = useState(""), [verifiedOrder, setVerifiedOrder] = useState("")
  const [scorecardFile, setScorecardFile] = useState<File | null>(null), [scorecardUrl, setScorecardUrl] = useState<string | null>(null)
  const [best, setBest] = useState<Best | null>(null), [courseBests, setCourseBests] = useState<Best[]>([]), [bestLoading, setBestLoading] = useState(false)
  const [season, setSeason] = useState<Season | null>(null), [previousSeason, setPreviousSeason] = useState<Season | null>(null), [twoPeriodsAgoSeason, setTwoPeriodsAgoSeason] = useState<Season | null>(null), [loading, setLoading] = useState(true), [playerLoading, setPlayerLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [previewFingerprint, setPreviewFingerprint] = useState(""), [periodPreview, setPeriodPreview] = useState<VerifiedPeriodPreview | null>(null), [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]), [finished, setFinished] = useState(false)
  const nextActionRef = useRef<HTMLButtonElement>(null), entryKeyRef = useRef(crypto.randomUUID()), verifiedSourceBatchRef = useRef(crypto.randomUUID()), savingRef = useRef(false), sourceWasChangedRef = useRef(false), scorecardUrlRef = useRef<string | null>(null)

  useEffect(() => () => { if (scorecardUrlRef.current) URL.revokeObjectURL(scorecardUrlRef.current) }, [])

  useEffect(() => {
    void (async () => {
      const result = await adminRecordsRequest<{ courses: Course[]; seasons: Season[] }>("entry_catalog")
      if (result.error) setError(result.error.message)
      const seasons = result.data?.seasons ?? [], now = Date.now()
      const current = seasons.find((item) => item.status === "active" && new Date(item.starts_at).getTime() <= now && new Date(item.ends_at).getTime() > now) ?? null
      const completed = seasons.filter((item) => new Date(item.ends_at).getTime() <= now).sort((a, b) => new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime())
      setCourses(result.data?.courses ?? []); setSeason(current); setPreviousSeason(completed[0] ?? null); setTwoPeriodsAgoSeason(completed[1] ?? null); setLoading(false)
    })()
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setPlayerLoading(true)
        try {
          const response = await fetch(`/api/admin/records/player-search?q=${encodeURIComponent(playerSearch)}`, { cache: "no-store" })
          const payload = await response.json() as { players?: Player[]; error?: string }
          if (!response.ok) throw new Error(payload.error || "Global Players could not be loaded.")
          if (!cancelled) setPlayers(Array.isArray(payload.players) ? payload.players : [])
        } catch (caught) {
          if (!cancelled) {
            setPlayers([])
            setError(errorMessage(caught, "Global Players could not be loaded."))
          }
        } finally {
          if (!cancelled) setPlayerLoading(false)
        }
      })()
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [playerSearch])

  const course = courses.find((item) => item.id === courseId) ?? null
  const player = players.find((item) => item.id === playerId) ?? null
  const filteredPlayers = useMemo(() => players, [players])
  const holePars = validHolePars(course) ? course.hole_pars : []
  const parsedHoles = holes.map(parsePositiveHoleScore)
  const fullStats: FullCardStats | null = entryType === "full_card" && parsedHoles.every((value): value is number => value !== null) && holePars.length === 18 ? (() => { const result = deriveFullCardStats(parsedHoles, holePars); return "error" in result ? null : result })() : null
  const submittedScore = entryType === "full_card" ? fullStats?.scoreRelativeToPar ?? null : parseScore(scoreText)
  const relevantPb = best?.score ?? null
  const classification = submittedScore !== null && relevantPb !== undefined ? classifyRecord(relevantPb, submittedScore) : null
  const peoplePassed = season && classification === "BETTER" && submittedScore !== null ? courseBests.filter((item) => item.player_id !== playerId && item.score > submittedScore).length : 0
  const localPoints = classification ? climbersPoints(classification, peoplePassed) : 0
  const selectedVerifiedSeason = period === "previous" ? previousSeason : twoPeriodsAgoSeason
  const isVerifiedPeriod = period !== "current"
  const points = isVerifiedPeriod ? periodPreview?.climbers_points ?? 0 : localPoints
  const targetPeriod = period === "current" ? season ? formatClimbersPeriodRange(season.starts_at, season.ends_at) : "Current period · no active season (0 points)" : selectedVerifiedSeason ? formatClimbersPeriodRange(selectedVerifiedSeason.starts_at, selectedVerifiedSeason.ends_at) : period === "previous" ? "Previous period · unavailable" : "Two periods ago · unavailable"
  const needsPar = entryType === "full_card" && !validHolePars(course)

  useEffect(() => {
    if (!courseId || !playerId) return
    let cancelled = false
    void (async () => {
      setError(""); setBest(null); setCourseBests([]); setBestLoading(true)
      const result = await adminRecordsRequest<{ best: Best | null; courseBests: Best[] }>("entry_bests", { courseId, playerId })
      if (cancelled) return
      if (result.error) setError(result.error.message || "Current All-Time records could not be loaded.")
      setBest(result.data?.best ?? null); setCourseBests(result.data?.courseBests ?? []); setBestLoading(false)
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

  function invalidatePreview() { setPeriodPreview(null); setPreviewFingerprint("") }

  function clearScorecard() {
    setScorecardFile(null)
    setScorecardUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      scorecardUrlRef.current = null
      return null
    })
    verifiedSourceBatchRef.current = crypto.randomUUID()
    invalidatePreview()
  }

  function selectScorecard(file: File) {
    if (!validScorecardFile(file)) { setError("Select a JPEG, PNG, WebP, or GIF scorecard no larger than 10 MB."); return }
    const nextUrl = URL.createObjectURL(file)
    setScorecardFile(file)
    verifiedSourceBatchRef.current = crypto.randomUUID()
    setScorecardUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      scorecardUrlRef.current = nextUrl
      return nextUrl
    })
    setSource((current) => sourceAfterScorecardSelection(current, sourceWasChangedRef.current))
    setError(""); setMessage(""); invalidatePreview()
  }

  async function fingerprintForEntry() {
    return sha256Hex(JSON.stringify({ period, courseId, playerId, entryType, score: submittedScore, holes: entryType === "full_card" ? parsedHoles : null, source: source.trim(), reference: reference.trim(), notes: notes.trim(), verifiedDate: isVerifiedPeriod ? verifiedDate : null, verifiedOrder: isVerifiedPeriod ? Number(verifiedOrder) : null }))
  }

  async function previewEntry(): Promise<VerifiedPeriodPreview | null> {
    const problem = validateEntryForPreview(); if (problem) { setError(problem); return null }
    const selectedCourse = course, selectedPlayer = player, score = submittedScore
    if (!selectedCourse || !selectedPlayer || score === null) { setError("Complete the player, course, and score before previewing."); return null }
    setBusy(true); setError(""); setMessage("")
    let generatedPreview: VerifiedPeriodPreview | null = null
    try {
      const fingerprint = await fingerprintForEntry()
      if (period === "current") {
        setPreviewFingerprint(fingerprint)
      } else {
        if (!selectedVerifiedSeason) throw new Error(`No ${period === "previous" ? "previous" : "two-periods-ago"} Climbers period is available for this entry.`)
        const result = await callAdminEntryRpc("preview_verified_period", { p_period_id: selectedVerifiedSeason.id, p_course_id: selectedCourse.id, p_player_id: selectedPlayer.id, p_entry_key: entryKeyRef.current, p_fingerprint: fingerprint, p_score: score, p_hole_strokes: entryType === "full_card" ? parsedHoles : null, p_entry_type: entryType, p_source_label: source.trim(), p_provenance_reference: reference.trim() || null, p_notes: notes.trim() || null, p_authoritative_submitted_at: null, p_authoritative_submitted_date: verifiedDate, p_authoritative_submission_order: Number(verifiedOrder), p_authoritative_time_precision: "date_ordered", p_verified_source_batch_id: verifiedSourceBatchRef.current })
        const preview = result.data as VerifiedPeriodPreview
        if (preview.action === "already_saved") throw new Error("Duplicate prevented: this exact verified-period entry is already saved.")
        generatedPreview = preview
        setPeriodPreview(preview)
        setPreviewFingerprint(fingerprint)
      }
      setMessage("Protected validation ready. The selected ADD action will save this entry automatically.")
      return generatedPreview
    } catch (caught) { setError(errorMessage(caught, "The protected preview could not be loaded.")); return null } finally { setBusy(false) }
  }

  function validateEntryForPreview() {
    if (!course || !player) return "Select one Easy/Hard course and one canonical Global Player."
    if (!source.trim()) return "Enter a source or provenance label."
    if (entryType === "full_card" && (!validHolePars(course) || !fullStats)) return "Enter all 18 positive hole scores; authoritative 18-hole pars are required."
    if (entryType === "quick_score" && submittedScore === null) return "Enter a valid integer score relative to par."
    if (isVerifiedPeriod && !selectedVerifiedSeason) return `No ${period === "previous" ? "previous" : "two-periods-ago"} Climbers period is available.`
    if (isVerifiedPeriod && !/^\d{4}-\d{2}-\d{2}$/.test(verifiedDate)) return "Enter the authoritative source-post date for this completed period."
    if (isVerifiedPeriod && (!/^\d+$/.test(verifiedOrder) || Number(verifiedOrder) < 1)) return "Enter the positive posting/source order for this date."
    if (isVerifiedPeriod && selectedVerifiedSeason && (verifiedDate < selectedVerifiedSeason.starts_at.slice(0, 10) || verifiedDate >= selectedVerifiedSeason.ends_at.slice(0, 10))) return `The source-post date ${verifiedDate.slice(5, 7)}/${verifiedDate.slice(8, 10)}/${verifiedDate.slice(0, 4)} is outside the selected period ${formatClimbersPeriodRange(selectedVerifiedSeason.starts_at, selectedVerifiedSeason.ends_at)}.`
    return null
  }

  function resetEntry(action: FastEntryAction) {
    const next = workspaceAfterSuccessfulSave({ period, courseId, playerId, playerSearch, scoreText, holes, source, reference, notes, scorecardKey: scorecardFile?.name ?? null, verifiedDate, verifiedOrder }, action)
    setCourseId(next.courseId); setPlayerId(next.playerId); setPlayerSearch(next.playerSearch); setScoreText(next.scoreText); setHoles(next.holes)
    setSource(next.source); setReference(next.reference); setNotes(next.notes); setVerifiedDate(next.verifiedDate); setVerifiedOrder(next.verifiedOrder); setBest(null); setCourseBests([]); setPeriodPreview(null); setPreviewFingerprint("")
    if (!next.scorecardKey) clearScorecard()
    if (action !== "add_again_scorecard") verifiedSourceBatchRef.current = crypto.randomUUID()
    entryKeyRef.current = crypto.randomUUID()
  }

  async function saveEntry(action: FastEntryAction) {
    if (savingRef.current) return
    const problem = validateEntryForPreview(); if (problem) { setError(problem); return }
    const selectedCourse = course, selectedPlayer = player, score = submittedScore, stats = fullStats
    if (!selectedCourse || !selectedPlayer || score === null || (entryType === "full_card" && !stats)) { setError("Complete the entry before saving."); return }
    savingRef.current = true; setBusy(true); setError(""); setMessage("SAVING — do not resubmit this entry.")
    try {
      const generatedPreview = await previewEntry()
      const fingerprint = await fingerprintForEntry()
      if (isVerifiedPeriod && !generatedPreview?.confirmation_token) throw new Error("Protected validation did not return a confirmation token; nothing was saved.")
      const result = isVerifiedPeriod
        ? await callAdminEntryRpc("record_verified_period", { p_period_id: selectedVerifiedSeason?.id, p_course_id: selectedCourse.id, p_player_id: selectedPlayer.id, p_entry_key: entryKeyRef.current, p_fingerprint: fingerprint, p_score: score, p_hole_strokes: entryType === "full_card" ? parsedHoles : null, p_entry_type: entryType, p_source_label: source.trim(), p_provenance_reference: reference.trim() || null, p_notes: notes.trim() || null, p_confirmation_token: generatedPreview?.confirmation_token, p_authoritative_submitted_at: null, p_authoritative_submitted_date: verifiedDate, p_authoritative_submission_order: Number(verifiedOrder), p_authoritative_time_precision: "date_ordered", p_verified_source_batch_id: verifiedSourceBatchRef.current })
        : await callAdminEntryRpc("record_normal_entry", { p_course_id: selectedCourse.id, p_player_id: selectedPlayer.id, p_entry_key: entryKeyRef.current, p_fingerprint: fingerprint, p_score: score, p_hole_strokes: entryType === "full_card" ? parsedHoles : null, p_entry_type: entryType, p_source_label: source.trim(), p_provenance_reference: reference.trim() || null, p_notes: notes.trim() || null })
      const saved = (result.data ?? {}) as SavedEntryResult
      if (saved.action === "already_saved") { setError("Duplicate prevented: this exact entry is already saved. No second observation or scorecard attachment was created."); return }
      const savedClassification = generatedPreview?.all_time_classification ?? periodPreview?.all_time_classification ?? classification ?? "—"
      const savedPoints = saved.climbers_points ?? points
      const pbBefore = best?.score ?? null
      const pbAfter = savedClassification === "FIRST" || savedClassification === "BETTER" ? score : pbBefore
      let scorecard: SessionEntry["scorecard"] = scorecardFile ? "FAILED" : "NO"
      let attachmentWarning = ""
      if (scorecardFile) {
        if (!saved.observation_id) attachmentWarning = "The score was saved, but its observation reference was unavailable, so the scorecard was not attached. Do not resubmit the score."
        else {
          try {
            const form = new FormData()
            form.set("scorecard", scorecardFile); form.set("observationId", saved.observation_id); form.set("playerId", selectedPlayer.id); form.set("courseId", selectedCourse.id)
            const attachment = await fetch("/api/admin/records/all-time/scorecard", { method: "POST", body: form })
            const payload = await attachment.json().catch(() => ({})) as { error?: string }
            if (attachment.ok) scorecard = "YES"
            else attachmentWarning = `The score was saved, but the scorecard attachment failed: ${payload.error || "unknown attachment error"} Do not resubmit the score.`
          } catch (caught) {
            attachmentWarning = `The score was saved, but the scorecard attachment failed: ${errorMessage(caught, "network error")} Do not resubmit the score.`
          }
        }
      }
      const pbStatus = savedClassification === "FIRST" || savedClassification === "BETTER" ? "NEW PB" : "NO NEW PB"
      setSessionEntries((current) => [...current, { player: selectedPlayer.screen_name, course: `${selectedCourse.display_name} · ${selectedCourse.difficulty}`, score, hio: stats?.hn1Count ?? null, classification: savedClassification, points: savedPoints, period: targetPeriod, pbBefore, pbAfter, scorecard, savedAt: new Date().toLocaleTimeString(), status: pbStatus }])
      resetEntry(action)
      setMessage(`${pbStatus} · CLIMBERS: ${savedPoints} POINT${savedPoints === 1 ? "" : "S"}${action === "finish" ? " · Intake session finished." : ""}`)
      if (attachmentWarning) setError(attachmentWarning)
      if (action === "finish") setFinished(true)
    } catch (caught) { setError(errorMessage(caught, "The protected All-Time entry could not be saved.")); setMessage("") } finally { savingRef.current = false; setBusy(false) }
  }

  const previewReady = Boolean(previewFingerprint && submittedScore !== null && (!isVerifiedPeriod || periodPreview?.confirmation_token))
  const previewText = isVerifiedPeriod ? `Verified ${period === "previous" ? "Previous Period" : "Two Periods Ago"} entry — All-Time PB effect is shown above. Climbers points will be calculated after save using the verified source order.` : !classification || submittedScore === null ? "Enter the score to calculate the protected result." : classification === "FIRST" ? "FIRST — establishes a PB — 0 Climbers points." : classification === "EQUAL" ? "EQUAL — tie does not change the PB — 0 Climbers points." : classification === "WORSE" ? "WORSE — current PB remains unchanged — 0 Climbers points." : points ? `BETTER — passes ${points} canonical player${points === 1 ? "" : "s"} — ${points} Climbers point${points === 1 ? "" : "s"}.` : "BETTER — PB improves but no canonical players are passed — 0 Climbers points."

  if (finished) return <AdminRecordsShell><nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/history" className={styles.button}>Records history</a></nav><AdminRecordsHero title="Intake session finished" description="The saved entries below were added during this admin intake session." /><SessionLog entries={sessionEntries} /></AdminRecordsShell>
  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/backfill" className={styles.button}>Late / Backfill tools</a><a href="/admin/records/history" className={styles.button}>Records history</a><a href="/admin/records/climbers" className={styles.button}>Climbers</a></nav>
    <AdminRecordsHero title="All-Time Intake" description="Enter one player at a time. The protected preview preserves the selected period, authoritative course pars, PB effect, and Climbers result before any save." />
    <AdminGlassCard>
      <div className="grid gap-5 md:grid-cols-4">
        <label className={styles.field}>Climbers period<select className={styles.select} value={period} onChange={(event) => { setPeriod(event.target.value as Period); setVerifiedDate(""); setVerifiedOrder(""); verifiedSourceBatchRef.current = crypto.randomUUID(); invalidatePreview() }}><option value="current">CURRENT PERIOD — DEFAULT</option><option value="previous">PREVIOUS PERIOD{previousSeason ? "" : " — UNAVAILABLE"}</option><option value="two_periods_ago">TWO PERIODS AGO{twoPeriodsAgoSeason ? "" : " — UNAVAILABLE"}</option></select></label>
        <label className={styles.field}>Course<select className={styles.select} value={courseId} onChange={(event) => { setCourseId(event.target.value); setBest(null); setCourseBests([]); setHoles(emptyHoles()); setScoreText(""); invalidatePreview() }}><option value="">Choose an Easy/Hard course</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.difficulty} · {item.code}</option>)}</select></label>
        <label className={styles.field}>Search Global Players<input className={styles.input} value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Filter canonical players" aria-label="Search canonical Global Players" /></label>
        <label className={styles.field}>Canonical Global Player<select className={styles.select} value={playerId} onChange={(event) => { setPlayerId(event.target.value); setBest(null); setCourseBests([]); invalidatePreview() }} aria-label="Canonical Global Player"><option value="">{playerLoading ? "Loading canonical Global Players…" : "Choose one player"}</option>{filteredPlayers.map((item) => <option key={item.id} value={item.id}>{item.screen_name}</option>)}</select></label>
      </div>
      {isVerifiedPeriod && <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-950/20 p-4"><strong className="block text-sm text-amber-100">AUTHORITATIVE BACKLOG CHRONOLOGY</strong><p className="mt-1 text-xs text-slate-300">Use the date the result was posted/submitted and its source-backed period-wide posting order. The admin entry time is never used for Climbers calculation. A protected legacy period accepts only its next documented order; if the source belongs earlier, automatic validation blocks the save instead of guessing.</p><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className={styles.field}>Source-post date<input className={styles.input} type="date" value={verifiedDate} onChange={(event) => { setVerifiedDate(event.target.value); invalidatePreview() }} /></label><label className={styles.field}>Period posting/source order<input className={styles.input} inputMode="numeric" pattern="[0-9]*" value={verifiedOrder} onChange={(event) => { setVerifiedOrder(event.target.value.replace(/\D/g, "")); invalidatePreview() }} placeholder="1, 2, 3…" /></label></div><p className="mt-2 text-xs text-amber-100">ADD AGAIN advances the source order. ADD AGAIN SC keeps the same date/order because every player on that physical card uses one shared pre-card PB snapshot.</p></div>}
        <div className="mt-5 grid gap-4 md:grid-cols-3"><label className={styles.field}>Entry method<select className={styles.select} value={entryType} onChange={(event) => { setEntryType(event.target.value as NormalEntryType); invalidatePreview() }}><option value="full_card">18-hole scorecard</option><option value="quick_score">Quick Score</option></select></label><label className={styles.field}>Source / provenance<input className={styles.input} value={source} onChange={(event) => { sourceWasChangedRef.current = true; setSource(event.target.value); invalidatePreview() }} /></label><label className={styles.field}>Reference<input className={styles.input} value={reference} onChange={(event) => { setReference(event.target.value); invalidatePreview() }} placeholder="URL, message, or source row" /></label><label className={`${styles.field} md:col-span-3`}>Notes<textarea className={styles.textarea} value={notes} onChange={(event) => { setNotes(event.target.value); invalidatePreview() }} /></label></div>
      {course && <p className={styles.sectionKicker}>Selected {course.difficulty} · authoritative total par: {course.par ?? "not loaded"}. Selecting data is read-only and never creates an observation, PB, season, or Climbers event.</p>}
      {course && player && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-950/20 p-3" aria-live="polite"><strong className="block text-sm text-amber-100">{bestLoading ? "PB LOOKUP PENDING" : `CURRENT ALL-TIME PB: ${formatPb(best?.score ?? null)}`}</strong>{best && <span className="block text-xs text-amber-50">NEED TO BEAT: {formatPb(best.score)}</span>}{submittedScore !== null && !bestLoading && <span className="mt-2 block text-xs font-bold text-amber-100">{compareRelativeScoreToPb(submittedScore, best?.score ?? null)}</span>}{isVerifiedPeriod && <span className="mt-2 block text-xs text-amber-100">The selected completed period and source chronology are authoritative. Saving automatically replays that non-finalized period and returns the actual Climbers result.</span>}<span className="mt-1 block text-xs text-slate-300">Read-only lookup. Selecting a player or course never creates an observation, season, or Climbers event.</span></div>}
    </AdminGlassCard>
    <AdminGlassCard>
      <div><h2 className={styles.sectionHeading}>Optional original scorecard</h2><p className={styles.sectionKicker}>The image is supporting evidence only. Manually entered scores remain authoritative.</p></div>
      <ScorecardEvidence key={scorecardUrl ?? "empty-scorecard"} file={scorecardFile} objectUrl={scorecardUrl} onSelect={selectScorecard} onClear={clearScorecard} />
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className={styles.sectionHeading}>{entryType === "full_card" ? "18-hole scorecard" : "Quick Score"}</h2><p className={styles.sectionKicker}>{entryType === "full_card" ? "HOLE · PAR · SCORE — all 18 holes stay in one compact row." : "Enter the final relative score without transcribing hole data."}</p></div>{entryType === "full_card" && course && !validHolePars(course) && <span className="text-sm font-bold text-amber-200">Authoritative pars unavailable — save blocked</span>}</div>
      {entryType === "full_card" ? <div className="mt-5"><div className={scorecardStyles.scorecardScroller}><table className={scorecardStyles.scorecard} data-testid="normal-one-player-scorecard"><thead><tr><th scope="row">HOLE</th>{Array.from({ length: 18 }, (_, index) => <th key={index} scope="col">{index + 1}</th>)}</tr><tr><th scope="row">PAR</th>{Array.from({ length: 18 }, (_, index) => <td className={scorecardStyles.parCell} key={index}>{holePars[index] ?? "—"}</td>)}</tr></thead><tbody><tr><th scope="row">SCORE</th>{holes.map((value, index) => <td key={index}><input className={scorecardStyles.scoreInput} data-normal-hole-index={index} aria-label={`Score hole ${index + 1}`} inputMode="numeric" pattern="[0-9]*" type="text" value={value} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { updateHole(index, event.target.value); invalidatePreview() }} onWheel={(event) => event.currentTarget.blur()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); focusAfterHole(index, event.currentTarget.value) } }} /></td>)}</tr></tbody></table></div><p className={scorecardStyles.scorecardHint}>Scores advance immediately after each valid hole score. Use the horizontal scroll on smaller screens; no hole pars are inferred.</p></div> : <label className={`${styles.field} mt-5 max-w-sm`}>Final score relative to par<input className={styles.input} inputMode="numeric" value={scoreText} onChange={(event) => { setScoreText(event.target.value); invalidatePreview() }} placeholder="-25, 0, or 5" /></label>}
      {needsPar && <p role="alert" className={`${styles.notice} mt-4`}>This course cannot save a full card until its authoritative total par and all 18 positive hole pars are available.</p>}
      {fullStats && <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 md:grid-cols-8">{[["Strokes", fullStats.totalStrokes], ["Relative", fullStats.scoreRelativeToPar], ["HIO", fullStats.hn1Count], ["Pars", fullStats.pars], ["Birdies", fullStats.birdies], ["Bogeys", fullStats.bogeys], ["Eagles+", fullStats.eagles], ["Other", fullStats.otherHoles]].map(([label, value]) => <div className="rounded-lg border border-sky-300/20 bg-slate-950/40 p-2 text-center" key={label}><span className="block text-xs text-slate-400">{label}</span><strong>{value}</strong></div>)}</div>}
    </AdminGlassCard>
      <AdminGlassCard><h2 className={styles.sectionHeading}>Protected validation</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><span className="block text-xs text-slate-400">Player</span><strong>{player?.screen_name ?? "—"}</strong></div><div><span className="block text-xs text-slate-400">Course</span><strong>{course ? `${course.display_name} · ${course.difficulty}` : "—"}</strong></div><div><span className="block text-xs text-slate-400">Submitted score</span><strong>{submittedScore ?? "—"}</strong></div><div><span className="block text-xs text-slate-400">Classification</span><strong>{periodPreview?.all_time_classification ?? classification ?? "—"}</strong></div><div><span className="block text-xs text-slate-400">New PB</span><strong>{formatPb(periodPreview?.new_pb_score ?? (classification === "FIRST" || classification === "BETTER" ? submittedScore : best?.score ?? null))}</strong></div><div><span className="block text-xs text-slate-400">Climbers</span><strong>{isVerifiedPeriod ? "Calculated automatically by protected period chronology" : `${points} points`}</strong></div><div><span className="block text-xs text-slate-400">Target period</span><strong>{targetPeriod}</strong></div><div><span className="block text-xs text-slate-400">Status</span><strong>{busy ? "VALIDATING + SAVING" : previewReady ? "VALIDATED" : "READY TO VALIDATE ON SAVE"}</strong></div></div>{periodPreview?.replay_mode === "LEGACY_V1_APPEND" && <p className={styles.sectionKicker}>Protected legacy history detected. This entry is append-only; the existing 12 observations and 281 points are not rewritten.</p>}<p role="status" className={styles.sectionKicker}>{previewText} Clicking an ADD action performs the protected validation automatically and saves only if it passes.</p><div className="mt-4 flex flex-wrap gap-3"><button ref={nextActionRef} className={styles.buttonSuccess} disabled={busy || loading || bestLoading || Boolean(validateEntryForPreview())} onClick={() => void saveEntry("add_again")}>{busy ? "SAVING…" : "ADD AGAIN"}</button><button className={styles.buttonSuccess} disabled={busy || loading || bestLoading || Boolean(validateEntryForPreview()) || !scorecardFile} title={scorecardFile ? "Keep this scorecard and course for another player" : "Select a scorecard to reuse it"} onClick={() => void saveEntry("add_again_scorecard")}>{busy ? "SAVING…" : "ADD AGAIN SC"}</button><button className={styles.buttonPrimary} disabled={busy || loading || bestLoading || Boolean(validateEntryForPreview())} onClick={() => void saveEntry("finish")}>{busy ? "SAVING…" : <>ADD &amp; FINISH</>}</button></div>{message && <p role="status" className={styles.sectionKicker}>{message}</p>}{error && <p role="alert" className={styles.empty}>{error}</p>}</AdminGlassCard>
    <SessionLog entries={sessionEntries} />
  </AdminRecordsShell>
}

function SessionLog({ entries }: { entries: SessionEntry[] }) {
  return <AdminGlassCard><h2 className={styles.sectionHeading}>SESSION ENTRIES</h2>{entries.length === 0 ? <p className={styles.sectionKicker}>Saved entries from this intake session will appear here.</p> : <div className="mt-4 space-y-2">{entries.map((entry, index) => <div className="grid gap-2 rounded-lg border border-sky-300/15 bg-slate-950/35 p-3 text-sm lg:grid-cols-[minmax(10rem,1fr)_minmax(18rem,2fr)_auto] lg:items-center" key={`${entry.player}-${index}`}><div><strong>{index + 1}. {entry.player}</strong><span className="block text-slate-300">{entry.course}</span></div><div><span className="block">Score {entry.score} · PB {formatPb(entry.pbBefore)} → {formatPb(entry.pbAfter)} · {entry.points} Climbers</span><span className="block text-slate-300">{entry.period} · Scorecard {entry.scorecard} · Saved {entry.savedAt}</span></div><span className="font-bold text-emerald-300">{entry.status}</span></div>)}</div>}</AdminGlassCard>
}
