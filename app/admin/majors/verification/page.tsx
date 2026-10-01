"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ScorecardPanViewport, ScorecardZoomControls, useScorecardImageView } from "@/components/scorecards/ScorecardZoomViewer"
import { formatMajorToPar, majorRoundDayLabel, type MajorEvent, type MajorPlayDay, type MajorPlayerScorecard } from "@/lib/majors"
import { formatMastersAdminDateTime, formatMastersAdminTime } from "@/lib/mastersSignupDisplay"
import { supabase } from "@/lib/supabase"
import styles from "./page.module.css"

type AdminRoomProof = { id: string; schedule_group_id: string; image_url: string; uploaded_at: string; uploaded_by_player_id: string; uploader_screen_name: string; revision: number }
type RoomGroup = { key: string; dayNumber: MajorPlayerScorecard["day_number"]; roomLabel: string; startsAt: string | null; roster: NonNullable<MajorPlayerScorecard["room_roster"]>; instructions: string | null; cards: MajorPlayerScorecard[]; proof?: AdminRoomProof }

export default function MajorVerificationPage() {
  const [events, setEvents] = useState<MajorEvent[]>([]), [days, setDays] = useState<MajorPlayDay[]>([]), [cards, setCards] = useState<MajorPlayerScorecard[]>([]), [proofs, setProofs] = useState<AdminRoomProof[]>([])
  const [eventId, setEventId] = useState(""), [message, setMessage] = useState("")
  const loadEvents = useCallback(async () => {
    const [eventResult, dayResult] = await Promise.all([supabase.from("major_events").select("*").order("slug"), supabase.from("major_play_days").select("*").order("day_number")])
    setEvents((eventResult.data as MajorEvent[]) || []); setDays((dayResult.data as MajorPlayDay[]) || [])
    setEventId((current) => current || String(eventResult.data?.find((event) => event.slug === "masters")?.id || eventResult.data?.[0]?.id || ""))
    setMessage(eventResult.error?.message || dayResult.error?.message || "")
  }, [])
  const refreshQueue = useCallback(async () => {
    if (!eventId) return
    const [queueResult, proofResult] = await Promise.all([supabase.rpc("get_major_scorecard_verification_queue", { p_major_event_id: eventId }), fetch(`/api/admin/majors/room-scorecards?${new URLSearchParams({ eventId })}`, { cache: "no-store" })])
    const proofBody = await proofResult.json() as { proofs?: AdminRoomProof[]; error?: string }
    setCards((queueResult.data as MajorPlayerScorecard[]) || []); setProofs(proofBody.proofs || []); setMessage(queueResult.error?.message || (!proofResult.ok ? proofBody.error : "") || "")
  }, [eventId])
  // Initial authenticated admin synchronization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadEvents() }, [loadEvents])
  // Reload the selected event's protected verification queue.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshQueue() }, [refreshQueue])
  const selectedEvent = events.find((event) => event.id === eventId), eventDays = days.filter((day) => day.major_event_id === eventId)
  const rooms = useMemo(() => groupVerificationRooms(cards, proofs), [cards, proofs])
  const waitingScores = cards.filter((card) => card.status === "submitted").length, waitingRooms = rooms.filter((room) => room.cards.some((card) => card.status === "submitted")).length
  async function scoreAction(name: "verify_major_scorecard" | "reopen_major_scorecard", id: string) {
    const notes = window.prompt(name === "verify_major_scorecard" ? "Optional verification notes" : "Correction needed (required for the player audit trail)") || ""
    if (name === "reopen_major_scorecard" && !notes.trim()) return
    const result = await supabase.rpc(name, { p_scorecard_id: id, p_notes: notes.trim() })
    setMessage(result.error?.message || (name === "verify_major_scorecard" ? "Score verified." : "Player score marked as needing correction.")); if (!result.error) await refreshQueue()
  }
  async function toggleRound(day: MajorPlayDay) {
    const open = (day as MajorPlayDay & { scoring_entry_open?: boolean }).scoring_entry_open
    const result = await supabase.rpc("set_major_round_scoring_state", { p_play_day_id: day.id, p_is_open: !open })
    setMessage(result.error?.message || "Round entry state updated."); if (!result.error) await loadEvents()
  }
  return <main className={styles.page}><div className={styles.shell}><Link href="/admin/majors/scoring">← Major scoring</Link><header className={styles.header}><p>MASTERS ADMIN</p><h1>SCORE VERIFICATION</h1><span>{waitingRooms} {waitingRooms === 1 ? "ROOM" : "ROOMS"} · {waitingScores} {waitingScores === 1 ? "SCORE" : "SCORES"} TO VERIFY</span></header>
    <label className={styles.eventPicker}>Event<select value={eventId} onChange={(event) => setEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
    <section className={styles.roundControls}>{eventDays.map((day) => { const open = (day as MajorPlayDay & { scoring_entry_open?: boolean }).scoring_entry_open; return <article key={day.id}><strong>{majorRoundDayLabel(day.day_number)}</strong><span>{open ? "Player entry open" : "Player entry closed"}</span><button type="button" onClick={() => void toggleRound(day)}>{open ? "Close entry" : "Open entry"}</button></article> })}</section>
    {[1, 2, 3, 4].map((round) => { const roundRooms = rooms.filter((room) => room.dayNumber === round); if (!roundRooms.length) return null; return <section key={round} className={styles.roundSection}><h2>ROUND {round}</h2>{roundRooms.map((room) => <RoomVerification key={room.key} room={room} event={selectedEvent} onAction={scoreAction} />)}</section> })}
    {rooms.length === 0 && <p className={styles.empty}>No Masters scorecards have been submitted yet.</p>}{message && <p className={styles.message} role="status">{message}</p>}</div></main>
}

function groupVerificationRooms(cards: MajorPlayerScorecard[], proofs: AdminRoomProof[]): RoomGroup[] {
  const groups = new Map<string, RoomGroup>()
  for (const card of cards) { const key = card.room_group_id || `${card.play_day_id}:${card.entry_id}`; const current = groups.get(key) || { key, dayNumber: card.day_number, roomLabel: card.room_label || "Room pending", startsAt: card.slot_starts_at, roster: card.room_roster || [], instructions: card.room_instructions || null, cards: [], proof: proofs.find((proof) => proof.schedule_group_id === card.room_group_id) }; current.cards.push(card); groups.set(key, current) }
  return [...groups.values()].toSorted((left, right) => left.dayNumber - right.dayNumber || (left.startsAt || "").localeCompare(right.startsAt || "") || left.roomLabel.localeCompare(right.roomLabel))
}

function RoomVerification({ room, event, onAction }: { room: RoomGroup; event?: MajorEvent; onAction: (name: "verify_major_scorecard" | "reopen_major_scorecard", id: string) => Promise<void> }) {
  const verified = room.cards.filter((card) => card.status === "verified").length, waiting = room.cards.filter((card) => card.status === "submitted").length
  return <details className={styles.room} open={waiting > 0}><summary><div><strong>{room.roomLabel}</strong><span>{room.startsAt ? formatMastersAdminTime(room.startsAt, event?.schedule_timezone) : "Time pending"}</span></div><b>{room.proof ? "Room Scorecard: Uploaded" : "Room Scorecard: Missing"}</b><span>{verified} / {room.cards.length} VERIFIED · {waiting} WAITING</span></summary>
    <div className={styles.roomContext}><section><h3>ROOM ROSTER</h3><ul>{room.roster.map((player) => <li key={player.player_id}>{player.player_screen_name_snapshot}</li>)}</ul>{room.instructions && <><h3>ROOM INSTRUCTIONS</h3><p>{room.instructions}</p></>}</section><RoomProofViewer room={room} /></div>
    <div className={styles.players}>{room.cards.toSorted((left, right) => left.player_screen_name_snapshot.localeCompare(right.player_screen_name_snapshot)).map((card) => <article key={card.id} className={styles.playerCard}><header><div><h3>{card.player_screen_name_snapshot}</h3><p>Submitted: {card.submitted_at ? formatMastersAdminDateTime(card.submitted_at, event?.schedule_timezone) : "Not submitted"}</p></div><strong>{formatMajorToPar(card.score_to_par ?? card.holes.reduce((sum, hole) => sum + hole.strokes - hole.par, 0))}</strong><span data-status={card.status}>{card.status === "reopened" ? "NEEDS CORRECTION" : card.status.toUpperCase()}</span></header><div className={styles.holes}>{card.holes.map((hole) => <span key={hole.hole_number}><small>H{hole.hole_number}</small><b>{hole.strokes}</b><em>Par {hole.par}</em></span>)}</div><div className={styles.actions}>{card.status === "submitted" && <button type="button" onClick={() => void onAction("verify_major_scorecard", card.id)}>VERIFY SCORE</button>}{["submitted", "verified"].includes(card.status) && <button type="button" onClick={() => void onAction("reopen_major_scorecard", card.id)}>NEEDS CORRECTION</button>}</div></article>)}</div>
  </details>
}

function RoomProofViewer({ room }: { room: RoomGroup }) {
  const controller = useScorecardImageView()
  if (!room.proof) return <section className={styles.proofEmpty}><h3>ROOM SCORECARD</h3><p>No shared room scorecard photo submitted.</p></section>
  return <section className={styles.proof}><header><div><h3>ROOM SCORECARD</h3><p>Uploaded by {room.proof.uploader_screen_name} · {formatMastersAdminDateTime(room.proof.uploaded_at)}</p></div><ScorecardZoomControls controller={controller} buttonClassName={styles.viewerButton} /></header><ScorecardPanViewport controller={controller} src={room.proof.image_url} alt={`Shared scorecard for ${room.roomLabel}`} className={styles.viewer} imageClassName={styles.proofImage} /></section>
}
