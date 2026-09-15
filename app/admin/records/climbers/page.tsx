"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import { supabase } from "@/lib/supabase"
import {
  CLIMBERS_BASELINE_CUTOFF,
  EXPECTED_CLIMBERS_BASELINE,
  summarizeClimbersBaseline,
  validateClimbersBaselineForActivation,
  type ClimbersBaselineImportMarker,
  type ClimbersBaselineSourceRow,
} from "@/lib/all-time/climbers-baseline-activation"
import { buildCanonicalPlayerMap, resolveCanonicalPlayerDisplay } from "@/lib/all-time/climbers-ytd-display"
import { formatClimbersDateRange, formatClimbersSeasonLabel } from "@/lib/climbersDisplay"
import LegacyBaselineIdentityReview from "./LegacyBaselineIdentityReview"

type Season = { id: string; label: string; starts_at: string; ends_at: string; status: "upcoming" | "active" | "awaiting_finalization" | "finalized" }
type Player = { id: string; screen_name: string | null }
type Course = { id: string; display_name: string; difficulty: "Easy" | "Hard"; code: string }
type Event = { id: string; season_id: string; player_id: string; course_id: string; difficulty: "Easy" | "Hard"; old_pb_score: number | null; new_pb_score: number; points: number; calculation_version: string; source_label: string | null; provenance_reference: string | null; created_at: string; voided_at: string | null }
type Pass = { event_id: string; passed_player_id: string }
type Ytd = { player_id: string; points: number; event_count: number }

const statusLabel = (status: Season["status"]) => status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function ClimbersAdminPage() {
  const [seasons, setSeasons] = useState<Season[]>([]), [events, setEvents] = useState<Event[]>([]), [passes, setPasses] = useState<Pass[]>([]), [ytd, setYtd] = useState<Ytd[]>([]), [players, setPlayers] = useState<Player[]>([]), [courses, setCourses] = useState<Course[]>([])
  const [seasonId, setSeasonId] = useState(""), [loading, setLoading] = useState(true), [readStatus, setReadStatus] = useState<"loading" | "ready" | "error">("loading"), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("")
  const [baselineMarker, setBaselineMarker] = useState<ClimbersBaselineImportMarker | null>(null), [baselineSourceRows, setBaselineSourceRows] = useState<ClimbersBaselineSourceRow[]>([]), [activeBaselinePlayers, setActiveBaselinePlayers] = useState(0), [baselineBusy, setBaselineBusy] = useState(false)

  async function load() {
    setLoading(true); setReadStatus("loading"); setError("")
    try {
      const response = await fetch("/api/admin/records/climbers", { cache: "no-store" })
      const payload = await response.json() as { error?: string; seasons?: Season[]; events?: Event[]; passes?: Pass[]; ytd?: Ytd[]; players?: Player[]; courses?: Course[]; baseline_marker?: ClimbersBaselineImportMarker | null; baseline_source_rows?: ClimbersBaselineSourceRow[]; active_baseline_rows?: Array<{ canonical_player_id: string }> }
      if (!response.ok) throw new Error(payload.error || "Climbers admin data could not be loaded.")
      const nextSeasons = payload.seasons || []
      setSeasons(nextSeasons); setEvents(payload.events || []); setPasses(payload.passes || []); setYtd(payload.ytd || []); setPlayers(payload.players || []); setCourses(payload.courses || []); setSeasonId((current) => current || nextSeasons.find((season) => season.status === "active")?.id || nextSeasons[0]?.id || "")
      setBaselineMarker(payload.baseline_marker || null); setBaselineSourceRows(payload.baseline_source_rows || []); setActiveBaselinePlayers((payload.active_baseline_rows || []).length); setReadStatus("ready")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Climbers admin data could not be loaded.")
      setReadStatus("error")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [])

  const playerMap = useMemo(() => buildCanonicalPlayerMap(players), [players]), courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])
  const seasonEvents = events.filter((event) => event.season_id === seasonId && !event.voided_at), season = seasons.find((item) => item.id === seasonId)
  const standings = useMemo(() => { const totals = new Map<string, number>(); for (const event of seasonEvents) totals.set(event.player_id, (totals.get(event.player_id) ?? 0) + event.points); return [...totals.entries()].sort((a, b) => b[1] - a[1] || (playerMap.get(a[0]) ?? "").localeCompare(playerMap.get(b[0]) ?? "")) }, [playerMap, seasonEvents])
  const passMap = useMemo(() => { const map = new Map<string, ReturnType<typeof resolveCanonicalPlayerDisplay>[]>(); for (const pass of passes) map.set(pass.event_id, [...(map.get(pass.event_id) ?? []), resolveCanonicalPlayerDisplay(pass.passed_player_id, playerMap)]); return map }, [passes, playerMap])
  const playerDisplay = (playerId: string) => resolveCanonicalPlayerDisplay(playerId, playerMap)

  async function createSeason() {
    const start = new Date(), end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000), label = `Climbers · ${start.toISOString().slice(0, 10)}`
    setBusy(true); const result = await supabase.rpc("create_climbers_season", { p_label: label, p_starts_at: start.toISOString(), p_ends_at: end.toISOString() }); if (result.error) setError(result.error.message); else { setMessage("New 14-day Climbers season created."); await load() } setBusy(false)
  }
  async function finalizeSeason() {
    if (!season || !window.confirm(`Finalize ${season.label}? Finalized Climbers events are protected from ordinary All-Time corrections.`)) return
    setBusy(true); const result = await supabase.rpc("finalize_climbers_season", { p_season_id: season.id }); if (result.error) setError(result.error.message); else { setMessage("Climbers season finalized; ties remain ties."); await load() } setBusy(false)
  }
  const baselineSummary = useMemo(() => summarizeClimbersBaseline(baselineSourceRows), [baselineSourceRows])
  const baselineValidation = useMemo(() => validateClimbersBaselineForActivation(baselineMarker, baselineSummary), [baselineMarker, baselineSummary])
  const baselineReady = baselineValidation.valid && baselineSourceRows.every((row) => row.identity_status === "resolved" && Boolean(row.canonical_player_id)) && activeBaselinePlayers === 0
  async function activateBaseline() {
    if (!baselineReady || !window.confirm("Activate the verified legacy Climbers baseline? This will seed the existing YTD totals and cannot be repeated.")) return
    setBaselineBusy(true); setError("")
    const result = await fetch("/api/admin/records/climbers/baseline/activate", { method: "POST", cache: "no-store" })
    const body = await result.json().catch(() => null) as { ok?: boolean; error?: string; verification?: { activeBaselinePlayers?: number; ytdTotal?: number } } | null
    if (!result.ok || !body?.ok) setError(body?.error ?? "Legacy Climbers baseline activation failed.")
    else { setMessage(`Legacy Climbers baseline activated: ${body.verification?.activeBaselinePlayers ?? EXPECTED_CLIMBERS_BASELINE.canonicalPlayers} canonical players and ${body.verification?.ytdTotal ?? EXPECTED_CLIMBERS_BASELINE.combinedPoints} YTD points.`); await load() }
    setBaselineBusy(false)
  }

  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/entry" className={styles.button}>Add entry</a><a href="/admin/records/history" className={styles.button}>Records history</a></nav>
    <AdminRecordsHero title="Climbers" description="A shared Easy/Hard PB leaderboard based only on canonical people actually passed. Ties do not pass and imported history earns no points." />
    <LegacyBaselineIdentityReview baselineActive={Boolean(baselineMarker?.applied_at)} />
    <AdminGlassCard><h2 className={styles.sectionHeading}>Legacy baseline activation</h2><p className={styles.sectionKicker}>Activate only the verified workbook baseline. This does not create a Climbers season or event.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Source names", baselineSummary.sourceRows], ["Canonical players", baselineSummary.canonicalPlayers], ["July points", baselineSummary.julyPoints], ["August points", baselineSummary.augustPoints], ["Combined YTD", baselineSummary.combinedPoints]].map(([label, value]) => <div className={styles.recordRow} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className={styles.meta}>Cutoff: {new Date(CLIMBERS_BASELINE_CUTOFF).toLocaleString()} · {baselineMarker?.applied_at ? `Applied ${new Date(baselineMarker.applied_at).toLocaleString()}` : "Not activated"}</p>{baselineMarker?.applied_at ? <p className={styles.sectionKicker}>The legacy baseline is active. New YTD totals are the active baseline plus post-cutoff Climbers events. Identity review below is cleanup only and does not replay or reactivate the baseline.</p> : <><ul className="mt-3 list-disc pl-5 text-sm text-slate-300">{baselineValidation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><button type="button" data-testid="activate-climbers-baseline" className={`${styles.button} mt-4`} disabled={baselineBusy || !baselineReady} onClick={() => void activateBaseline()}>{baselineBusy ? "Verifying…" : "ACTIVATE VERIFIED LEGACY CLIMBERS BASELINE"}</button></>}</AdminGlassCard>
    <AdminGlassCard><div className="flex flex-wrap items-end gap-4"><label className={styles.field}>Season<select className={styles.select} value={seasonId} onChange={(event) => setSeasonId(event.target.value)}><option value="">Choose a season</option>{seasons.map((item) => <option key={item.id} value={item.id}>{formatClimbersSeasonLabel(item.label, item.starts_at, item.ends_at)} · {statusLabel(item.status)}</option>)}</select></label><button className={styles.button} disabled={busy} onClick={() => void createSeason()}>Create 14-day season</button>{season && ["active", "awaiting_finalization"].includes(season.status) && <button className={styles.button} disabled={busy} onClick={() => void finalizeSeason()}>Finalize season</button>}</div>{season && <p className={styles.sectionKicker}>{formatClimbersSeasonLabel(season.label, season.starts_at, season.ends_at)} · {formatClimbersDateRange(season.starts_at, season.ends_at)} · {statusLabel(season.status)}</p>}</AdminGlassCard>
    <div className="grid gap-6 lg:grid-cols-3"><AdminGlassCard><h2 className={styles.sectionHeading}>Current standings</h2>{loading && <p className={styles.empty}>Loading Climbers…</p>}{!loading && readStatus === "error" && <p className={styles.empty}>Current standings could not be loaded.</p>}{!loading && readStatus === "ready" && !standings.length && <p className={styles.empty}>No active Climbers events in this season.</p>}<div className="space-y-2">{standings.map(([playerId, points], index) => { const display = playerDisplay(playerId); return <div className={styles.recordRow} key={playerId}><strong>#{index + 1}</strong><span className="flex-1" title={display.diagnosticId ?? undefined}>{display.label}{display.diagnosticId && <span className={styles.meta}> · unresolved identity</span>}</span><strong>{points} pts</strong></div> })}</div></AdminGlassCard><AdminGlassCard><h2 className={styles.sectionHeading}>Year to date</h2><div className="space-y-2">{readStatus === "loading" && <p className={styles.empty}>Loading Year-to-date Climbers events…</p>}{readStatus === "error" && <p className={styles.empty}>Year-to-date data could not be loaded.</p>}{readStatus === "ready" && ytd.map((row) => { const display = playerDisplay(row.player_id); return <div className={styles.recordRow} key={row.player_id}><span className="flex-1" title={display.diagnosticId ?? undefined}>{display.label}{display.diagnosticId && <span className={styles.meta}> · unresolved identity</span>}</span><span>{row.points} pts · {row.event_count} events</span></div> })}{readStatus === "ready" && !ytd.length && <p className={styles.empty}>No Climbers events this year.</p>}</div></AdminGlassCard><AdminGlassCard><h2 className={styles.sectionHeading}>Season history</h2><div className="space-y-2">{seasons.map((item) => <button key={item.id} className={`${styles.recordRow} w-full text-left`} onClick={() => setSeasonId(item.id)}><span className="flex-1">{formatClimbersSeasonLabel(item.label, item.starts_at, item.ends_at)}</span><span>{statusLabel(item.status)}</span></button>)}{readStatus === "ready" && !seasons.length && <p className={styles.empty}>No Climbers seasons yet.</p>}</div></AdminGlassCard></div>
    <AdminGlassCard><h2 className={styles.sectionHeading}>Event history &amp; people passed</h2><p className={styles.sectionKicker}>Versioned PB events are the source of standings. There is no direct total editor.</p>{seasonEvents.map((event) => { const climber = playerDisplay(event.player_id); const passed = passMap.get(event.id) ?? []; return <article className={styles.eventCard} key={event.id}><div className={styles.eventHeader}><strong title={climber.diagnosticId ?? undefined}>{climber.label}</strong><span>{courseMap.get(event.course_id)?.display_name ?? "Unknown course"} · {event.difficulty}</span></div><div className={styles.eventMeta}>PB {event.old_pb_score ?? "first"} → {event.new_pb_score} · {event.points} point{event.points === 1 ? "" : "s"} · {new Date(event.created_at).toLocaleString()}</div><div className={styles.eventMeta}><strong>Passed:</strong> {passed.length ? <span className={styles.passedList}>{passed.map((display, index) => <span key={`${event.id}-${index}`} title={display.diagnosticId ?? undefined}>{display.label}{display.diagnosticId && <small> · unresolved identity</small>}</span>)}</span> : "Nobody"}</div><div className={styles.eventMeta}>{event.calculation_version}{event.source_label ? ` · ${event.source_label}` : ""}</div></article> })}{readStatus === "ready" && !seasonEvents.length && <p className={styles.empty}>No events in this season.</p>}</AdminGlassCard>
    {message && <p role="status" className={styles.sectionKicker}>{message}</p>}{error && <p role="alert" className={styles.empty}>{error}</p>}
  </AdminRecordsShell>
}
