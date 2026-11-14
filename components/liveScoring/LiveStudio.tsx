"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import type { CSSProperties } from "react"
import { supabase } from "@/lib/supabase"
import { combinedScoreDisplayStatus, currentEventDate, formatToPar, formatRoundDate, dateTimeInputInZone, dateTimeInputToUtc, roomNoticeKey, scoreDisplayStatus } from "@/lib/liveScoring/engine"
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
const roundDayLabel = (round: RoundRow) => {
  const date = new Date(round.round_date + "T12:00:00Z")
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date)
  return `${weekday} — Round ${round.round_number}`
}

const mapPublishedRoom = (room: Record<string, unknown>): AckRoom => ({
  eventId: String(room.instance_id), roomId: String(room.room_id), playerId: String(room.player_id), roundId: String(room.round_id), eventDate: String(room.round_date),
  screenName: String(room.screen_name), roomName: String(room.room_name), course: String(room.course_name),
  difficulty: room.difficulty as "easy" | "hard", startsAt: String(room.starts_at), timeZone: String(room.time_zone),
  roomRoster: Array.isArray(room.room_roster) ? room.room_roster as string[] : [],
  publishedVersion: Number(room.published_version), notification_pending: Boolean(room.notification_pending), published: true,
  roomSource: String(room.room_source || "studio") as "studio" | "mga_regular",
})
const ROOM_NOTIFICATION_STORAGE_KEY = "krys-leagues:mga-room-notifications:dismissed"
const readDismissedRoomNotificationKeys = () => {
  if (typeof window === "undefined") return new Set<string>()
  try {
    const stored = JSON.parse(window.localStorage.getItem(ROOM_NOTIFICATION_STORAGE_KEY) || "[]")
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [])
  } catch {
    return new Set<string>()
  }
}
type AdminView = "scores" | "rooms" | "leaderboard"

export default function LiveStudio({ adminOnly = false, adminView = "scores", instanceSlug = MGA_PREVIEW_SLUG }: { adminOnly?: boolean; adminView?: AdminView; instanceSlug?: string }) {

  const [config, setConfig] = useState<TournamentScoringConfig | null>(null)
  const [instanceId, setInstanceId] = useState("")
  const [instanceStatus, setInstanceStatus] = useState("")
  const [publicResults, setPublicResults] = useState(false)
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [players, setPlayers] = useState<StudioPlayer[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [schedule, setSchedule] = useState<AckRoom[]>([])
  const [dismissedRoomNotificationKeys, setDismissedRoomNotificationKeys] = useState<Set<string>>(readDismissedRoomNotificationKeys)
  const [userId, setUserId] = useState("")
  const [playerId, setPlayerId] = useState("")
  const [adminPlayerSearch, setAdminPlayerSearch] = useState("")
  const [adminPlayerPickerOpen, setAdminPlayerPickerOpen] = useState(false)
  const [playerIdentityResolved, setPlayerIdentityResolved] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [roundId, setRoundId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [playerHoles, setPlayerHoles] = useState(emptyHoles())
  const [openedRoom, setOpenedRoom] = useState<AckRoom | null>(null)
  const [adminFieldHoles, setAdminFieldHoles] = useState<Record<string, string[]>>({})
  const [imageZoom, setImageZoom] = useState(1)
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 })
  const [imagePan, setImagePan] = useState<{ x: number; y: number; originX: number; originY: number } | null>(null)
  const [sharedCardPath, setSharedCardPath] = useState("")
  const [sharedCardUrl, setSharedCardUrl] = useState("")
  const [adminEvidenceUrl, setAdminEvidenceUrl] = useState("")
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
  const matchingAdminPlayers = players.filter((player) => player.screenName.toLocaleLowerCase().includes(adminPlayerSearch.trim().toLocaleLowerCase())).slice(0, 8)
  const playerAccessReady = Boolean(!adminOnly && userId && playerIdentityResolved && playerId && currentPlayer)
  const imagePreviewUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file])
  useEffect(() => () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl) }, [imagePreviewUrl])
  const currentSubmission = submissions.find((s) => s.round_id === roundId && s.canonical_player_id === playerId)
  const roundScores = useMemo(() => scores.filter((score) => score.round_id === roundId), [scores, roundId])
  const parTotal = activeRound?.par_by_hole.reduce((sum, hole) => sum + hole, 0) ?? 0
  const runningToPar = (values: string[]) => {
    const completed = values.flatMap((value, index) => value === "" ? [] : [{ strokes: Number(value), par: activeRound?.par_by_hole[index] || 0 }])
    return { holes: completed.length, strokes: completed.reduce((sum, hole) => sum + hole.strokes, 0), score: completed.reduce((sum, hole) => sum + hole.strokes - hole.par, 0) }
  }
  const playerRunning = runningToPar(playerHoles)
  const currentPlayerRoom = schedule.find((room) => room.roundId === roundId)
  const currentRoomId = currentPlayerRoom?.roomId || ""
  const currentRoundId = currentPlayerRoom?.roundId || ""
  const currentRoomSource = currentPlayerRoom?.roomSource || "studio"
  const sharedCardReady = Boolean(currentRoomId && sharedCardPath.split("/")[2] === "room:" + currentRoomSource + ":" + currentRoomId)
  const popup = schedule.find((r) => r.notification_pending && r.eventDate === currentEventDate() && !dismissedRoomNotificationKeys.has(roomNoticeKey(r))) || openedRoom

  useEffect(() => {
    try { window.localStorage.setItem(ROOM_NOTIFICATION_STORAGE_KEY, JSON.stringify([...dismissedRoomNotificationKeys].slice(-50))) } catch { /* optional client-side fallback */ }
  }, [dismissedRoomNotificationKeys])

  useEffect(() => {
    let active = true
    if (!instanceId || !currentRoomId || !currentRoundId) return () => { active = false }
    const loadCard = async () => {
      const { data } = await supabase.from("scoring_studio_shared_room_cards").select("evidence_path").eq("instance_id", instanceId).eq("round_id", currentRoundId).eq("room_source", currentRoomSource).eq("room_id", currentRoomId).maybeSingle()
      if (!active || !data?.evidence_path) return
      const { data: signed } = await supabase.functions.invoke("scoring-studio-evidence", { body: { action: "sign", evidencePath: data.evidence_path } })
      if (active && signed?.signedUrl) { setSharedCardPath(data.evidence_path); setSharedCardUrl(signed.signedUrl) }
    }
    void loadCard()
    const interval = window.setInterval(() => void loadCard(), 12000)
    return () => { active = false; window.clearInterval(interval) }
  }, [instanceId, currentRoomId, currentRoundId, currentRoomSource])

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
      setPlayerId((current) => pp.some((p) => p.id === current) ? current : adminOnly && adminView !== "leaderboard" ? pp[0]?.id || "" : "")
    return pp
  }, [adminOnly, adminView])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined
    let timer: number | undefined
    let alive = true
    async function start() {
      try {
        if (!adminOnly) {
          setPlayerId("")
          setPlayerIdentityResolved(false)
          setSchedule([])
          setOpenedRoom(null)
          setTab("leaderboard")
        }
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
        setInstanceId(instance.id); setInstanceStatus(String(instance.status || "")); setPublicResults(Boolean(instance.public_results)); setUserId(user?.id || ""); setIsAdmin(admin)
        const rawConfig = instance.config as Record<string, unknown>
        setConfig({ id: instance.id, name: instance.name, subtitle: String(rawConfig.subtitle || "Tournament scoring · live results"), artwork: String(rawConfig.artwork || "/mga/gardens-of-babylon.png"), theme: (rawConfig.theme || { background: "#07120d", surface: "#0d2419", accent: "#f3c75f", text: "#f8f5e9", muted: "#b9c9be" }) as TournamentScoringConfig["theme"], scoring: (rawConfig.scoring || { method: "sum-relative-to-par", missingRound: "omit", tieRule: "competition" }) as TournamentScoringConfig["scoring"], defaultRoomCapacity: instance.default_room_capacity, rounds: [] })
        const registeredPlayers = await refresh(instance.id, admin || Boolean(user))
        let playerIdentityMatchesRoster = false
        if (!adminOnly && user && canonicalId) {
          const resolvedPlayerId = String(canonicalId)
          playerIdentityMatchesRoster = registeredPlayers.some((player) => player.id === resolvedPlayerId)
          if (playerIdentityMatchesRoster) {
            setPlayerId(resolvedPlayerId)
            setPlayerIdentityResolved(true)
            const [{ data: myRooms, error }, { data: mgaRooms }] = await Promise.all([
              supabase.rpc("scoring_studio_my_published_rooms_v1", { p_instance_id: instance.id }),
              supabase.rpc("scoring_studio_my_mga_published_rooms_v1", { p_instance_id: instance.id }),
            ])
            if (!error) setSchedule([...((myRooms || []) as Array<Record<string, unknown>>), ...((mgaRooms || []) as Array<Record<string, unknown>>)].map(mapPublishedRoom))
          } else {
            setPlayerId("")
            setPlayerIdentityResolved(false)
            setSchedule([])
            setOpenedRoom(null)
          }
        } else if (!adminOnly) {
          setPlayerId("")
          setPlayerIdentityResolved(false)
          setSchedule([])
        }
        setMessage(user && (adminOnly || playerIdentityMatchesRoster) ? "Connected to shared tournament data." : "")
        channel = supabase.channel(`scoring-studio:${instance.id}`).on("postgres_changes", { event: "*", schema: "public", table: "scoring_studio_scores", filter: `instance_id=eq.${instance.id}` }, () => { void refresh(instance.id) }).on("postgres_changes", { event: "*", schema: "public", table: "scoring_studio_submissions", filter: `instance_id=eq.${instance.id}` }, () => { void refresh(instance.id) }).on("postgres_changes", { event: "*", schema: "public", table: "scoring_studio_rooms", filter: `instance_id=eq.${instance.id}` }, () => { void refresh(instance.id); if (user) void loadRooms(instance.id) }).on("postgres_changes", { event: "*", schema: "public", table: "scoring_studio_room_members", filter: `instance_id=eq.${instance.id}` }, () => { void refresh(instance.id); if (user) void loadRooms(instance.id) }).subscribe()
        timer = window.setInterval(() => { void refresh(instance.id); if (user) void loadRooms(instance.id) }, 12000)
      } catch (error) { if (alive) setMessage(error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Unable to load tournament data.") }
    }
    async function loadRooms(id: string) {
      const [{ data }, { data: mgaRooms }] = await Promise.all([
        supabase.rpc("scoring_studio_my_published_rooms_v1", { p_instance_id: id }),
        supabase.rpc("scoring_studio_my_mga_published_rooms_v1", { p_instance_id: id }),
      ])
      if (data || mgaRooms) setSchedule([...((data || []) as Array<Record<string, unknown>>), ...((mgaRooms || []) as Array<Record<string, unknown>>)].map(mapPublishedRoom))
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

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true)
    try { await action(); if (instanceId) await refresh(instanceId, adminOnly || Boolean(userId)); setMessage(success); return true }
    catch (error) { setMessage(error instanceof Error ? error.message : "The request failed. Try again."); return false }
    finally { setBusy(false) }
  }

  async function publishInstance(publish: boolean) {
    if (!instanceId || !isAdmin) return
    const question = publish
      ? "Publish the verified MGA leaderboard to the public Main Hub? Player score submissions remain disabled."
      : "Remove the MGA leaderboard from the public Main Hub? Existing scores and room records are not changed."
    if (!window.confirm(question)) return
    const ok = await run(async () => {
      const { error } = await supabase.rpc("scoring_studio_publish_instance_v1", { p_instance_id: instanceId, p_publish: publish })
      if (error) throw error
    }, publish ? "Public MGA leaderboard enabled. Score submissions remain disabled." : "Public MGA leaderboard disabled. Scores and rooms were not changed.")
    if (ok) {
      setInstanceStatus(publish ? "live" : "draft")
      setPublicResults(publish)
    }
  }

  async function uploadSharedCard() {
    if (!playerAccessReady || !currentPlayerRoom || !activeRound || !file) { setMessage("A registered Global Player identity and an assigned published room are required to upload a shared scorecard."); return }
    await run(async () => {
      const form = new FormData()
      form.set("action", "upload-room-card"); form.set("file", file); form.set("instanceId", instanceId)
      form.set("roundId", activeRound.id); form.set("roomId", currentPlayerRoom.roomId)
      form.set("roomSource", currentPlayerRoom.roomSource || "studio"); form.set("uploadId", crypto.randomUUID())
      const upload = await supabase.functions.invoke("scoring-studio-evidence", { body: form })
      if (upload.error || !upload.data?.path) throw upload.error || new Error("The shared room scorecard could not be uploaded.")
      const { data: signed, error: signError } = await supabase.functions.invoke("scoring-studio-evidence", { body: { action: "sign", evidencePath: upload.data.path } })
      if (signError || !signed?.signedUrl) throw signError || new Error("The uploaded room scorecard could not be opened.")
      setSharedCardPath(upload.data.path); setSharedCardUrl(signed.signedUrl); setFile(null)
    }, "Shared scorecard uploaded. Assigned room players and tournament Admins can view it.")
  }

  async function submitScore() {
    if (!playerAccessReady || !currentPlayerRoom || !activeRound || !sharedCardReady) { setMessage("A registered Global Player identity and your assigned room's published shared scorecard are required to submit."); return }
    const values = playerHoles.map((value) => value === "" ? null : Number(value))
    if (values.some((value) => value === null || !Number.isInteger(value) || value < 1 || value > 99)) { setMessage("Enter strokes for all 18 holes."); return }
    await run(async () => {
      const { error } = await supabase.rpc("scoring_studio_submit_room_score_v1", {
        p_submission_id: crypto.randomUUID(), p_instance_id: instanceId, p_round_id: activeRound.id,
        p_room_source: currentRoomSource, p_room_id: currentRoomId, p_hole_strokes: values,
      })
      if (error) throw error
      setPlayerHoles(emptyHoles())
    }, "Your 18-hole score was submitted with the shared room evidence for Admin review.")
  }
  async function saveFieldScore(targetPlayerId: string, values: string[], official: boolean) {
    if (!activeRound) return
    const strokes = values.map((value) => value === "" ? null : Number(value))
    if (strokes.some((value) => value !== null && (!Number.isInteger(value) || value < 1 || value > 99))) { setMessage("Use whole positive strokes for each hole entered."); return }
    if (!strokes.some((value) => value !== null)) { setMessage("Enter at least one hole before saving a score."); return }
    const totalStrokes = strokes.every((value) => value !== null) ? strokes.reduce<number>((sum, value) => sum + (value || 0), 0) : null
    const saved = await run(async () => {
      const { error } = await supabase.rpc("scoring_studio_save_score_v1", { p_instance_id: instanceId, p_round_id: activeRound.id, p_player_id: targetPlayerId, p_total_strokes: totalStrokes, p_hole_strokes: strokes, p_official: official })
      if (error) throw error
    }, official ? "Player row saved as official and verified." : "Player row saved as provisional live score.")
    if (saved) setAdminFieldHoles((current) => { const next = { ...current }; delete next[`${activeRound.id}:${targetPlayerId}`]; return next })
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
    const key = roomNoticeKey(room)
    setDismissedRoomNotificationKeys((current) => {
      const next = new Set(current)
      next.add(key)
      return next
    })
    setSchedule((rows) => rows.map((r) => r.roomId === room.roomId && r.roomSource === room.roomSource ? { ...r, notification_pending: false } : r))
    const { error } = await supabase.rpc("scoring_studio_ack_room_v2", { p_instance_id: room.eventId, p_round_id: room.roundId, p_room_source: room.roomSource || "studio", p_room_id: room.roomId, p_published_version: room.publishedVersion })
    if (error) setMessage(error.message)
  }

  function openRoomScorecard(room: RoomAssignment) {
    if (currentPlayerRoom?.roomId !== room.roomId || currentPlayerRoom?.roundId !== room.roundId) {
      setFile(null)
      setSharedCardPath("")
      setSharedCardUrl("")
      setImageZoom(1)
      setImageOffset({ x: 0, y: 0 })
    }
    setRoundId(room.roundId)
    setTab("submission")
  }

  if (!config) return <main className={styles.page}><div className={styles.shell}><h1>Live Scoring Studio</h1><p role="status">{message}</p></div></main>
  const roster = (room: RoomRow) => members.filter((m) => m.room_id === room.id).map((m) => players.find((p) => p.id === m.canonical_player_id)?.screenName).filter(Boolean).join(", ") || "None"
  const popupRoom: RoomAssignment | null = popup ? { eventId: popup.eventId, roomId: popup.roomId, playerId: popup.playerId, roundId: popup.roundId, eventDate: popup.eventDate, screenName: popup.screenName, roomName: popup.roomName, course: popup.course, difficulty: popup.difficulty, startsAt: popup.startsAt, timeZone: popup.timeZone, roomRoster: popup.roomRoster, publishedVersion: popup.publishedVersion, published: true, roomSource: popup.roomSource } : null
  const isMGAChampionship = instanceSlug === MGA_PREVIEW_SLUG

  return <main className={`${styles.page} ${large ? styles.large : ""}`} style={{ "--accent": config.theme.accent, "--surface": config.theme.surface, "--ink": config.theme.text, "--muted": config.theme.muted, "--artwork": `url(${isMGAChampionship ? "/mga/babylonian-gardens-panorama.png" : config.artwork})` } as CSSProperties}>
    <div className={styles.shell}>
      {!isMGAChampionship && <header className={styles.hero}><div><p className={styles.eyebrow}>Krys&apos; Leagues · Universal Live Scoring Studio</p><h1>{config.name}</h1><p>{config.subtitle}</p><p className={styles.disclaimer}>Shared staging-backed results. Admin actions are permission-checked and audited.</p></div><button className={styles.toggle} onClick={() => setLarge((v) => !v)}>{large ? "Compact display" : "Large display"}</button></header>}
      {(!adminOnly || adminView === "rooms" || adminView === "leaderboard") && <section className={styles.toolbar}>
        {adminOnly && adminView === "rooms" && <div className={styles.rounds}>{rounds.map((r) => <button key={r.id} className={r.id === roundId ? styles.selected : ""} onClick={() => { setRoundId(r.id); if (selectedRoom && selectedRoom.round_id !== r.id) { setRoomId(""); setRoomName(""); setCourse(""); setStartsAt(""); setCapacity(config?.defaultRoomCapacity || 4) } }}><strong>R{r.round_number}</strong><span>{formatRoundDate({ id: r.id, number: r.round_number, label: r.label, date: r.round_date, course: r.course_name, difficulty: r.difficulty, par: r.par_by_hole.reduce((a, b) => a + b, 0) })}</span></button>)}</div>}
        {adminOnly && adminView === "rooms" ? <label className={styles.playerPicker}>Registered Global Player<select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>{players.map((p) => <option key={p.id} value={p.id}>{p.screenName}</option>)}</select></label> : <span className={styles.playerPicker}>{adminOnly ? "Authorized Admin view" : playerAccessReady ? `Signed in · ${currentPlayer?.screenName}` : userId ? "Signed-in account not linked to a registered player" : "Public leaderboard"}</span>}
      </section>}
      {!adminOnly && userId && !playerAccessReady && tab !== "submission" && <p className={styles.toast} role="alert">This account is signed in but is not linked to a registered Global Player for this tournament. Room details, score entry, and uploads are unavailable.</p>}
      {!adminOnly && schedule.length > 0 && <details className={styles.roomAccess}><summary>Published rooms · {schedule.length}</summary><div>{schedule.map((room) => <article key={room.roundId + ":" + room.roomId}><span><strong>{room.roomName}</strong> · {rounds.find((round) => round.id === room.roundId)?.label} · {room.course} · {room.difficulty.toUpperCase()}</span><button type="button" onClick={() => setOpenedRoom(room)}>Open room details</button></article>)}</div></details>}
      {adminOnly && <div className={styles.adminBadge}>{isAdmin ? "Authorized Tournament Admin · audited writes" : "Admin access required"}</div>}
      {adminOnly && isAdmin && <section className={styles.publicationControl} aria-label="Public MGA leaderboard publication">
        <div><strong>{publicResults ? "Public leaderboard enabled" : "Public leaderboard private"}</strong><span>{publicResults ? "Main Hub visitors can read verified scores." : `Instance status: ${instanceStatus || "draft"}. No public scores are exposed.`}</span><small>Player score submissions: disabled</small></div>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void publishInstance(!publicResults)}>{publicResults ? "Unpublish public leaderboard" : "Publish verified leaderboard"}</button>
      </section>}
      {(adminOnly ? adminView !== "leaderboard" : tab === "leaderboard") && <section id="scoring-board" className={`${styles.panel} ${styles.leaderboardPanel}`}>
        {isMGAChampionship && <header className={`${styles.mgaHeader} ${styles.boardChampionshipHeader}`}>
          <Image className={styles.mgaLogo} src="/krys-leagues-logo.png" width={824} height={824} alt="Krys Leagues" priority />
          <div className={styles.mgaHeaderCopy}>
            <p className={styles.eyebrow}>Krys Leagues · Majors Series</p>
            <h1>THE MGA CHAMPIONSHIP</h1>
            <p className={styles.mgaIdentity}>MAJOR CHAMPIONSHIP</p>
            <p className={styles.mgaCourse}>GARDENS OF BABYLON</p>
            <strong>November 12–15, 2026</strong>
            <p className={styles.mgaRounds}>4 Rounds · Thursday–Sunday</p>
          </div>
          <Image className={styles.mgaTrophy} src="/mga/scoring-studio-championship-trophy.png" width={1148} height={1371} alt="MGA Championship trophy" priority sizes="(max-width: 400px) 44px, (max-width: 700px) 12vw, 11.4vw" />
        </header>}
        {!isMGAChampionship && <div className={styles.panelHeading}><div><p className={styles.eyebrow}>One championship · {rounds.length} rounds</p><h2>Combined leaderboard</h2></div></div>}
        <div className={styles.tableWrap + " " + styles.compactBoard}><table><colgroup><col className={styles.positionColumn} /><col className={styles.playerColumn} />{rounds.map((r) => <col key={r.id} className={styles.roundColumn} />)}<col className={styles.combinedColumn} /></colgroup><thead>
          <tr className={styles.boardLegendRow}><th colSpan={rounds.length + 3}><p className={styles.scoreLegend}><span><i className={styles.scoreLive} />Live / unverified</span><span><i className={styles.scoreVerified} />Verified</span></p></th></tr>
          <tr><th>POSITION</th><th>PLAYER</th>{rounds.map((r) => <th key={r.id}>R{r.round_number}</th>)}<th>COMBINED</th></tr>
        </thead><tbody>{leaderboard.map((row) => { const totalStatus = combinedScoreDisplayStatus(row.rounds.map((r) => r.score?.score_kind || null)); return <tr key={row.player.id}><td>{row.rank ?? "—"}</td><th scope="row">{row.player.screenName}</th>{row.rounds.map(({ round: r, score, toPar }) => <td key={r.id}><strong aria-label={score?.score_kind === "official" ? "Verified score" : score ? "Unverified score" : "No score"} className={scoreColorClass[scoreDisplayStatus(score?.score_kind || null)]}>{toPar === null ? "—" : formatToPar(toPar)}</strong></td>)}<td className={styles.total + " " + scoreColorClass[totalStatus]}><strong>{row.played ? formatToPar(row.total) : "—"}</strong></td></tr>})}</tbody></table></div>
        {isMGAChampionship && <div className={styles.displayToggleFooter}><button className={styles.toggle} onClick={() => setLarge((v) => !v)}>{large ? "Compact display" : "Large display"}</button></div>}
      </section>}
      {tab === "submission" && !adminOnly && !playerAccessReady && <section id="submission" className={styles.panel}><h2>Player access unavailable</h2><p role="alert" className={styles.note}>This signed-in account is not linked to a registered Global Player for this tournament. Sign in with the Discord account linked to your registration to view room details, enter scores, or upload evidence.</p><button type="button" className={styles.returnLink} onClick={() => setTab("leaderboard")}>Back to leaderboard</button></section>}
      {tab === "submission" && !adminOnly && playerAccessReady && <section id="submission" className={styles.panel}><p className={styles.eyebrow}>Room scorecard · {currentPlayerRoom?.roomName || "No published room"}</p><h2>Enter My Score · {currentPlayer?.screenName || "Player"} · {activeRound?.label}</h2><p>{currentPlayerRoom ? `${currentPlayerRoom.course} · ${currentPlayerRoom.difficulty.toUpperCase()} · ${activeRound?.round_date}` : "Open a published room to enter its score."}</p><button type="button" className={styles.returnLink} onClick={() => setTab("leaderboard")}>Back to leaderboard</button><p className={styles.eyebrow}>Player scoring row · {activeRound?.label}</p><h2>{currentPlayer?.screenName || "Player"} · {activeRound?.course_name}</h2><p>{activeRound?.difficulty.toUpperCase()} · {activeRound?.round_date}</p><div className={styles.playerWorkspace}><div className={styles.imageWorkspace} onPointerMove={(event) => { if (imagePan) setImageOffset({ x: imagePan.originX + event.clientX - imagePan.x, y: imagePan.originY + event.clientY - imagePan.y }) }} onPointerUp={() => setImagePan(null)} onPointerLeave={() => setImagePan(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const next = event.dataTransfer.files?.[0]; if (next) { setFile(next); setImageOffset({ x: 0, y: 0 }) } }}>{(file || (sharedCardUrl && sharedCardReady)) ? <><div className={styles.imageTools}><label>Zoom <input type="range" min="0.6" max="2.5" step="0.1" value={imageZoom} onChange={(event) => setImageZoom(Number(event.target.value))} /></label><button type="button" onClick={() => { setImageZoom(1); setImageOffset({ x: 0, y: 0 }) }}>Reset view</button></div><img className={styles.workspaceImage} src={file ? imagePreviewUrl : sharedCardUrl} alt="Shared room scorecard; drag to pan" draggable={false} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setImagePan({ x: event.clientX, y: event.clientY, originX: imageOffset.x, originY: imageOffset.y }) }} style={{ transform: "translate(" + imageOffset.x + "px, " + imageOffset.y + "px) scale(" + imageZoom + ")" }} />{(!sharedCardUrl || file) && <label className={styles.replaceImage}>Choose shared room scorecard image<input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>}</> : <label className={styles.drop}><span>Drop the room scorecard here or choose an image</span><input type="file" accept="image/*" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); setImageOffset({ x: 0, y: 0 }) }} /><small>Scorecard image · up to 10 MB</small></label>}</div><div className={styles.playerGrid}><p className={styles.eyebrow}>Your 18-hole scoring row</p><p className={styles.runningScore}>Running score to par <strong>{playerRunning.holes ? formatToPar(playerRunning.score) : "—"}</strong><span>{playerRunning.strokes} strokes · {playerRunning.holes}/18 holes</span></p><div className={`${styles.holes} ${styles.scoreEntryGrid}`}><span className={styles.holeLabel}>Hole</span>{playerHoles.map((_, index) => <span key={index} className={styles.holeLabel}>{index + 1}</span>)}<span className={styles.holeLabel}>PAR</span><span className={styles.parLabel}>Par</span>{activeRound?.par_by_hole.map((par, index) => <span key={index} className={styles.parLabel}>{par}</span>)}<span className={styles.parGrandTotal}>{parTotal}</span><span className={styles.strokeLabel}>Strokes</span>{playerHoles.map((value, index) => <label key={index} className={styles.strokeCell} aria-label={`Hole ${index + 1} strokes`}><input id={"player-hole-" + (index + 1)} type="number" min="1" max="99" inputMode="numeric" value={value} onChange={(event) => { const next = event.target.value; setPlayerHoles((previous) => previous.map((hole, position) => position === index ? next : hole)); if (next && index < 17) document.getElementById("player-hole-" + (index + 2))?.focus() }} /></label>)}<strong className={styles.strokeGrandTotal}>{playerRunning.strokes || "—"}</strong></div><p className={styles.note}>Room: {currentPlayerRoom?.roomName || "No published assignment for this round"}</p>{(!sharedCardUrl || file) && <button onClick={() => void uploadSharedCard()} disabled={busy || !userId || !file || !currentPlayerRoom}>Upload shared room scorecard</button>}<button className={styles.primary} disabled={busy || !userId || !sharedCardReady || !currentPlayerRoom} onClick={() => void submitScore()}>Submit my score for Admin review</button></div></div><p className={styles.note}>Latest submission: {currentSubmission ? currentSubmission.status + " · " + currentSubmission.total_strokes + " strokes" : "No submission yet"}. New attempts are allowed; Admins make the approval decision.</p></section>}
      {adminOnly && isAdmin && <nav className={styles.adminNav} aria-label="Scoring Studio administration"><a aria-current={adminView === "scores" ? "page" : undefined} href={`/scoring-studio/${instanceSlug}/admin`}>Admin Score Entry</a><a aria-current={adminView === "rooms" ? "page" : undefined} href={`/scoring-studio/${instanceSlug}/admin/rooms`}>Room Builder</a><a aria-current={adminView === "leaderboard" ? "page" : undefined} href={`/scoring-studio/${instanceSlug}/admin/leaderboard`}>Admin Leaderboard</a></nav>}
      {((!adminOnly && tab === "leaderboard") || (adminOnly && adminView === "leaderboard")) && <section id="scoring-board" className={`${styles.panel} ${styles.leaderboardPanel}`}>
        {isMGAChampionship && <header className={`${styles.mgaHeader} ${styles.boardChampionshipHeader}`}><Image className={styles.mgaLogo} src="/krys-leagues-logo.png" width={824} height={824} alt="Krys Leagues" priority /><div className={styles.mgaHeaderCopy}><p className={styles.eyebrow}>Krys Leagues · Majors Series</p><h1>THE MGA CHAMPIONSHIP</h1><p className={styles.mgaIdentity}>MAJOR CHAMPIONSHIP</p><p className={styles.mgaCourse}>GARDENS OF BABYLON</p><strong>November 12–15, 2026</strong><p className={styles.mgaRounds}>4 Rounds · Thursday–Sunday</p></div><Image className={styles.mgaTrophy} src="/mga/scoring-studio-championship-trophy.png" width={1148} height={1371} alt="MGA Championship trophy" priority sizes="(max-width: 400px) 44px, (max-width: 700px) 12vw, 11.4vw" /></header>}
        {!isMGAChampionship && <div className={styles.panelHeading}><div><p className={styles.eyebrow}>One championship · {rounds.length} rounds</p><h2>Combined leaderboard</h2></div></div>}
        <div className={styles.tableWrap + " " + styles.compactBoard}><table><colgroup><col className={styles.positionColumn} /><col className={styles.playerColumn} />{rounds.map((r) => <col key={r.id} className={styles.roundColumn} />)}<col className={styles.combinedColumn} /></colgroup><thead><tr className={styles.boardLegendRow}><th colSpan={rounds.length + 3}><p className={styles.scoreLegend}><span><i className={styles.scoreLive} />Live / unverified</span><span><i className={styles.scoreVerified} />Verified</span></p></th></tr><tr><th>POSITION</th><th>PLAYER</th>{rounds.map((r) => <th key={r.id}>R{r.round_number}</th>)}<th>COMBINED</th></tr></thead><tbody>{leaderboard.map((row) => { const totalStatus = combinedScoreDisplayStatus(row.rounds.map((r) => r.score?.score_kind || null)); return <tr key={row.player.id}><td>{row.rank ?? "—"}</td><th scope="row">{row.player.screenName}</th>{row.rounds.map(({ round: r, score, toPar }) => <td key={r.id}><strong aria-label={score?.score_kind === "official" ? "Verified score" : score ? "Unverified score" : "No score"} className={scoreColorClass[scoreDisplayStatus(score?.score_kind || null)]}>{toPar === null ? "—" : formatToPar(toPar)}</strong></td>)}<td className={styles.total + " " + scoreColorClass[totalStatus]}><strong>{row.played ? formatToPar(row.total) : "—"}</strong></td></tr>})}</tbody></table></div>{isMGAChampionship && <div className={styles.displayToggleFooter}><button className={styles.toggle} onClick={() => setLarge((v) => !v)}>{large ? "Compact display" : "Large display"}</button></div>}
      </section>}
      {adminOnly && isAdmin && adminView === "scores" && <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin score entry · {activeRound?.label}</p>
        <h2>{currentPlayer?.screenName || "Select a Global Player"} · {activeRound?.course_name}</h2>
        <div className={styles.adminScoreSelectors}>
          <label className={styles.adminPlayerSearch}>Search registered Global Players
            <input
              type="search"
              autoComplete="off"
              role="combobox"
              aria-label="Search registered Global Players by screen name"
              aria-expanded={adminPlayerPickerOpen && matchingAdminPlayers.length > 0}
              aria-haspopup="listbox"
              aria-controls="admin-player-suggestions"
              aria-autocomplete="list"
              value={adminPlayerSearch || currentPlayer?.screenName || ""}
              placeholder="Type an exact screen name"
              onFocus={(event) => { event.currentTarget.select(); setAdminPlayerPickerOpen(true) }}
              onBlur={(event) => {
                const nextFocus = event.relatedTarget
                if (!(nextFocus instanceof Node) || !event.currentTarget.parentElement?.contains(nextFocus)) setAdminPlayerPickerOpen(false)
              }}
              onChange={(event) => {
                const value = event.target.value
                setAdminPlayerSearch(value)
                const exactMatches = players.filter((player) => player.screenName.toLocaleLowerCase() === value.trim().toLocaleLowerCase())
                setPlayerId(exactMatches.length === 1 ? exactMatches[0].id : "")
                setAdminPlayerPickerOpen(exactMatches.length !== 1)
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && matchingAdminPlayers.length > 0) {
                  event.preventDefault()
                  document.querySelector<HTMLButtonElement>("#admin-player-suggestions button")?.focus()
                }
                if (event.key === "Escape") setAdminPlayerPickerOpen(false)
                if (event.key === "Enter") {
                  const exactMatches = players.filter((player) => player.screenName.toLocaleLowerCase() === adminPlayerSearch.trim().toLocaleLowerCase())
                  const candidate = exactMatches.length === 1 ? exactMatches[0] : matchingAdminPlayers.length === 1 ? matchingAdminPlayers[0] : null
                  if (candidate) {
                    event.preventDefault()
                    setPlayerId(candidate.id)
                    setAdminPlayerSearch(candidate.screenName)
                    setAdminPlayerPickerOpen(false)
                  }
                }
              }}
            />
            {adminPlayerPickerOpen && matchingAdminPlayers.length > 0 && <div id="admin-player-suggestions" className={styles.adminPlayerSuggestions} role="listbox" aria-label="Registered Global Players">
              {matchingAdminPlayers.map((player) => <button key={player.id} type="button" role="option" aria-selected={player.id === playerId} onMouseDown={(event) => event.preventDefault()} onClick={() => { setPlayerId(player.id); setAdminPlayerSearch(player.screenName); setAdminPlayerPickerOpen(false) }}>{player.screenName}</button>)}
            </div>}
          </label>
          <label className={styles.adminRoundPicker}>Round
            <select aria-label="Scoring round" value={roundId} onChange={(event) => setRoundId(event.target.value)}>
              {rounds.map((round) => <option key={round.id} value={round.id}>R{round.round_number} · {round.label} · {round.course_name} {round.difficulty}</option>)}
            </select>
          </label>
        </div>
        {!currentPlayer && <p className={styles.note}>Choose a registered Global Player to load that player&apos;s saved score for this round.</p>}
        {currentPlayer && activeRound && (() => { const persisted = roundScores.filter((score) => score.canonical_player_id === currentPlayer.id).sort((a, b) => Number(b.score_kind === "official") - Number(a.score_kind === "official") || b.updated_at.localeCompare(a.updated_at))[0]; const fieldKey = `${roundId}:${currentPlayer.id}`; const rowValues = adminFieldHoles[fieldKey] ?? Array.from({ length: 18 }, (_, index) => persisted?.hole_strokes?.[index] == null ? "" : String(persisted.hole_strokes[index])); const running = runningToPar(rowValues); const statusClass = adminFieldHoles[fieldKey] === undefined ? scoreColorClass[scoreDisplayStatus(persisted?.score_kind || null)] : styles.scoreLive; return <><p className={styles.parTotal}>Course PAR <strong>{activeRound.par_by_hole.reduce((sum, hole) => sum + hole, 0)}</strong><span> · strokes <strong>{running.strokes || "—"}</strong> · to par <strong className={running.holes ? statusClass : styles.scoreMissing}>{running.holes ? formatToPar(running.score) : "—"}</strong> · {running.holes}/18 holes</span></p><div className={styles.adminScoreEntry}><div className={styles.adminFieldScroll}><div className={`${styles.adminFieldRow} ${styles.adminFieldHead}`}><strong>HOLE</strong>{Array.from({ length: 18 }, (_, index) => <strong key={index}>{index + 1}</strong>)}<strong>PAR</strong></div><div className={`${styles.adminFieldRow} ${styles.adminFieldPars}`}><strong>PAR</strong>{activeRound.par_by_hole.map((par, index) => <strong key={index}>{par}</strong>)}<strong>{activeRound.par_by_hole.reduce((sum, hole) => sum + hole, 0)}</strong></div><div className={styles.adminFieldRow}><strong className={styles.adminFieldName}>{currentPlayer.screenName}</strong>{rowValues.map((value, index) => <input key={index} aria-label={`${currentPlayer.screenName}, hole ${index + 1}`} id={`admin-field-hole-${index + 1}`} type="number" min="1" max="99" inputMode="numeric" value={value} onChange={(event) => { const next = event.target.value; setAdminFieldHoles((previous) => ({ ...previous, [fieldKey]: rowValues.map((hole, position) => position === index ? next : hole) })); if (next && index < 17) document.getElementById(`admin-field-hole-${index + 2}`)?.focus() }} />)}<strong>{running.strokes || "—"}</strong></div></div></div><div className={styles.roomActions}><button type="button" disabled={busy || !running.holes} onClick={() => void saveFieldScore(currentPlayer.id, rowValues, false)}>Save provisional</button><button type="button" className={styles.primary} disabled={busy || !running.holes} onClick={() => void saveFieldScore(currentPlayer.id, rowValues, true)}>Save verified</button></div></> })()}
        {rounds.map((dayRound) => <section key={dayRound.id} className={styles.verificationDay}><h3>{roundDayLabel(dayRound)} · {dayRound.round_date}</h3><div className={styles.reviewList}>{submissions.filter((submission) => submission.round_id === dayRound.id).map((submission) => <article key={submission.id}><span>{players.find((player) => player.id === submission.canonical_player_id)?.screenName} · {submission.total_strokes} · {submission.status}</span><button type="button" onClick={() => void supabase.functions.invoke("scoring-studio-evidence", { body: { action: "sign", evidencePath: submission.evidence_path } }).then(({ data, error }) => { if (error) throw error; if (data?.signedUrl) setAdminEvidenceUrl(data.signedUrl) }).catch(() => setMessage("Unable to open scorecard evidence."))}>View evidence</button>{submission.status === "pending" && <><button type="button" onClick={() => void review(submission.id, true)}>Verify</button><button type="button" onClick={() => void review(submission.id, false)}>Decline</button></>}</article>)}</div></section>)}
      </section>}
      {adminEvidenceUrl && adminOnly && isAdmin && <div className={styles.adminEvidence}><button type="button" onClick={() => setAdminEvidenceUrl("")}>Close evidence</button><img src={adminEvidenceUrl} alt="Submitted room scorecard evidence" /></div>}
      {adminOnly && isAdmin && adminView === "rooms" && <section className={styles.panel}><p className={styles.eyebrow}>Manual room management · canonical Global Players</p><h2>Universal Room Builder</h2><div className={styles.roomAdmin}><label>Select room<select value={roomId} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value); setRoomId(event.target.value); if (room) { setRoundId(room.round_id); setRoomName(room.room_name); setCourse(room.course_name); setDifficulty(room.difficulty); setStartsAt(dateTimeInputInZone(room.starts_at, room.time_zone)); setCapacity(room.capacity) } }}><option value="">Create a new room</option>{rooms.map((room) => <option key={room.id} value={room.id}>R{rounds.find((round) => round.id === room.round_id)?.round_number ?? "?"} · {room.room_name}{room.published ? " · Published" : " · Draft"}</option>)}</select></label><label>Exact room name<input value={roomName} onChange={(event) => setRoomName(event.target.value)} /></label><label>Course<input value={course} onChange={(event) => setCourse(event.target.value)} /></label><label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as "easy" | "hard")}><option value="easy">Easy</option><option value="hard">Hard</option></select></label><label>Start time · Eastern<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label>Capacity<input type="number" min="1" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} /></label><p>Assigned: {selectedRoom ? roster(selectedRoom) : "Select or create a room."}</p><div className={styles.roomActions}><button type="button" onClick={() => void saveRoom(true)}>Create draft room</button>{selectedRoom && <><button type="button" onClick={() => void saveRoom(false)}>Save room changes</button><button type="button" onClick={() => void assignPlayer(true)}>Add / transfer selected Global Player</button><button type="button" onClick={() => void assignPlayer(false)}>Remove selected Global Player</button><button type="button" className={styles.primary} onClick={() => void publishRoom(!selectedRoom.published)}>{selectedRoom.published ? "Unpublish room" : "Publish room"}</button></>}</div></div></section>}
      {message && <p className={styles.toast} role="status">{message}</p>}
    </div>
    {!adminOnly && popupRoom && <RoomNotificationPopup config={config} room={popupRoom} onDismiss={() => { if (popup?.notification_pending) void dismiss(popup); setOpenedRoom(null) }} onOpenScorecard={() => openRoomScorecard(popupRoom)} />}
  </main>
}
