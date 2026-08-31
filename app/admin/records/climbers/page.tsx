"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminGlassCard, AdminRecordsHero, AdminRecordsShell, adminRecordsStyles as styles } from "@/components/admin/records/AdminRecordsUI"
import { supabase } from "@/lib/supabase"
import LegacyBaselineIdentityReview from "./LegacyBaselineIdentityReview"

type Season = { id: string; label: string; starts_at: string; ends_at: string; status: "upcoming" | "active" | "awaiting_finalization" | "finalized" }
type Player = { id: string; screen_name: string }
type Course = { id: string; display_name: string; difficulty: "Easy" | "Hard"; code: string }
type Event = { id: string; season_id: string; player_id: string; course_id: string; difficulty: "Easy" | "Hard"; old_pb_score: number | null; new_pb_score: number; points: number; calculation_version: string; source_label: string | null; provenance_reference: string | null; created_at: string; voided_at: string | null }
type Pass = { event_id: string; passed_player_id: string }
type Ytd = { player_id: string; points: number; event_count: number }

const statusLabel = (status: Season["status"]) => status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function ClimbersAdminPage() {
  const [seasons, setSeasons] = useState<Season[]>([]), [events, setEvents] = useState<Event[]>([]), [passes, setPasses] = useState<Pass[]>([]), [ytd, setYtd] = useState<Ytd[]>([]), [players, setPlayers] = useState<Player[]>([]), [courses, setCourses] = useState<Course[]>([])
  const [seasonId, setSeasonId] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("")

  async function load() {
    setLoading(true); setError("")
    const [seasonResult, eventResult, passResult, ytdResult, playerResult, courseResult] = await Promise.all([
      supabase.from("climbers_seasons").select("id,label,starts_at,ends_at,status").order("starts_at", { ascending: false }),
      supabase.from("climbers_events").select("id,season_id,player_id,course_id,difficulty,old_pb_score,new_pb_score,points,calculation_version,source_label,provenance_reference,created_at,voided_at").order("created_at", { ascending: false }),
      supabase.from("climbers_event_passes").select("event_id,passed_player_id"),
      supabase.from("climbers_year_to_date").select("player_id,points,event_count").order("points", { ascending: false }),
      supabase.from("players").select("id,screen_name").eq("active", true).order("screen_name"),
      supabase.from("all_time_courses").select("id,code,display_name,difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"]),
    ])
    const queryError = seasonResult.error || eventResult.error || passResult.error || ytdResult.error || playerResult.error || courseResult.error
    if (queryError) setError(queryError.message)
    const nextSeasons = (seasonResult.data ?? []) as Season[]
    setSeasons(nextSeasons); setEvents((eventResult.data ?? []) as Event[]); setPasses((passResult.data ?? []) as Pass[]); setYtd((ytdResult.data ?? []) as Ytd[]); setPlayers((playerResult.data ?? []) as Player[]); setCourses((courseResult.data ?? []) as Course[]); setSeasonId((current) => current || nextSeasons.find((season) => season.status === "active")?.id || nextSeasons[0]?.id || ""); setLoading(false)
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [])

  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player.screen_name])), [players]), courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses])
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

  return <AdminRecordsShell>
    <nav className={styles.nav}><a href="/admin/records" className={styles.button}>← Records hub</a><a href="/admin/records/entry" className={styles.button}>Add entry</a><a href="/admin/records/history" className={styles.button}>Records history</a></nav>
    <AdminRecordsHero title="Climbers" description="A shared Easy/Hard PB leaderboard based only on canonical people actually passed. Ties do not pass and imported history earns no points." />
    <LegacyBaselineIdentityReview />
    <AdminGlassCard><div className="flex flex-wrap items-end gap-4"><label className={styles.field}>Season<select className={styles.select} value={seasonId} onChange={(event) => setSeasonId(event.target.value)}><option value="">Choose a season</option>{seasons.map((item) => <option key={item.id} value={item.id}>{item.label} · {statusLabel(item.status)}</option>)}</select></label><button className={styles.button} disabled={busy} onClick={() => void createSeason()}>Create 14-day season</button>{season && ["active", "awaiting_finalization"].includes(season.status) && <button className={styles.button} disabled={busy} onClick={() => void finalizeSeason()}>Finalize season</button>}</div>{season && <p className={styles.sectionKicker}>{season.label} · {new Date(season.starts_at).toLocaleString()} → {new Date(season.ends_at).toLocaleString()} · {statusLabel(season.status)}</p>}</AdminGlassCard>
    <div className="grid gap-6 lg:grid-cols-3"><AdminGlassCard><h2 className={styles.sectionHeading}>Current standings</h2>{loading && <p className={styles.empty}>Loading Climbers…</p>}{!loading && !standings.length && <p className={styles.empty}>No active Climbers events in this season.</p>}<div className="space-y-2">{standings.map(([playerId, points], index) => <div className={styles.recordRow} key={playerId}><strong>#{index + 1}</strong><span className="flex-1">{playerMap.get(playerId) ?? playerId}</span><strong>{points} pts</strong></div>)}</div></AdminGlassCard><AdminGlassCard><h2 className={styles.sectionHeading}>Year to date</h2><div className="space-y-2">{ytd.map((row) => <div className={styles.recordRow} key={row.player_id}><span className="flex-1">{playerMap.get(row.player_id) ?? row.player_id}</span><span>{row.points} pts · {row.event_count} events</span></div>)}{!ytd.length && <p className={styles.empty}>No Climbers events this year.</p>}</div></AdminGlassCard><AdminGlassCard><h2 className={styles.sectionHeading}>Season history</h2><div className="space-y-2">{seasons.map((item) => <button key={item.id} className={`${styles.recordRow} w-full text-left`} onClick={() => setSeasonId(item.id)}><span className="flex-1">{item.label}</span><span>{statusLabel(item.status)}</span></button>)}{!seasons.length && <p className={styles.empty}>No Climbers seasons yet.</p>}</div></AdminGlassCard></div>
    <AdminGlassCard><h2 className={styles.sectionHeading}>Event history & people passed</h2><p className={styles.sectionKicker}>Versioned PB events are the source of standings. There is no direct total editor.</p>{seasonEvents.map((event) => <article className={styles.recordRow} key={event.id}><div className="min-w-0 flex-1"><strong>{playerMap.get(event.player_id) ?? event.player_id} · {courseMap.get(event.course_id)?.display_name ?? event.course_id} {event.difficulty}</strong><div className={styles.meta}>PB {event.old_pb_score ?? "first"} → {event.new_pb_score} · {event.points} point{event.points === 1 ? "" : "s"} · {new Date(event.created_at).toLocaleString()}</div><div className={styles.meta}>Passed: {(passMap.get(event.id) ?? []).join(", ") || "Nobody"} · {event.calculation_version}{event.source_label ? ` · ${event.source_label}` : ""}</div></div></article>)}{!seasonEvents.length && <p className={styles.empty}>No events in this season.</p>}</AdminGlassCard>
    {message && <p role="status" className={styles.sectionKicker}>{message}</p>}{error && <p role="alert" className={styles.empty}>{error}</p>}
  </AdminRecordsShell>
}
