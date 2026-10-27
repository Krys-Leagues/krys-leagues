"use client"

import { useCallback, useEffect, useState } from "react"
import { MajorAdminWorkspaceLink } from "@/components/admin/majors/MajorAdminWorkspaceLink"

import {
  formatRunningToPar,
  isStaleRevisionError,
  mastersStreamCourseForRound,
  moveStreamParticipant,
  orderStreamParticipants,
  type MastersStreamRoom,
} from "@/lib/mastersStreamScorecard"
import type { MajorEvent, MajorScoringParticipant, MajorScoringSession } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

import styles from "./page.module.css"

export default function MastersSimpleStreamControllerPage() {
  const [rooms, setRooms] = useState<MastersStreamRoom[]>([])
  const [session, setSession] = useState<MajorScoringSession | null>(null)
  const [participants, setParticipants] = useState<MajorScoringParticipant[]>([])
  const [roomChoice, setRoomChoice] = useState("")
  const [confirmingRoom, setConfirmingRoom] = useState<MastersStreamRoom | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const loadSession = useCallback(async (sessionId: string) => {
    const [sessionResult, participantResult] = await Promise.all([
      supabase.from("major_scoring_sessions").select("*").eq("id", sessionId).single(),
      supabase.from("major_scoring_participants").select("*").eq("session_id", sessionId).order("position"),
    ])
    const error = sessionResult.error || participantResult.error
    if (error) throw error
    const loadedSession = sessionResult.data as MajorScoringSession
    const loadedParticipants = (participantResult.data as MajorScoringParticipant[] | null) || []
    setSession(loadedSession)
    setParticipants(orderStreamParticipants(loadedParticipants, loadedSession.stream_participant_order))
  }, [])

  const loadFoundation = useCallback(async () => {
    const eventResult = await supabase
      .from("major_events")
      .select("*")
      .or("slug.eq.masters,name.ilike.%masters%")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (eventResult.error || !eventResult.data) throw eventResult.error || new Error("Masters event not found.")
    const event = eventResult.data as MajorEvent
    const roomResult = await supabase.rpc("get_admin_masters_stream_rooms", { p_major_event_id: event.id })
    if (roomResult.error) throw roomResult.error
    setRooms((roomResult.data || []) as MastersStreamRoom[])

    const activeResult = await supabase
      .from("major_scoring_sessions")
      .select("id")
      .eq("major_event_id", event.id)
      .eq("is_active", true)
      .not("schedule_group_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (activeResult.error) throw activeResult.error
    if (activeResult.data?.id) await loadSession(activeResult.data.id)
  }, [loadSession])

  useEffect(() => {
    // Initial authenticated synchronization with persistent broadcast-only state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFoundation().catch((error: Error) => setMessage(error.message))
  }, [loadFoundation])

  useEffect(() => {
    if (!session?.id) return
    const timer = window.setInterval(() => void loadSession(session.id).catch(() => undefined), 1000)
    return () => window.clearInterval(timer)
  }, [loadSession, session?.id])

  async function loadRoom(room: MastersStreamRoom) {
    const course = mastersStreamCourseForRound(room.day_number)
    setBusy(true)
    const result = await supabase.rpc("load_masters_stream_room", {
      p_schedule_group_id: room.group_id,
      p_confirmed: true,
      p_course_code: course.code,
      p_course_name: course.name,
      p_hole_pars: [...course.pars],
    })
    setBusy(false)
    setConfirmingRoom(null)
    if (result.error) return setMessage(result.error.message)
    await loadFoundation()
    await loadSession(result.data as string)
    setMessage(`${room.group_label} loaded. Simple totals are broadcast-only.`)
  }

  async function changeTotal(participantId: string, delta: -1 | 1) {
    if (!session) return
    const current = session.stream_total_scores?.[participantId] ?? 0
    setBusy(true)
    const result = await supabase.rpc("update_masters_simple_stream_total", {
      p_session_id: session.id,
      p_expected_revision: session.revision,
      p_participant_id: participantId,
      p_total_to_par: current + delta,
    })
    setBusy(false)
    if (result.error) {
      await loadSession(session.id)
      return setMessage(isStaleRevisionError(result.error.message)
        ? "Another controller updated the card. The latest totals were loaded; please try again."
        : result.error.message)
    }
    await loadSession(session.id)
  }

  async function movePlayer(participantId: string, direction: -1 | 1) {
    if (!session) return
    const previous = participants
    const reordered = moveStreamParticipant(previous, participantId, direction)
    if (reordered.every((participant, index) => participant.id === previous[index]?.id)) return
    setParticipants(reordered)
    setBusy(true)
    const result = await supabase.rpc("reorder_masters_stream_participants", {
      p_session_id: session.id,
      p_expected_revision: session.revision,
      p_participant_ids: reordered.map((participant) => participant.id),
    })
    setBusy(false)
    if (result.error) {
      setParticipants(previous)
      await loadSession(session.id)
      return setMessage(isStaleRevisionError(result.error.message)
        ? "Another controller updated the card. The latest order was loaded; please try again."
        : result.error.message)
    }
    await loadSession(session.id)
    setMessage("Player order updated on the controller and OBS card.")
  }

  async function triggerFireworks() {
    if (!session) return
    setBusy(true)
    const result = await supabase.rpc("update_masters_stream_scorecard", {
      p_session_id: session.id,
      p_expected_revision: session.revision,
      p_current_hole: session.current_hole,
      p_scores: [],
      p_trigger_fireworks: true,
    })
    setBusy(false)
    if (result.error) {
      await loadSession(session.id)
      return setMessage(result.error.message)
    }
    await loadSession(session.id)
    setMessage("Hole-in-one fireworks triggered once.")
  }

  const loadedRoom = rooms.find((room) => room.group_id === session?.schedule_group_id)
  const browserOrigin = typeof window === "undefined" ? "" : window.location.origin

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <MajorAdminWorkspaceLink className={styles.back}>← Major workspace</MajorAdminWorkspaceLink>
          <p className={styles.eyebrow}>Protected broadcast-only controller</p>
          <h1>Simple Masters Total Score Card</h1>
          <p>THE MINI-GOLF MASTERS · Cherry Blossom. These totals never change official player scores.</p>
        </div>
        {session && <span className={styles.liveBadge}>● LIVE</span>}
      </header>

      {message && <p className={styles.notice} role="status">{message}</p>}

      <section className={styles.loadPanel}>
        <label>
          <span>Round and published room</span>
          <select value={roomChoice} onChange={(event) => setRoomChoice(event.target.value)}>
            <option value="">Choose a 2–4 player room…</option>
            {rooms.map((room) => (
              <option key={room.group_id} value={room.group_id}>Round {room.day_number} · {room.group_label} · {room.participant_count} players</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!roomChoice || busy} onClick={() => setConfirmingRoom(rooms.find((room) => room.group_id === roomChoice) || null)}>LOAD ROOM</button>
      </section>

      {confirmingRoom && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="simple-load-room-title">
            <h2 id="simple-load-room-title">Load {confirmingRoom.group_label}?</h2>
            <p>Round {confirmingRoom.day_number} with these exact players:</p>
            <ul>{confirmingRoom.roster.map((player) => <li key={player.player_id}>{player.player_screen_name_snapshot}</li>)}</ul>
            <p>Existing broadcast totals and order for this room are restored.</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancel} onClick={() => setConfirmingRoom(null)}>Cancel</button>
              <button type="button" disabled={busy} onClick={() => void loadRoom(confirmingRoom)}>Confirm LOAD ROOM</button>
            </div>
          </section>
        </div>
      )}

      {!session ? <section className={styles.empty}>Load tonight&apos;s published room to begin.</section> : (
        <>
          <section className={styles.context}>
            <div><span>Room</span><strong>{loadedRoom?.group_label || session.label}</strong></div>
            <div><span>Round</span><strong>{loadedRoom?.day_number || "—"}</strong></div>
          </section>

          <section className={styles.playerOrder} aria-labelledby="simple-player-order-title">
            <header>
              <h2 id="simple-player-order-title">PLAYER ORDER</h2>
              <p>Match the order on the actual Walkabout room scorecard.</p>
            </header>
            <ol>
              {participants.map((participant, index) => (
                <li key={participant.id}>
                  <button type="button" aria-label={`Move ${participant.player_screen_name_snapshot} up`} disabled={busy || index === 0} onClick={() => void movePlayer(participant.id, -1)}>↑</button>
                  <strong>{participant.player_screen_name_snapshot}</strong>
                  <button type="button" aria-label={`Move ${participant.player_screen_name_snapshot} down`} disabled={busy || index === participants.length - 1} onClick={() => void movePlayer(participant.id, 1)}>↓</button>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.players}>
            {participants.map((participant) => {
              const total = session.stream_total_scores?.[participant.id] ?? 0
              return (
                <article key={participant.id} className={styles.playerCard}>
                  <h2>{participant.player_screen_name_snapshot}</h2>
                  <div className={styles.stepper}>
                    <button type="button" aria-label={`Decrease ${participant.player_screen_name_snapshot} total`} disabled={busy || total <= -999} onClick={() => void changeTotal(participant.id, -1)}>−</button>
                    <strong>{formatRunningToPar(total)}</strong>
                    <button type="button" aria-label={`Increase ${participant.player_screen_name_snapshot} total`} disabled={busy || total >= 999} onClick={() => void changeTotal(participant.id, 1)}>+</button>
                  </div>
                </article>
              )
            })}
          </section>

          <section className={styles.actions}>
            <button type="button" className={styles.fireworksButton} disabled={busy} onClick={() => void triggerFireworks()}>🎆 HIO FIREWORKS</button>
            <div>
              <strong>SIMPLE SCORECARD OBS URL · 1400 × 240</strong>
              <code>{browserOrigin}/majors/masters-stream/{session.id}/simple</code>
              <strong>HIO FIREWORKS OBS URL · 1920 × 1080</strong>
              <code>{browserOrigin}/majors/masters-stream/{session.id}/fireworks</code>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
