"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import { deriveFullCardStats, entryTypeLabel, observationStatus } from "@/lib/all-time/normal-records"
import { supabase } from "@/lib/supabase"

type Course = { id: string; code: string; display_name: string; difficulty: "Easy" | "Hard"; par: number | null; hole_pars: number[] | null }
type Player = { id: string; screen_name: string }
type Observation = { id: string; card_batch_id: string | null; course_id: string; player_id: string | null; historical_player_name: string; score: number; entry_type: string; hole_strokes: number[] | null; source_label: string | null; provenance_reference: string | null; notes: string | null; observed_at: string; updated_at: string; recorded_at: string | null; recorded_by: string | null; authoritative_submitted_at: string | null; authoritative_submitted_date: string | null; authoritative_submission_order: number | null; authoritative_time_precision: string | null; voided_at: string | null; voided_by: string | null; void_reason: string | null; corrected_at: string | null }

function parseScore(value: string) { return /^-?\d+$/.test(value.trim()) ? Number(value) : null }

export default function RecordsHistoryPage() {
  const [courses, setCourses] = useState<Course[]>([]), [players, setPlayers] = useState<Player[]>([]), [rows, setRows] = useState<Observation[]>([])
  const [courseFilter, setCourseFilter] = useState(""), [playerFilter, setPlayerFilter] = useState(""), [statusFilter, setStatusFilter] = useState("all")
  const [selected, setSelected] = useState<Observation | null>(null), [mode, setMode] = useState<"edit" | "void" | null>(null), [newScore, setNewScore] = useState(""), [newHoles, setNewHoles] = useState<string[]>([]), [lateTimestamp, setLateTimestamp] = useState(""), [lateDate, setLateDate] = useState(""), [lateOrder, setLateOrder] = useState(""), [latePrecision, setLatePrecision] = useState<"exact" | "date_ordered">("exact"), [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("")

  async function load() {
    setLoading(true); setError("")
    const [courseResult, playerResult, rowResult] = await Promise.all([
      supabase.from("all_time_courses").select("id,code,display_name,difficulty,par,hole_pars").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
      supabase.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
      supabase.from("all_time_record_observations").select("id,card_batch_id,course_id,player_id,historical_player_name,score,entry_type,hole_strokes,source_label,provenance_reference,notes,observed_at,updated_at,recorded_at,recorded_by,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,authoritative_time_precision,voided_at,voided_by,void_reason,corrected_at").order("observed_at", { ascending: false }),
    ])
    const queryError = courseResult.error || playerResult.error || rowResult.error
    if (queryError) setError(queryError.message)
    setCourses((courseResult.data ?? []) as Course[]); setPlayers((playerResult.data ?? []) as Player[]); setRows((rowResult.data ?? []) as Observation[]); setLoading(false)
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [])

  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]), playerMap = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const visibleRows = useMemo(() => rows.filter((row) => (!courseFilter || row.course_id === courseFilter) && (!playerFilter || row.player_id === playerFilter) && (statusFilter === "all" || (statusFilter === "voided" ? Boolean(row.voided_at) : !row.voided_at))), [courseFilter, playerFilter, rows, statusFilter])

  function openEdit(row: Observation) { setSelected(row); setMode("edit"); setReason(""); setNewScore(String(row.score)); setNewHoles(Array.isArray(row.hole_strokes) ? row.hole_strokes.map(String) : []); setLatePrecision(row.authoritative_time_precision === "date_ordered" ? "date_ordered" : "exact"); setLateTimestamp(row.authoritative_submitted_at ?? ""); setLateDate(row.authoritative_submitted_date ?? ""); setLateOrder(row.authoritative_submission_order?.toString() ?? "") }
  async function submitCorrection() {
    if (!selected || !reason.trim()) { setError("A correction reason is required."); return }
    const course = courseMap.get(selected.course_id), fullCard = selected.entry_type === "full_card"
    let correctedScore = parseScore(newScore), correctedHoles: number[] | null = null
    const batchCard = selected.entry_type === "late_backfill" && Boolean(selected.card_batch_id)
    if (fullCard) {
      correctedHoles = newHoles.map((value) => parseScore(value) ?? NaN)
      const stats = deriveFullCardStats(correctedHoles, course?.hole_pars ?? [])
      if ("error" in stats) { setError(stats.error); return }
      correctedScore = stats.scoreRelativeToPar
    } else if (batchCard) {
      correctedHoles = newHoles.map((value) => parseScore(value) ?? NaN)
      if (correctedHoles.length !== 18 || correctedHoles.some((value) => !Number.isInteger(value) || value < 1)) { setError("A batch card correction requires 18 positive whole-number hole scores."); return }
      if (course?.par == null) { setError("This course has no authoritative total par; the batch correction is blocked."); return }
      correctedScore = correctedHoles.reduce((total, value) => total + value, 0) - course.par
    }
    if (correctedScore === null) { setError("Enter a valid integer score."); return }
    setBusy(true); setError("")
    let result
    if (batchCard) {
      result = await supabase.rpc("correct_all_time_late_backfill_batch_entry", { p_observation_id: selected.id, p_expected_updated_at: selected.updated_at, p_new_hole_strokes: correctedHoles, p_reason: reason.trim() })
    } else if (selected.entry_type === "late_backfill") {
      let submittedAt: string | null = null, submittedDate = lateDate, submittedOrder: number | null = null
      if (latePrecision === "exact") { const parsed = new Date(lateTimestamp); if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(lateTimestamp) || Number.isNaN(parsed.getTime())) { setError("Enter an authoritative ISO 8601 timestamp with timezone."); setBusy(false); return }; submittedAt = parsed.toISOString(); submittedDate = submittedAt.slice(0, 10) }
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(lateDate) || lateDate < "2026-08-15" || lateDate > "2026-08-28" || !/^\d+$/.test(lateOrder) || Number(lateOrder) < 1) { setError("Date-only correction must target Aug 15–Aug 28, 2026 with a positive source-backed order."); setBusy(false); return }
      else submittedOrder = Number(lateOrder)
      if (submittedDate < "2026-08-15" || submittedDate > "2026-08-28") { setError("Late/backdated corrections must target Aug 15–Aug 28, 2026."); setBusy(false); return }
      result = await supabase.rpc("correct_all_time_late_backfill_entry", { p_observation_id: selected.id, p_expected_updated_at: selected.updated_at, p_new_score: correctedScore, p_authoritative_submitted_at: submittedAt, p_authoritative_submitted_date: latePrecision === "exact" ? null : submittedDate, p_authoritative_submission_order: submittedOrder, p_authoritative_time_precision: latePrecision, p_reason: reason.trim() })
    } else result = await supabase.rpc("correct_all_time_record_entry", { p_observation_id: selected.id, p_expected_updated_at: selected.updated_at, p_new_score: correctedScore, p_new_hole_strokes: fullCard ? correctedHoles : null, p_reason: reason.trim() })
    if (result.error) setError(result.error.message); else { setMessage("Entry corrected and the derived best was recalculated from active history."); setSelected(null); setMode(null); await load() }
    setBusy(false)
  }
  async function submitVoid() {
    if (!selected || !reason.trim()) { setError("A void reason is required."); return }
    setBusy(true); setError("")
    const result = selected.entry_type === "late_backfill"
      ? await supabase.rpc("void_all_time_late_backfill_entry", { p_observation_id: selected.id, p_expected_updated_at: selected.updated_at, p_reason: reason.trim() })
      : await supabase.rpc("void_all_time_record_entry", { p_observation_id: selected.id, p_expected_updated_at: selected.updated_at, p_reason: reason.trim() })
    if (result.error) setError(result.error.message); else { setMessage("Entry voided with its provenance and audit trail preserved; derived best was recalculated."); setSelected(null); setMode(null); await load() }
    setBusy(false)
  }

  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/entry" className={styles.button}>Add entry</a><a href="/admin/records/backfill" className={styles.button}>Late / Backfill</a><a href="/admin/records/climbers" className={styles.button}>Climbers</a></nav>
    <AdminRecordsHero title="Records History & Corrections" description="Review source attempts chronologically. Corrections change attempts through protected RPCs; no leaderboard number is directly editable." />
    <AdminGlassCard><div className="grid gap-4 md:grid-cols-3"><label className={styles.field}>Course<select className={styles.select} value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.display_name} · {course.difficulty}</option>)}</select></label><label className={styles.field}>Player<select className={styles.select} value={playerFilter} onChange={(event) => setPlayerFilter(event.target.value)}><option value="">All players</option>{players.map((player) => <option key={player.id} value={player.id}>{player.screen_name}</option>)}</select></label><label className={styles.field}>Status<select className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All</option><option value="active">Active</option><option value="voided">Voided</option></select></label></div></AdminGlassCard>
    <AdminGlassCard><h2 className={styles.sectionHeading}>Attempt history</h2>{loading && <p className={styles.empty}>Loading history…</p>}{!loading && !visibleRows.length && <p className={styles.empty}>No source attempts match these filters.</p>}<div className="space-y-3">{visibleRows.map((row) => { const course = courseMap.get(row.course_id), player = row.player_id ? playerMap.get(row.player_id)?.screen_name : row.historical_player_name; return <article key={row.id} className={styles.recordRow}><div className="min-w-0 flex-1"><strong>{player ?? row.historical_player_name}</strong><div className={styles.meta}>{course?.display_name ?? "Unknown course"} · {course?.difficulty ?? "—"} · {new Date(row.observed_at).toLocaleString()}</div><div className={styles.meta}>{entryTypeLabel(row.entry_type)} · ST {row.score} · HN1 {row.hole_strokes ? row.hole_strokes.filter((value) => value === 1).length : "unavailable"} · {observationStatus(row)}</div>{row.entry_type === "late_backfill" && <div className={styles.meta}>Authoritative: {row.authoritative_submitted_at ?? `${row.authoritative_submitted_date ?? "date unknown"} · order ${row.authoritative_submission_order ?? "unknown"}`} · Recorded: {row.recorded_at ? new Date(row.recorded_at).toLocaleString() : "unknown"}</div>}{row.card_batch_id && <div className={styles.meta}>Card batch: {row.card_batch_id} · corrections replay the batch-aware historical path</div>}<div className={styles.meta}>{row.source_label ?? "No source label"}{row.provenance_reference ? ` · ${row.provenance_reference}` : ""}</div></div>{!row.voided_at && <div className="flex shrink-0 flex-wrap gap-2"><button className={styles.button} onClick={() => openEdit(row)}>Edit Entry</button><button className={styles.button} onClick={() => { setSelected(row); setMode("void"); setReason(""); setError("") }}>Void Incorrect Entry</button></div>}</article> })}</div></AdminGlassCard>
    {selected && mode && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="correction-title"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-white/20 bg-slate-950 p-6"><h2 id="correction-title" className={styles.sectionHeading}>{mode === "edit" ? "Edit Attempt" : "Void Incorrect Attempt"}</h2><p className={styles.sectionKicker}>{selected.historical_player_name} · OLD ST <strong>{selected.score}</strong>{mode === "edit" && " → NEW value below"}</p>{mode === "edit" && ((selected.entry_type === "full_card" || selected.card_batch_id) ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">{newHoles.map((value, index) => <label className={styles.field} key={index}>Hole {index + 1}<input className={styles.input} inputMode="numeric" value={value} onChange={(event) => setNewHoles((current) => current.map((item, hole) => hole === index ? event.target.value : item))}/></label>)}</div> : selected.entry_type === "late_backfill" ? <div className="grid gap-3 md:grid-cols-2"><label className={styles.field}>Evidence precision<select className={styles.select} value={latePrecision} onChange={(event) => setLatePrecision(event.target.value as "exact" | "date_ordered")}><option value="exact">Exact original timestamp</option><option value="date_ordered">Date + source-backed order</option></select></label>{latePrecision === "exact" ? <label className={styles.field}>Authoritative timestamp<input className={styles.input} value={lateTimestamp} onChange={(event) => setLateTimestamp(event.target.value)} /></label> : <><label className={styles.field}>Authoritative date<input className={styles.input} type="date" value={lateDate} onChange={(event) => setLateDate(event.target.value)} /></label><label className={styles.field}>Source-backed order<input className={styles.input} value={lateOrder} onChange={(event) => setLateOrder(event.target.value)} /></label></>}<label className={styles.field}>NEW score relative to par<input className={styles.input} inputMode="numeric" value={newScore} onChange={(event) => setNewScore(event.target.value)}/></label></div> : <label className={styles.field}>NEW score relative to par<input className={styles.input} inputMode="numeric" value={newScore} onChange={(event) => setNewScore(event.target.value)}/></label>)}<label className={styles.field}>Required reason<textarea className={styles.input} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Explain the source correction or void." /></label><div className="flex flex-wrap gap-3"><button className={styles.button} disabled={busy} onClick={() => void (mode === "edit" ? submitCorrection() : submitVoid())}>{busy ? "Saving…" : mode === "edit" ? "Confirm correction" : "Confirm void"}</button><button className={styles.button} disabled={busy} onClick={() => { setSelected(null); setMode(null) }}>Cancel</button></div>{error && <p role="alert" className={styles.empty}>{error}</p>}</div></div>}
    {message && <p role="status" className={styles.sectionKicker}>{message}</p>}{error && !selected && <p role="alert" className={styles.empty}>{error}</p>}
  </AdminRecordsShell>
}
