"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import { sha256Hex } from "@/lib/all-time/normal-records"
import type { BackfillPrecision } from "@/lib/all-time/late-backfill"
import { supabase } from "@/lib/supabase"

type Course = { id: string; code: string; display_name: string; difficulty: "Easy" | "Hard" }
type Player = { id: string; screen_name: string }
type Existing = { course_id: string; player_id: string; score: number; authoritative_submitted_at: string | null; authoritative_submitted_date: string; authoritative_submission_order: number | null; source_label: string | null; status: string }
type Preview = { action: string; course_id: string; player_id: string; player_name: string; course_name: string; difficulty: string; authoritative_submitted_at: string | null; authoritative_submitted_date: string; authoritative_submission_order: number | null; authoritative_time_precision: BackfillPrecision; recorded_at: string; old_pb_score: number | null; submitted_score: number; classification: "FIRST" | "BETTER" | "EQUAL" | "WORSE"; new_pb_score: number | null; passed_player_ids: string[]; climbers_points: number; target_season_id: string | null; target_season_status: string; target_season_label: string; ordering_status: string; ordering_issue: string | null; confirmation_token?: string }
type ValidatedInput = { error: string } | { score: number; submittedAt: string | null; submittedDate: string; submittedOrder: number | null }

const periodStart = "2026-08-15", periodEnd = "2026-08-28"

function parseScore(value: string) { return /^-?\d+$/.test(value.trim()) ? Number(value) : null }

export default function LateBackfillPage() {
  const [courses, setCourses] = useState<Course[]>([]), [players, setPlayers] = useState<Player[]>([]), [existing, setExisting] = useState<Existing[]>([])
  const [courseId, setCourseId] = useState(""), [playerId, setPlayerId] = useState(""), [scoreText, setScoreText] = useState("")
  const [precision, setPrecision] = useState<BackfillPrecision>("exact"), [timestamp, setTimestamp] = useState(""), [date, setDate] = useState(""), [order, setOrder] = useState("")
  const [source, setSource] = useState(""), [reference, setReference] = useState(""), [notes, setNotes] = useState("")
  const [entryKey, setEntryKey] = useState(() => crypto.randomUUID()), [preview, setPreview] = useState<Preview | null>(null), [previewFingerprint, setPreviewFingerprint] = useState(""), [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("")

  useEffect(() => {
    void (async () => {
      const [courseResult, playerResult, existingResult] = await Promise.all([
        supabase.from("all_time_courses").select("id,code,display_name,difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]).order("display_name"),
        supabase.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
        supabase.from("all_time_late_backfill_audit").select("course_id,player_id,submitted_score,authoritative_submitted_at,authoritative_submitted_date,authoritative_submission_order,source_label,status").order("authoritative_submitted_date", { ascending: false }),
      ])
      const queryError = courseResult.error || playerResult.error || existingResult.error
      if (queryError) setError(queryError.message)
      const nextCourses = (courseResult.data ?? []) as Course[], nextPlayers = (playerResult.data ?? []) as Player[]
      setCourses(nextCourses); setPlayers(nextPlayers); setExisting((existingResult.data ?? []).map((row) => ({ ...row, score: row.submitted_score })) as Existing[])
      setCourseId(nextCourses[0]?.id ?? ""); setPlayerId(nextPlayers[0]?.id ?? ""); setLoading(false)
    })()
  }, [])

  const course = courses.find((item) => item.id === courseId) ?? null, playerMap = useMemo(() => new Map(players.map((item) => [item.id, item.screen_name])), [players])
  const likelyDuplicate = useMemo(() => {
    const score = parseScore(scoreText); if (score === null || !courseId || !playerId || !source.trim()) return null
    let candidateDate = date
    if (precision === "exact" && timestamp) { const parsed = new Date(timestamp); if (Number.isNaN(parsed.getTime())) return null; candidateDate = parsed.toISOString().slice(0, 10) }
    return existing.find((row) => row.course_id === courseId && row.player_id === playerId && row.score === score && row.authoritative_submitted_date === candidateDate && row.source_label?.trim() === source.trim() && row.status !== "voided") ?? null
  }, [courseId, date, existing, playerId, precision, scoreText, source, timestamp])

  function validate(): ValidatedInput {
    const score = parseScore(scoreText)
    if (score === null) return { error: "Enter a valid integer final score." }
    if (!course || !playerId) return { error: "Select a course and canonical player." }
    if (!source.trim()) return { error: "A source or provenance label is required." }
    if (precision === "exact") {
      const parsed = new Date(timestamp)
      if (!timestamp || Number.isNaN(parsed.getTime())) return { error: "Enter an authoritative ISO 8601 timestamp with timezone, for example 2026-08-16T14:30:00Z." }
      const submittedDate = parsed.toISOString().slice(0, 10)
      if (submittedDate < periodStart || submittedDate > periodEnd) return { error: "The authoritative timestamp must fall within Aug 15–Aug 28, 2026." }
      return { score, submittedAt: parsed.toISOString(), submittedDate, submittedOrder: null }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < periodStart || date > periodEnd) return { error: "The authoritative date must fall within Aug 15–Aug 28, 2026." }
    if (!/^\d+$/.test(order) || Number(order) < 1) return { error: "Date-only evidence requires a positive source-backed ordering number." }
    return { score, submittedAt: null, submittedDate: date, submittedOrder: Number(order) }
  }

  async function buildRequest() {
    const validated = validate()
    if ("error" in validated) { setError(validated.error); return null }
    const fingerprint = await sha256Hex(JSON.stringify({ courseId, playerId, score: validated.score, authoritative_submitted_at: validated.submittedAt, authoritative_submitted_date: validated.submittedDate, authoritative_submission_order: validated.submittedOrder, authoritative_time_precision: precision, source: source.trim(), reference: reference.trim(), notes: notes.trim() }))
    return { fingerprint, args: { p_course_id: courseId, p_player_id: playerId, p_entry_key: entryKey, p_fingerprint: fingerprint, p_score: validated.score, p_authoritative_submitted_at: validated.submittedAt, p_authoritative_submitted_date: precision === "exact" ? null : validated.submittedDate, p_authoritative_submission_order: validated.submittedOrder, p_authoritative_time_precision: precision, p_source_label: source.trim(), p_provenance_reference: reference.trim() || null, p_notes: notes.trim() || null } }
  }

  async function runPreview() {
    setBusy(true); setError(""); setMessage(""); setPreview(null); setConfirmed(false)
    try {
      const request = await buildRequest(); if (!request) return
      const result = await supabase.rpc("preview_all_time_late_backfill_entry", request.args)
      if (result.error) throw result.error
      const nextPreview = result.data as Preview
      setPreview(nextPreview); setPreviewFingerprint(request.fingerprint)
      if (nextPreview.action === "already_saved") setMessage("This fingerprint is already saved; no duplicate write is available.")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The protected backfill preview could not be loaded.") } finally { setBusy(false) }
  }

  async function save() {
    setBusy(true); setError(""); setMessage("")
    try {
      if (!preview?.confirmation_token || !confirmed) throw new Error("Review the preview and explicitly confirm it before saving.")
      const request = await buildRequest(); if (!request) return
      if (request.fingerprint !== previewFingerprint) throw new Error("The entry changed after preview; run a fresh preview before saving.")
      const result = await supabase.rpc("record_all_time_late_backfill_entry", { ...request.args, p_confirmation_token: preview.confirmation_token })
      if (result.error) throw result.error
      setMessage("Late/backdated submission saved through the protected audit path. It will remain pending until the historical Climbers season is explicitly created and replayed.")
      setPreview(result.data as Preview); setConfirmed(false); setEntryKey(crypto.randomUUID())
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The protected backfill could not be saved.") } finally { setBusy(false) }
  }

  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/entry" className={styles.button}>Normal entry</a><a href="/admin/records/history" className={styles.button}>Records history</a><a href="/admin/records/climbers" className={styles.button}>Climbers</a></nav>
    <AdminRecordsHero title="Late / Backdated Submission" description="For legitimate older submissions that were not entered at the time. This is separate from the historical workbook importer and requires source-backed chronology." />
    <AdminGlassCard><p className={styles.sectionKicker}><strong>Target period: Aug 15–Aug 28, 2026</strong> · 2026-08-15T00:00:00Z through 2026-08-29T00:00:00Z. No Climbers season is created by this page.</p><div className="grid gap-5 md:grid-cols-2"><label className={styles.field}>Course<select className={styles.select} value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.difficulty} · {item.code}</option>)}</select></label><label className={styles.field}>Canonical Global Player<select className={styles.select} value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{players.map((item) => <option key={item.id} value={item.id}>{item.screen_name}</option>)}</select></label><label className={styles.field}>Final score relative to par<input className={styles.input} inputMode="numeric" value={scoreText} onChange={(event) => setScoreText(event.target.value)} placeholder="-25, 0, or +5" /></label><label className={styles.field}>Evidence precision<select className={styles.select} value={precision} onChange={(event) => setPrecision(event.target.value as BackfillPrecision)}><option value="exact">Exact original timestamp</option><option value="date_ordered">Date known + source-backed order</option></select></label>{precision === "exact" ? <label className={styles.field}>Authoritative original timestamp (ISO 8601 with timezone)<input className={styles.input} value={timestamp} onChange={(event) => setTimestamp(event.target.value)} placeholder="2026-08-16T14:30:00Z" /></label> : <><label className={styles.field}>Authoritative original date<input className={styles.input} type="date" min={periodStart} max={periodEnd} value={date} onChange={(event) => setDate(event.target.value)} /></label><label className={styles.field}>Source-backed order on that date<input className={styles.input} inputMode="numeric" value={order} onChange={(event) => setOrder(event.target.value)} placeholder="1" /></label></>}<label className={styles.field}>Source / provenance label<input className={styles.input} value={source} onChange={(event) => setSource(event.target.value)} placeholder="Discord submission log" /></label><label className={styles.field}>Reference (optional)<input className={styles.input} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Message URL or source row" /></label><label className={`${styles.field} md:col-span-2`}>Notes (optional)<textarea className={styles.input} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>{likelyDuplicate && <p role="alert" className={styles.empty}>Possible duplicate: this player/course/score/date/source already has a non-voided backfill audit row. Review History before proceeding.</p>}<button className={styles.button} disabled={busy || loading} onClick={() => void runPreview()}>{busy ? "Preparing…" : "Preview protected backfill"}</button></AdminGlassCard>
    <AdminGlassCard><h2 className={styles.sectionHeading}>Protected preview</h2>{!preview && <p className={styles.empty}>No write is available until you generate and review a preview.</p>}{preview && preview.action === "already_saved" && <p role="status" className={styles.sectionKicker}>Exact fingerprint already exists. No duplicate write is available.</p>}{preview && preview.action !== "already_saved" && <><div className="grid gap-3 md:grid-cols-2"><div className={styles.recordRow}><span>Canonical player</span><strong>{preview.player_name}</strong></div><div className={styles.recordRow}><span>Course / difficulty</span><strong>{preview.course_name} · {preview.difficulty}</strong></div><div className={styles.recordRow}><span>Authoritative submission</span><strong>{preview.authoritative_submitted_at ?? `${preview.authoritative_submitted_date} · order ${preview.authoritative_submission_order}`}</strong></div><div className={styles.recordRow}><span>Target period</span><strong>{preview.target_season_label}</strong></div><div className={styles.recordRow}><span>Prior PB at that point</span><strong>{preview.old_pb_score ?? "First score"}</strong></div><div className={styles.recordRow}><span>Submitted score</span><strong>{preview.submitted_score}</strong></div><div className={styles.recordRow}><span>Classification</span><strong>{preview.classification}</strong></div><div className={styles.recordRow}><span>Resulting PB</span><strong>{preview.new_pb_score ?? "Unchanged"}</strong></div><div className={styles.recordRow}><span>Players passed</span><strong>{preview.passed_player_ids.length ? preview.passed_player_ids.map((id) => playerMap.get(id) ?? id).join(", ") : "Nobody"}</strong></div><div className={styles.recordRow}><span>Climbers points</span><strong>{preview.climbers_points}</strong></div></div><p className={styles.sectionKicker}>Source: {source.trim() || "—"}{reference.trim() ? ` · ${reference.trim()}` : ""}</p>{preview.ordering_status !== "deterministic" && <p role="alert" className={styles.empty}>Review required: {preview.ordering_issue ?? "chronology is not deterministic"}. Saving is blocked.</p>}{preview.target_season_status === "not_created" && <p className={styles.sectionKicker}>The target season does not exist yet. The entry can remain pending, but this page will not create the season.</p>}<label className="mt-4 flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" checked={confirmed} disabled={preview.ordering_status !== "deterministic" || !preview.confirmation_token} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the canonical player, authoritative chronology, PB calculation, passed players, points, and provenance.</span></label><button className={`${styles.button} mt-4`} disabled={busy || !confirmed || preview.ordering_status !== "deterministic" || !preview.confirmation_token} onClick={() => void save()}>{busy ? "Saving…" : "Confirm and save backfill"}</button></>}</AdminGlassCard>
    {message && <p role="status" className={styles.sectionKicker}>{message}</p>}{error && <p role="alert" className={styles.empty}>{error}</p>}
  </AdminRecordsShell>
}
