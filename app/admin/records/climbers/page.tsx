"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import { supabase } from "@/lib/supabase"
import {
  CLIMBERS_BASELINE_CUTOFF,
  CLIMBERS_BASELINE_IMPORT_KEY,
  EXPECTED_CLIMBERS_BASELINE,
  summarizeClimbersBaseline,
  validateClimbersBaselineForActivation,
  type ClimbersBaselineImportMarker,
  type ClimbersBaselineSourceRow,
} from "@/lib/all-time/climbers-baseline-activation"
import { buildCanonicalPlayerMap, resolveCanonicalPlayerDisplay } from "@/lib/all-time/climbers-ytd-display"
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
  const [seasonId, setSeasonId] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("")
  const [baselineMarker, setBaselineMarker] = useState<ClimbersBaselineImportMarker | null>(null), [baselineSourceRows, setBaselineSourceRows] = useState<ClimbersBaselineSourceRow[]>([]), [activeBaselinePlayers, setActiveBaselinePlayers] = useState(0), [baselineBusy, setBaselineBusy] = useState(false)

  async function load() {
    setLoading(true); setError("")
    const [seasonResult, eventResult, passResult, ytdResult, playerResult, courseResult, baselineMarkerResult, baselineSourceResult, baselineResult] = await Promise.all([
      supabase.from("climbers_seasons").select("id,label,starts_at,ends_at,status").order("starts_at", { ascending: false }),
      supabase.from("climbers_events").select("id,season_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,calculation_version,source_label,provenance_reference,created_at,voided_at").order("created_at", { ascending: false }),
      supabase.from("climbers_event_passes").select("event_id,passed_player_id"),
      supabase.from("climbers_year_to_date").select("player_id,points,event_count").order("points", { ascending: false }),
      supabase.from("players").select("id,screen_name").order("screen_name"),
      supabase.from("all_time_courses").select("id,code,display_name,difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]),
      supabase.from("climbers_legacy_baseline_imports").select("import_key,cutoff_at,applied_at").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY).maybeSingle(),
      supabase.from("climbers_legacy_baseline_source_rows").select("source_name,ytd_points,period_points,canonical_player_id,identity_status").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
      supabase.from("climbers_legacy_baselines").select("canonical_player_id").eq("import_key", CLIMBERS_BASELINE_IMPORT_KEY),
    ])
    const queryError = seasonResult.error || eventResult.error || passResult.error || ytdResult.error || playerResult.error || courseResult.error || baselineMarkerResult.error || baselineSourceResult.error || baselineResult.error
    if (queryError) setError(queryError.message)
    const nextSeasons = (seasonResult.data ?? []) as Season[]
    setSeasons(nextSeasons); setEvents((eventResult.data ?? []) as Event[]); setPasses((passResult.data ?? []) as Pass[]); setYtd((ytdResult.data ?? []) as Ytd[]); setPlayers((playerResult.data ?? []) as Player[]); setCourses((courseResult.data ?? []) as Course[]); setSeasonId((current) => current || nextSeasons.find((season) => season.status === "active")?.id || nextSeasons[0]?.id || ""); setLoading(false)
    setBaselineMarker((baselineMarkerResult.data ?? null) as ClimbersBaselineImportMarker | null); setBaselineSourceRows((baselineSourceResult.data ?? []) as ClimbersBaselineSourceRow[]); setActiveBaselinePlayers((baselineResult.data ?? []).length)
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [])

  const playerMap = useMemo(() => buildCanonicalPlayerMap(players), [players]), courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])
  const seasonEvents = events.filter((event) => event.season_id === seasonId && !event.voided_at), season = seasons.find((item) => item.id === seasonId)
  const standings = useMemo(() => { const totals = new Map<string, number>(); for (const event of seasonEvents) totals.set(event.player_id, (totals.get(event.player_id) ?? 0) + event.points); return [...totals.entries()].sort((a, b) => b[1] - a[1] || (playerMap.get(a[0]) ?? "").localeCompare(playerMap.get(b[0]) ?? "")) }, [playerMap, seasonEvents])
  const passMap = useMemo(() => { const map = new Map<string, string[]>(); for (const pass of passes) map.set(pass.event_id, [...(map.get(pass.event_id) ?? []), playerMap.get(pass.passed_player_id) ?? pass.passed_player_id]); return map }, [passes, playerMap])

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
    <LegacyBaselineIdentityReview />
    <AdminGlassCard><h2 className={styles.sectionHeading}>Legacy baseline activation</h2><p className={styles.sectionKicker}>Activate only the verified workbook baseline. This does not create a Climbers season or event.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Source names", baselineSummary.sourceRows], ["Canonical players", baselineSummary.canonicalPlayers], ["July points", baselineSummary.julyPoints], ["August points", baselineSummary.augustPoints], ["Combined YTD", baselineSummary.combinedPoints]].map(([label, value]) => <div className={styles.recordRow} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className={styles.meta}>Cutoff: {new Date(CLIMBERS_BASELINE_CUTOFF).toLocaleString()} · {baselineMarker?.applied_at ? `Applied ${new Date(baselineMarker.applied_at).toLocaleString()}` : "Not activated"}</p>{baselineMarker?.applied_at ? <p className={styles.sectionKicker}>The legacy baseline is active. New YTD totals will be legacy baseline plus post-cutoff Climbers events.</p> : <><ul className="mt-3 list-disc pl-5 text-sm text-slate-300">{baselineValidation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><button type="button" data-testid="activate-climbers-baseline" className={`${styles.button} mt-4`} disabled={baselineBusy || !baselineReady} onClick={() => void activateBaseline()}>{baselineBusy ? "Verifying…" : "ACTIVATE VERIFIED LEGACY CLIMBERS BASELINE"}</button></>}</AdminGlassCard>
    <AdminGlassCard><div className="flex flex-wrap items-end gap-4"><label className={styles.field}>Season<select className={styles.select} value={seasonId} onChange={(event) => setSeasonId(event.target.value)}><option value="">Choose a season</option>{seasons.map((item) => <option key={item.id} value={item.id}>{item.label} · {statusLabel(item.status)}</option>)}</select></label><button className={styles.button} disabled={busy} onClick={() => void createSeason()}>Create 14-day season</button>{season && ["active", "awaiting_finalization"].includes(season.status) && <button className={styles.button} disabled={busy} onClick={() => void finalizeSeason()}>Finalize season</button>}</div>{season && <p className={styles.sectionKicker}>{season.label} · {new Date(season.starts_at).toLocaleString()} → {new Date(season.ends_at).toLocaleString()} · {statusLabel(season.status)}</p>}</AdminGlassCard>
    <div className="grid gap-6 lg:grid-cols-3"><AdminGlassCard><h2 className={styles.sectionHeading}>Current standings</h2>{loading && <p className={styles.empty}>Loading Climbers…</p>}{!loading && !standings.length && <p className={styles.empty}>No active Climbers events in this season.</p>}<div className="space-y-2">{standings.map(([playerId, points], index) => <div className={styles.recordRow} key={playerId}><strong>#{index + 1}</strong><span className="flex-1">{playerMap.get(playerId) ?? playerId}</span><strong>{points} pts</strong></div>)}</div></AdminGlassCard><AdminGlassCard><h2 className={styles.sectionHeading}>Year to date</h2><div className="space-y-2">{ytd.map((row) => { const display = resolveCanonicalPlayerDisplay(row.player_id, playerMap); return <div className={styles.recordRow} key={row.player_id}><span className="flex-1">{display.label}{display.diagnosticId && <span className={styles.meta}> · Diagnostic canonical ID: {display.diagnosticId}</span>}</span><span>{row.points} pts · {row.event_count} events</span></div> })}{!ytd.length && <p className={styles.empty}>No Climbers events this year.</p>}</div></AdminGlassCard><AdminGlassCard><h2 className={styles.sectionHeading}>Season history</h2><div className="space-y-2">{seasons.map((item) => <button key={item.id} className={`${styles.recordRow} w-full text-left`} onClick={() => setSeasonId(item.id)}><span className="flex-1">{item.label}</span><span>{statusLabel(item.status)}</span></button>)}{!seasons.length && <p className={styles.empty}>No Climbers seasons yet.</p>}</div></AdminGlassCard></div>
    <AdminGlassCard><h2 className={styles.sectionHeading}>Event history & people passed</h2><p className={styles.sectionKicker}>Versioned PB events are the source of standings. There is no direct total editor.</p>{seasonEvents.map((event) => <article className={styles.recordRow} key={event.id}><div className="min-w-0 flex-1"><strong>{playerMap.get(event.player_id) ?? event.player_id} · {courseMap.get(event.course_id)?.display_name ?? event.course_id} {event.difficulty}</strong><div className={styles.meta}>PB {event.old_pb_score ?? "first"} → {event.new_pb_score} · {event.points} point{event.points === 1 ? "" : "s"} · {new Date(event.created_at).toLocaleString()}</div><div className={styles.meta}>Passed: {(passMap.get(event.id) ?? []).join(", ") || "Nobody"} · {event.calculation_version}{event.source_label ? ` · ${event.source_label}` : ""}</div></div></article>)}{!seasonEvents.length && <p className={styles.empty}>No events in this season.</p>}</AdminGlassCard>
    {message && <p role="status" className={styles.sectionKicker}>{message}</p>}{error && <p role="alert" className={styles.empty}>{error}</p>}
  </AdminRecordsShell>
}
