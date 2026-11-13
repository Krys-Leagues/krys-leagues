"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { supabase } from "@/lib/supabase"
import { combinedScoreDisplayStatus, formatToPar, formatRoundDate, dateTimeInputInZone, dateTimeInputToUtc, scoreDisplayStatus } from "@/lib/liveScoring/engine"
import type { ScoreDisplayStatus } from "@/lib/liveScoring/engine"
import type { RoomAssignment, StudioPlayer, TournamentScoringConfig } from "@/lib/liveScoring/types"
import RoomNotificationPopup from "@/components/liveScoring/RoomNotificationPopup"
import styles from "./DemoStudio.module.css"

type ScoreRow = { id: string; round_id: string; canonical_player_id: string; score_kind: "provisional" | "official"; source: string; total_strokes: number; score_to_par: number; hole_strokes: number[]; updated_at: string }
type SubmissionRow = { id: string; round_id: string; canonical_player_id: string; total_strokes: number; status: "pending" | "approved" | "rejected"; evidence_path: string; created_at: string; review_note: string | null }
type RoundRow = { id: string; round_number: number; label: string; round_date: string; course_name: string; difficulty: "easy" | "hard"; par_by_hole: number[]; time_zone: string }
type RoomRow = { id: string; round_id: string; room_name: string; course_name: string; difficulty: "easy" | "hard"; starts_at: string; time_zone: string; capacity: number; published: boolean; published_version: number; cancelled_at: string | null }
type MemberRow = { room_id: string; canonical_player_id: string }
type AckRoom = RoomAssignment & { notification_pending: boolean; publishedVersion: number }

const MGA_PREVIEW_SLUG = "mga-championship-2026"
const emptyHoles = () => Array.from({ length: 18 }, () => "")
const scoreColorClass: Record<ScoreDisplayStatus, string> = { live: styles.scoreLive, verified: styles.scoreVerified, missing: styles.scoreMissing }
const localTime = (value: string, zone: string) => {
  try { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: zone, timeZoneName: "short" }).format(new Date(value)) }
  catch { return "Time unavailable" }
}

export default function LiveStudio({ adminOnly = false, instanceSlug = MGA_PREVIEW_SLUG }: { adminOnly?: boolean; instanceSlug?: string }) {
  const [config, setConfig] = useState<TournamentScoringConfig | null>(null)
  const [instanceId, setInstanceId] = useState("")
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [players, setPlayers] = useState<StudioPlayer[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [schedule, setSchedule] = useState<AckRoom[]>([])
  const [userId, setUserId] = useState("")
  const [playerId, setPlayerId] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [roundId, setRoundId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [holes, setHoles] = useState(emptyHoles())
  const [total, setTotal] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [roomName, setRoomName] = useState("")
  const [course, setCourse] = useState("")
  const [difficulty, setDifficulty] = useState<"easy" | "hard">("easy")
  const [startsAt, setStartsAt] = useState("")
  const [capacity, setCapacity] = useState(4)
  const [tab, setTab] = useState<"leaderboard" | "submission" | "admin">(adminOnly ? "admin" : "leaderboard")
  const [large, setLarge] = useState(false)
  const [message, setMessage] = useState("Loading shared tournament data…")
  const [busy, setBusy] = useState(false)

  const activeRound = rounds.find((r) => r.id === roundId) || rounds[0]
  const selectedRoom = rooms.find((r) => r.id === roomId)
  const currentPlayer = players.find((p) => p.id === playerId)
  const currentSubmission = submissions.find((s) => s.round_id === roundId && s.canonical_player_id === playerId && s.status === "pending")
  const popup = schedule.find((r) => r.notification_pending) || null

  const refresh = useCallback(async (id: string, includePrivate = false) => {
    const privateQueries = includePrivate ? Promise.all([
      supabase.from("scoring_studio_submissions").select("id,round_id,canonical_player_id,total_strokes,status,evidence_path,created_at,review_note").eq("instance_id", id).order("created_at", { ascending: false }),
      supabase.from("scoring_studio_rooms").select("id,round_id,room_name,course_name,difficulty,starts_at,time_zone,capacity,published,published_version,cancelled_at").eq("instance_id", id).is("cancelled_at", null),
      supabase.from("scoring_studio_room_members").select("room_id,canonical_player_id").eq("instance_id", id),
    ]) : Promise.resolve([
      { data: [], error: null }, { data: [], error: null }, { data: [], error: null },
    ] as const)
    const [roundRes, rosterRes, scoreRes, [submissionRes, roomRes, memberRes]] = await Promise.all([
      supabase.from("scoring_studio_rounds").select("id,round_number,label,round_date,course_name,difficulty,par_by_hole,time_zone").eq("instance_id", id).order("round_number"),
      supabase.rpc("scoring_studio_registered_players_v1", { p_instance_id: id }),
      supabase.from("scoring_studio_scores").select("id,round_id,canonical_player_id,score_kind,source,total_strokes,score_to_par,hole_strokes,updated_at").eq("instance_id", id),
      privateQueries,
    ])
    const failure = [roundRes, rosterRes, scoreRes, submissionRes, roomRes, memberRes].find((r) => r.error)
    if (failure?.error) throw failure.error
    const rr = (roundRes.data || []) as RoundRow[]
    const pp = ((rosterRes.data || []) as Array<{ registration_id: string; canonical_player_id: string; screen_name: string; player_time_zone: string }>).map((p) => ({ id: p.canonical_player_id, registrationId: p.registration_id, screenName: p.screen_name, timeZone: p.player_time_zone }))
    setRounds(rr); setConfig((current) => current ? { ...current, rounds: rr.map((r) => ({ id: r.id, number: r.round_number, label: r.label, date: r.round_date, course: r.course_name, difficulty: r.difficulty, par: r.par_by_hole.reduce((a, b) => a + b, 0) })) } : current); setPlayers(pp); setScores((scoreRes.data || []) as ScoreRow[]); setSubmissions((submissionRes.data || []) as SubmissionRow[]); setRooms((roomRes.data || []) as RoomRow[]); setMembers((memberRes.data || []) as MemberRow[])
    setRoundId((current) => rr.some((r) => r.id === current) ? current : rr[0]?.id || "")
    setPlayerId((current) => pp.some((p) => p.id === current) ? current : pp[0]?.id || "")
  }, [])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined
    let timer: number | undefined
    let alive = true
    async function start() {
      try {
        const [{ data: auth }, { data: instance, error: instanceError }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from("scoring_studio_instances").select("id,name,slug,config,status,public_results,default_room_capacity").eq("slug", instanceSlug).single(),
        ])
        if (instanceError) throw instanceError
        if (!instance || (instance.status !== "live" && !adminOnly)) throw new Error("This scoring tournament is not published.")
        const user = auth.user
        const [{ data: canonicalId }, { data: authorized }] = await Promise.all([
          user ? supabase.rpc("current_major_player_id") : Promise.resolve({ data: null }),
          supabase.rpc("scoring_studio_is_admin", { p_instance_id: instance.id }),
        ])
        const admin = Boolean(authorized)
        if (adminOnly && !admin) throw new Error("Tournament Admin access is required.")
        if (!alive) return
        setInstanceId(instance.id); setUserId(user?.id || ""); setIsAdmin(admin)
        const rawConfig = instance.config as Record<string, unknown>
        setConfig({ id: instance.id, name: instance.name, subtitle: String(rawConfig.subtitle || "Tournament scoring · live results"), artwork: String(rawConfig.artwork || "/mga/gardens-of-babylon.png"), theme: (rawConfig.theme || { background: "#07120d", surface: "#0d2419", accent: "#f3c75f", text: "#f8f5e9", muted: "#b9c9be" }) as TournamentScoringConfig["theme"], scoring: (rawConfig.scoring || { method: "sum-relative-to-par", missingRound: "omit", tieRule: "competition" }) as TournamentScoringConfig["scoring"], defaultRoomCapacity: instance.default_room_capacity, rounds: [] })
        await refresh(instance.id, admin || Boolean(user))
        if (!adminOnly && user && canonicalId) {
          setPlayerId(String(canonicalId))
          const { data: myRooms, error } = await supabase.rpc("scoring_studio_my_published_rooms_v1", { p_instance_id: instance.id })
          if (!error) setSchedule(((myRooms || []) as Array<Record<string, unknown>>).map((room) => ({ eventId: String(room.instance_id), roomId: String(room.room_id), playerId: String(room.player_id), roundId: String(room.round_id), screenName: String(room.screen_name), roomName: String(room.room_name), course: String(room.course_name), difficulty: room.difficulty as "easy" | "hard", startsAt: String(room.starts_at), timeZone: String(room.time_zone), roomRoster: room.room_roster as string[], publishedVersion: Number(room.published_version), notification_pending: Boolean(room.notification_pending), published: true })))
        }
        setMessage(user ? "Connected to shared tournament data." : "Public live leaderboard · sign in to submit a scorecard.")
        channel = supabase.channel(`scoring-studio:${instance.id}`).on("postgres_changes", { event: "*", schema: "public", table: "scoring_studio_scores", filter: `instance_id=eq.${instance.id}` }, () => { void refresh(instance.id) }).on("postgres_changes", { event: "*", schema: "public", table: "scoring_studio_submissions", filter: `instance_id=eq.${instance.id}` }, () => { void refresh(instance.id) }).on("postgres_changes", { event: "*", schema: "public", table: "scoring_studio_rooms", filter: `instance_id=eq.${instance.id}` }, () => { void refresh(instance.id); if (user) void loadRooms(instance.id) }).on("postgres_changes", { event: "*", schema: "public", table: "scoring_studio_room_members", filter: `instance_id=eq.${instance.id}` }, () => { void refresh(instance.id); if (user) void loadRooms(instance.id) }).subscribe()
        timer = window.setInterval(() => { void refresh(instance.id); if (user) void loadRooms(instance.id) }, 12000)
      } catch (error) { if (alive) setMessage(error instanceof Error ? error.message : "Unable to load tournament data.") }
    }
    async function loadRooms(id: string) {
      const { data } = await supabase.rpc("scoring_studio_my_published_rooms_v1", { p_instance_id: id })
      if (data) setSchedule((data as Array<Record<string, unknown>>).map((room) => ({ eventId: String(room.instance_id), roomId: String(room.room_id), playerId: String(room.player_id), roundId: String(room.round_id), screenName: String(room.screen_name), roomName: String(room.room_name), course: String(room.course_name), difficulty: room.difficulty as "easy" | "hard", startsAt: String(room.starts_at), timeZone: String(room.time_zone), roomRoster: room.room_roster as string[], publishedVersion: Number(room.published_version), notification_pending: Boolean(room.notification_pending), published: true })))
    }
    void start()
    return () => { alive = false; if (timer) window.clearInterval(timer); if (channel) void supabase.removeChannel(channel) }
  }, [adminOnly, instanceSlug, refresh])

  const leaderboard = useMemo(() => {
    const official = scores.filter((s) => s.score_kind === "official")
    const provisional = scores.filter((s) => s.score_kind === "provisional")
    const rows = players.map((player) => {
      const roundCells = rounds.map((round) => {
        const officialScore = official.find((s) => s.canonical_player_id === player.id && s.round_id === round.id)
        const provisionalScore = provisional.find((s) => s.canonical_player_id === player.id && s.round_id === round.id)
        const score = officialScore || provisionalScore
        return { round, score, officialScore, provisionalScore, toPar: score?.score_to_par ?? null }
      })
      const recorded = roundCells.filter((c) => c.score)
      return { player, rounds: roundCells, total: recorded.reduce((n, c) => n + (c.toPar || 0), 0), played: recorded.length, hasOfficial: roundCells.some((c) => c.score?.score_kind === "official") }
    }).sort((a, b) => a.played && b.played ? a.total - b.total || a.player.screenName.localeCompare(b.player.screenName) : a.played ? -1 : b.played ? 1 : a.player.screenName.localeCompare(b.player.screenName))
    return rows.reduce<Array<(typeof rows)[number] & { rank: number | null }>>((ranked, row, index) => {
      const prior = ranked.at(-1)
      const rank = !row.played ? null : prior?.played && prior.total === row.total ? prior.rank : index + 1
      ranked.push({ ...row, rank })
      return ranked
    }, [])
  }, [players, rounds, scores])

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try { await action(); if (instanceId) await refresh(instanceId, adminOnly || Boolean(userId)); setMessage(success) }
    catch (error) { setMessage(error instanceof Error ? error.message : "The request failed. Try again.") }
    finally { setBusy(false) }
  }

  async function submitScore() {
    if (!userId || !playerId || !activeRound || !file) { setMessage("Sign in and attach an 18-hole scorecard image."); return }
    const strokes = Number(total)
    if (!Number.isInteger(strokes) || strokes < 1) { setMessage("Enter your total strokes."); return }
    const submissionId = crypto.randomUUID()
    await run(async () => {
      const form = new FormData()
      form.set("file", file)
      form.set("instanceId", instanceId)
      form.set("roundId", activeRound.id)
      form.set("submissionId", submissionId)
      const upload = await supabase.functions.invoke("scoring-studio-evidence", { body: form })
      if (upload.error || !upload.data?.path) throw upload.error || new Error("The evidence upload did not return a storage path.")
      const result = await supabase.rpc("scoring_studio_submit_scorecard_v1", { p_submission_id: submissionId, p_instance_id: instanceId, p_round_id: activeRound.id, p_total_strokes: strokes, p_evidence_path: upload.data.path })
      if (result.error) throw result.error
      setFile(null); setTotal("")
    }, "Scorecard submitted for Admin review. You can submit another attempt if needed.")
  }

  async function saveScore(official = false) {
    if (!activeRound || !playerId) return
    const values = holes.map((v) => v === "" ? null : Number(v))
    if (values.some((v) => v !== null && (!Number.isInteger(v) || v < 1 || v > 99))) { setMessage("Use whole positive strokes for each hole entered."); return }
    const totalNumber = total ? Number(total) : values.every((v) => v !== null) ? values.reduce<number>((n, v) => n + (v || 0), 0) : null
    await run(async () => { const { error } = await supabase.rpc("scoring_studio_save_score_v1", { p_instance_id: instanceId, p_round_id: activeRound.id, p_player_id: playerId, p_total_strokes: totalNumber, p_hole_strokes: values, p_official: official }); if (error) throw error }, official ? "Score saved as official and verified." : "Provisional live score saved.")
  }

  async function review(id: string, approve: boolean) {
    await run(async () => { const { error } = await supabase.rpc("scoring_studio_review_submission_v1", { p_submission_id: id, p_approve: approve, p_note: null }); if (error) throw error }, approve ? "Submission approved; official results updated." : "Submission declined.")
  }

  async function saveRoom(create: boolean) {
    if (!activeRound) return
    const utc = dateTimeInputToUtc(startsAt, "America/New_York")
    if (!utc || !roomName.trim() || !course.trim()) { setMessage("Enter the exact room name, course, and Eastern start time."); return }
    await run(async () => {
      if (create) {
        const { data, error } = await supabase.rpc("scoring_studio_create_room_v1", { p_instance_id: instanceId, p_round_id: activeRound.id, p_room_name: roomName.trim(), p_course_name: course.trim(), p_difficulty: difficulty, p_starts_at: utc, p_time_zone: "America/New_York", p_capacity: capacity })
        if (error) throw error
        setRoomId(String(data))
      } else if (selectedRoom) {
        const { error } = await supabase.rpc("scoring_studio_save_room_v1", { p_room_id: selectedRoom.id, p_room_name: roomName.trim(), p_course_name: course.trim(), p_difficulty: difficulty, p_starts_at: utc, p_time_zone: "America/New_York", p_capacity: capacity })
        if (error) throw error
      }
    }, create ? "Draft room created." : "Room changes saved.")
  }

  async function assignPlayer(assign: boolean) {
    if (!selectedRoom || !playerId) return
    await run(async () => { const { error } = await supabase.rpc("scoring_studio_assign_room_player_v1", { p_room_id: selectedRoom.id, p_player_id: playerId, p_assign: assign }); if (error) throw error }, assign ? "Global Player added or transferred." : "Global Player removed from room.")
  }

  async function publishRoom(publish: boolean) {
    if (!selectedRoom) return
    await run(async () => { const { error } = await supabase.rpc("scoring_studio_publish_room_v1", { p_room_id: selectedRoom.id, p_publish: publish }); if (error) throw error }, publish ? "Room published to its assigned players." : "Room unpublished; player schedule no longer shows it.")
  }

  async function dismiss(room: AckRoom) {
    const { error } = await supabase.rpc("scoring_studio_ack_room_v1", { p_room_id: room.roomId, p_published_version: room.publishedVersion })
    if (error) setMessage(error.message); else setSchedule((rows) => rows.map((r) => r.roomId === room.roomId ? { ...r, notification_pending: false } : r))
  }

  if (!config) return <main className={styles.page}><div className={styles.shell}><h1>Live Scoring Studio</h1><p role="status">{message}</p></div></main>
  const parTotal = rounds.reduce((n, r) => n + r.par_by_hole.reduce((a, b) => a + b, 0), 0)
  const roster = (room: RoomRow) => members.filter((m) => m.room_id === room.id).map((m) => players.find((p) => p.id === m.canonical_player_id)?.screenName).filter(Boolean).join(", ") || "None"
  const popupRoom: RoomAssignment | null = popup ? { eventId: popup.eventId, roomId: popup.roomId, playerId: popup.playerId, roundId: popup.roundId, screenName: popup.screenName, roomName: popup.roomName, course: popup.course, difficulty: popup.difficulty, startsAt: popup.startsAt, timeZone: popup.timeZone, roomRoster: popup.roomRoster, publishedVersion: popup.publishedVersion, published: true } : null

  return <main className={`${styles.page} ${large ? styles.large : ""}`} style={{ "--accent": config.theme.accent, "--surface": config.theme.surface, "--ink": config.theme.text, "--muted": config.theme.muted, "--artwork": `url(${config.artwork})` } as CSSProperties}>
    <div className={styles.shell}>
      <header className={styles.hero}><div><p className={styles.eyebrow}>Krys&apos; Leagues · Universal Live Scoring Studio</p><h1>{config.name}</h1><p>{config.subtitle}</p><p className={styles.disclaimer}>Shared staging-backed results. Admin actions are permission-checked and audited.</p></div><button className={styles.toggle} onClick={() => setLarge((v) => !v)}>{large ? "Compact display" : "Large display"}</button></header>
      <section className={styles.toolbar}><div className={styles.rounds}>{rounds.map((r) => <button key={r.id} className={r.id === roundId ? styles.selected : ""} onClick={() => setRoundId(r.id)}><strong>R{r.round_number}</strong><span>{formatRoundDate({ id: r.id, number: r.round_number, label: r.label, date: r.round_date, course: r.course_name, difficulty: r.difficulty, par: r.par_by_hole.reduce((a, b) => a + b, 0) })}</span></button>)}</div>{adminOnly ? <label className={styles.playerPicker}>Registered Global Player<select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>{players.map((p) => <option key={p.id} value={p.id}>{p.screenName}</option>)}</select></label> : <span className={styles.playerPicker}>{currentPlayer ? `Signed in · ${currentPlayer.screenName}` : "Sign in to submit your scorecard"}</span>}</section>
      {!adminOnly && <nav className={styles.tabs}><button className={tab === "leaderboard" ? styles.tabSelected : ""} onClick={() => setTab("leaderboard")}>Leaderboard</button><button className={tab === "submission" ? styles.tabSelected : ""} onClick={() => setTab("submission")}>My Tournament / Submit</button></nav>}
      {adminOnly && <div className={styles.adminBadge}>{isAdmin ? "Authorized Tournament Admin · audited writes" : "Admin access required"}</div>}
      {(tab === "leaderboard" || adminOnly) && <section className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>One championship · {rounds.length} rounds</p><h2>Combined leaderboard</h2></div><span>Par {parTotal} total</span></div><p className={styles.scoreLegend}><span><i className={styles.scoreLive} />Live / submitted / unverified</span><span><i className={styles.scoreVerified} />Admin-verified official</span><span><i className={styles.scoreMissing} />— Not Played</span></p><div className={styles.tableWrap}><table><thead><tr><th>POS</th><th>PLAYER</th>{rounds.map((r) => <th key={r.id}>R{r.round_number}</th>)}<th>COMBINED TOTAL</th><th>ROUNDS</th><th>RESULT</th></tr></thead><tbody>{leaderboard.map((row) => { const totalStatus = combinedScoreDisplayStatus(row.rounds.map((r) => r.score?.score_kind || null)); return <tr key={row.player.id}><td>{row.rank ?? "—"}</td><th scope="row">{row.player.screenName}</th>{row.rounds.map(({ round: r, score, officialScore, provisionalScore, toPar }) => <td key={r.id}><strong className={scoreColorClass[scoreDisplayStatus(score?.score_kind || null)]}>{toPar === null ? "—" : formatToPar(toPar)}</strong>{officialScore && <small className={styles.official}>Official · verified</small>}{provisionalScore && (!officialScore || provisionalScore.total_strokes !== officialScore.total_strokes) && <small className={styles.provisional}>{officialScore ? `Live · ${formatToPar(provisionalScore.score_to_par)}` : "Live / submitted"}</small>}{!officialScore && !provisionalScore && <small className={styles.scoreMissing}>Not Played</small>}</td>)}<td className={`${styles.total} ${scoreColorClass[totalStatus]}`}><strong>{row.played ? formatToPar(row.total) : "—"}</strong>{!row.played && <small>Not Played</small>}</td><td>{row.played}/{rounds.length} played</td><td><span className={row.played && row.rounds.every((r) => r.officialScore) ? styles.official : styles.provisional}>{row.played ? row.rounds.every((r) => r.officialScore) ? "Official" : row.hasOfficial ? "Official / provisional" : "Provisional" : "Not started"}</span></td></tr>})}</tbody></table></div><p className={styles.note}>Combined totals are amber if any recorded round is unverified, and green when every recorded round is verified. Missing rounds are excluded. Ties share rank.</p></section>}
      {tab === "submission" && !adminOnly && <section className={styles.panel}><p className={styles.eyebrow}>My Tournament / My Schedule</p><h2>Published room assignments</h2><div className={styles.schedule}>{schedule.map((r) => <article key={`${r.roundId}:${r.roomId}`}><strong>{r.roomName} · {rounds.find((x) => x.id === r.roundId)?.label}</strong><span>{r.course} · {r.difficulty.toUpperCase()}</span><span>Eastern: {localTime(r.startsAt, "America/New_York")}</span><span>Local: {localTime(r.startsAt, r.timeZone)}</span><span>Room: {r.roomRoster.join(", ")}</span></article>)}</div>{!schedule.length && <p>No room is published for your account.</p>}<p className={styles.eyebrow}>Player scorecard · {activeRound?.label}</p><h2>{currentPlayer?.screenName || "Player"} · {activeRound?.course_name}</h2><p>{activeRound?.difficulty.toUpperCase()} · {activeRound?.round_date}</p><div className={styles.scoreForm}><label>Your 18-hole total strokes<input type="number" min="1" value={total} onChange={(e) => setTotal(e.target.value)} /></label><label className={styles.drop} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files?.[0] || null) }}><span>Drop scorecard image here or choose a file</span><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><small>{file?.name || "Private image evidence · 10 MB maximum"}</small></label><button className={styles.primary} disabled={busy || !userId || !file} onClick={() => void submitScore()}>Submit for Admin review</button></div><p className={styles.note}>Latest submission: {currentSubmission ? `Pending review · ${currentSubmission.total_strokes} strokes` : "No pending submission"}. New attempts are allowed; Admins make the approval decision.</p></section>}
      {(tab === "admin" || adminOnly) && isAdmin && <section className={styles.panel}><p className={styles.eyebrow}>Admin scoring · shared records</p><h2>Enter / correct scores · {currentPlayer?.screenName} · {activeRound?.label}</h2><div className={styles.holes}>{holes.map((v, i) => <label key={i}>H{i + 1}<input type="number" min="1" value={v} onChange={(e) => setHoles((prev) => prev.map((h, n) => n === i ? e.target.value : h))} /></label>)}</div><label>Optional round total<input type="number" min="1" value={total} onChange={(e) => setTotal(e.target.value)} /></label><div className={styles.roomActions}><button onClick={() => void saveScore(false)} disabled={busy}>Save provisional live score</button><button className={styles.primary} onClick={() => void saveScore(true)} disabled={busy}>Save official verified score</button></div><h3>Player scorecard submissions</h3><div className={styles.reviewList}>{submissions.filter((s) => s.status === "pending").map((s) => <article key={s.id}><span>{players.find((p) => p.id === s.canonical_player_id)?.screenName} · {rounds.find((r) => r.id === s.round_id)?.label} · {s.total_strokes} · pending</span><button onClick={() => void supabase.functions.invoke("scoring-studio-evidence", { body: { action: "sign", evidencePath: s.evidence_path } }).then(({ data, error }) => { if (error) throw error; if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer") }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to open scorecard evidence."))}>View evidence</button><button onClick={() => void review(s.id, true)}>Approve</button><button onClick={() => void review(s.id, false)}>Decline</button></article>)}</div><h3>Universal Room Builder</h3><div className={styles.roomAdmin}><label>Select room<select value={roomId} onChange={(e) => { const r = rooms.find((x) => x.id === e.target.value); setRoomId(e.target.value); if (r) { setRoomName(r.room_name); setCourse(r.course_name); setDifficulty(r.difficulty); setStartsAt(dateTimeInputInZone(r.starts_at, r.time_zone)); setCapacity(r.capacity) } }}><option value="">Create a new room</option>{rooms.filter((r) => r.round_id === roundId).map((r) => <option key={r.id} value={r.id}>{r.room_name}{r.published ? " · Published" : " · Draft"}</option>)}</select></label><label>Exact room name<input value={roomName} onChange={(e) => setRoomName(e.target.value)} /></label><label>Course<input value={course} onChange={(e) => setCourse(e.target.value)} /></label><label>Difficulty<select value={difficulty} onChange={(e) => setDifficulty(e.target.value as "easy" | "hard")}><option value="easy">Easy</option><option value="hard">Hard</option></select></label><label>Start time · Eastern<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label><label>Capacity<input type="number" min="1" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></label><p>Assigned: {selectedRoom ? roster(selectedRoom) : "Select or create a room."}</p><div className={styles.roomActions}><button onClick={() => void saveRoom(true)}>Create draft room</button>{selectedRoom && <><button onClick={() => void saveRoom(false)}>Save room changes</button><button onClick={() => void assignPlayer(true)}>Add / transfer selected Global Player</button><button onClick={() => void assignPlayer(false)}>Remove selected Global Player</button><button className={styles.primary} onClick={() => void publishRoom(!selectedRoom.published)}>{selectedRoom.published ? "Unpublish room" : "Publish room"}</button></>}</div></div></section>}
      {message && <p className={styles.toast} role="status">{message}</p>}
    </div>
    {popupRoom && <RoomNotificationPopup config={config} room={popupRoom} onDismiss={() => void dismiss(popup!)} onOpenScorecard={() => setTab("submission")} />}
  </main>
}
