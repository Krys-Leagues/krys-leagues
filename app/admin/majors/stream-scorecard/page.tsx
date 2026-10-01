"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  deriveHoleStrokesFromRunningTotal,
  formatRunningToPar,
  isStaleRevisionError,
  mastersStreamCourseForRound,
  moveStreamParticipant,
  orderStreamParticipants,
  runningToPar,
  runningToParThrough,
  type MastersStreamRoom,
} from "@/lib/mastersStreamScorecard"
import type { MajorEvent, MajorHoleScore, MajorScoringParticipant, MajorScoringSession } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

import styles from "./page.module.css"

export default function MastersStreamControllerPage() {
  const [rooms, setRooms] = useState<MastersStreamRoom[]>([])
  const [session, setSession] = useState<MajorScoringSession | null>(null)
  const [participants, setParticipants] = useState<MajorScoringParticipant[]>([])
  const [scores, setScores] = useState<MajorHoleScore[]>([])
  const [roomChoice, setRoomChoice] = useState("")
  const [confirmingRoom, setConfirmingRoom] = useState<MastersStreamRoom | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const loadSession = useCallback(async (sessionId: string) => {
    const [sessionResult, participantResult, scoreResult] = await Promise.all([
      supabase.from("major_scoring_sessions").select("*").eq("id", sessionId).single(),
      supabase.from("major_scoring_participants").select("*").eq("session_id", sessionId).order("position"),
      supabase.from("major_hole_scores").select("*").eq("session_id", sessionId).order("hole_number"),
    ])
    const error = sessionResult.error || participantResult.error || scoreResult.error
    if (error) throw error
    const loadedSession = sessionResult.data as MajorScoringSession
    const loadedParticipants = (participantResult.data as MajorScoringParticipant[] | null) || []
    setSession(loadedSession)
    setParticipants(orderStreamParticipants(loadedParticipants, loadedSession.stream_participant_order))
    setScores((scoreResult.data as MajorHoleScore[] | null) || [])
  }, [])

  const loadFoundation = useCallback(async () => {
    const eventResult = await supabase
      .from("major_events")
      .select("*")
      .or("slug.eq.masters,name.ilike.%masters%")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (eventResult.error || !eventResult.data) {
      throw eventResult.error || new Error("Masters event not found.")
    }
    const loadedEvent = eventResult.data as MajorEvent
    const roomResult = await supabase.rpc("get_admin_masters_stream_rooms", {
      p_major_event_id: loadedEvent.id,
    })
    if (roomResult.error) throw roomResult.error
    const loadedRooms = (roomResult.data || []) as MastersStreamRoom[]
    setRooms(loadedRooms)

    const activeResult = await supabase
      .from("major_scoring_sessions")
      .select("id")
      .eq("major_event_id", loadedEvent.id)
      .eq("is_active", true)
      .not("schedule_group_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (activeResult.error) throw activeResult.error
    if (activeResult.data?.id) await loadSession(activeResult.data.id)
  }, [loadSession])

  useEffect(() => {
    // Initial authenticated synchronization with the persistent stream-only state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFoundation().catch((error: Error) => setMessage(error.message))
  }, [loadFoundation])

  useEffect(() => {
    if (!session?.id) return
    const timer = window.setInterval(() => {
      void loadSession(session.id).catch(() => undefined)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [loadSession, session?.id])

  const scoreMap = useMemo(() => {
    const map = new Map<string, number>()
    scores.forEach((score) => map.set(`${score.participant_id}:${score.hole_number}`, score.strokes))
    return map
  }, [scores])

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
    setMessage(`${room.group_label} loaded. Its stream state is separate from official Masters scoring.`)
  }

  async function updateRunningTotal(participantId: string, delta: number) {
    if (!session || currentPar == null) return
    const previousRunning = runningToParThrough(scores, participantId, pars, session.current_hole - 1)
    const currentStrokes = scoreMap.get(`${participantId}:${session.current_hole}`)
    const currentRunning = currentStrokes == null
      ? previousRunning
      : previousRunning + currentStrokes - currentPar
    const nextRunning = currentRunning + delta
    const nextStrokes = deriveHoleStrokesFromRunningTotal(previousRunning, nextRunning, currentPar)
    if (nextStrokes < 1 || nextStrokes > 99) {
      setMessage("That running total would create an invalid hole score.")
      return
    }
    await updateBroadcast(
      session.current_hole,
      [{ participant_id: participantId, hole_number: session.current_hole, strokes: nextStrokes }],
      false,
    )
  }

  async function confirmPar(participantId: string) {
    if (!session || currentPar == null) return
    await updateBroadcast(
      session.current_hole,
      [{ participant_id: participantId, hole_number: session.current_hole, strokes: currentPar }],
      false,
    )
  }

  async function correctHole(participantId: string, holeNumber: number, rawValue: string) {
    if (!session) return
    const trimmed = rawValue.trim()
    const strokes = trimmed === "" ? null : Number(trimmed)
    if (strokes != null && (!Number.isInteger(strokes) || strokes < 1 || strokes > 99)) {
      setMessage("Correction scores must be whole numbers from 1 to 99.")
      return
    }
    if (scoreMap.get(`${participantId}:${holeNumber}`) === strokes) return
    await updateBroadcast(
      session.current_hole,
      [{ participant_id: participantId, hole_number: holeNumber, strokes }],
      false,
    )
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
      setMessage(
        isStaleRevisionError(result.error.message)
          ? "Another controller changed the scorecard. The latest player order was loaded; please try again."
          : result.error.message,
      )
      return
    }
    await loadSession(session.id)
    setMessage("Broadcast player order updated on the controller and OBS scorecard.")
  }

  async function updateBroadcast(
    hole: number,
    changedScores: Array<{ participant_id: string; hole_number?: number; strokes: number | null }>,
    fireworks: boolean,
  ) {
    if (!session) return
    setBusy(true)
    const result = await supabase.rpc("update_masters_stream_scorecard", {
      p_session_id: session.id,
      p_expected_revision: session.revision,
      p_current_hole: hole,
      p_scores: changedScores,
      p_trigger_fireworks: fireworks,
    })
    setBusy(false)
    if (result.error) {
      await loadSession(session.id)
      return setMessage(
        isStaleRevisionError(result.error.message)
          ? "Another controller changed the scorecard. The latest state was loaded; please try again."
          : result.error.message,
      )
    }
    await loadSession(session.id)
    setMessage(fireworks ? "Hole-in-one fireworks triggered once." : "Broadcast scorecard updated.")
  }

  const pars = session?.hole_pars || []
  const currentPar = pars[(session?.current_hole || 1) - 1]
  const browserOrigin = typeof window === "undefined" ? "" : window.location.origin
  const loadedRoom = rooms.find((room) => room.group_id === session?.schedule_group_id)

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/majors" className={styles.back}>← Four Majors</Link>
          <p className={styles.eyebrow}>Protected broadcast controller</p>
          <h1>Cherry Masters Live Scorecard</h1>
          <p>Room-driven stream scoring only. Nothing here writes official player scores or results.</p>
        </div>
        {session && <span className={styles.liveBadge}>● LIVE</span>}
      </header>

      {message && <p className={styles.notice} role="status">{message}</p>}

      <section className={styles.loadPanel}>
        <label>
          <span>Published Masters room</span>
          <select value={roomChoice} onChange={(event) => setRoomChoice(event.target.value)}>
            <option value="">Choose a 2–4 player room…</option>
            {rooms.map((room) => (
              <option key={room.group_id} value={room.group_id}>
                Round {room.day_number} · {room.group_label} · {room.participant_count} players
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!roomChoice || busy}
          onClick={() => setConfirmingRoom(rooms.find((room) => room.group_id === roomChoice) || null)}
        >
          LOAD ROOM
        </button>
      </section>

      {confirmingRoom && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="load-room-title">
            <h2 id="load-room-title">Load {confirmingRoom.group_label}?</h2>
            <p>This switches the public OBS card to Round {confirmingRoom.day_number} and these exact players:</p>
            <ul>{confirmingRoom.roster.map((player) => <li key={player.player_id}>{player.player_screen_name_snapshot}</li>)}</ul>
            <p>No scores carry between rooms. Existing stream state for this room is restored if it was previously used.</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.cancel} onClick={() => setConfirmingRoom(null)}>Cancel</button>
              <button type="button" disabled={busy} onClick={() => void loadRoom(confirmingRoom)}>Confirm LOAD ROOM</button>
            </div>
          </section>
        </div>
      )}

      {!session ? (
        <section className={styles.empty}>Load tonight&apos;s published room to begin.</section>
      ) : (
        <>
          <section className={styles.context}>
            <div><span>Room</span><strong>{loadedRoom?.group_label || session.label}</strong></div>
            <div><span>Round</span><strong>{loadedRoom?.day_number || "—"}</strong></div>
            <div><span>Course</span><strong>{session.course_name}</strong></div>
            <div><span>Hole / Par</span><strong>{session.current_hole} / {currentPar}</strong></div>
          </section>

          <nav className={styles.holeNav} aria-label="Hole controls">
            <button type="button" disabled={busy || session.current_hole === 1} onClick={() => void updateBroadcast(session.current_hole - 1, [], false)}>← Previous</button>
            <select value={session.current_hole} disabled={busy} onChange={(event) => void updateBroadcast(Number(event.target.value), [], false)} aria-label="Current hole">
              {pars.map((par, index) => <option key={index + 1} value={index + 1}>Hole {index + 1} · Par {par}</option>)}
            </select>
            <button type="button" disabled={busy || session.current_hole === 18} onClick={() => void updateBroadcast(session.current_hole + 1, [], false)}>Next →</button>
          </nav>

          <section className={styles.playerOrder} aria-labelledby="player-order-title">
            <header>
              <h2 id="player-order-title">PLAYER ORDER</h2>
              <p>Match the player order shown on the Walkabout scorecard.</p>
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
              const value = scoreMap.get(`${participant.id}:${session.current_hole}`)
              const previousRunning = runningToParThrough(
                scores,
                participant.id,
                pars,
                session.current_hole - 1,
              )
              const currentRunning = value == null
                ? previousRunning
                : previousRunning + value - (currentPar || 0)
              const canDecrease = currentPar != null && (value ?? currentPar) > 1
              return (
                <article key={participant.id} className={styles.playerCard}>
                  <h2>{participant.player_screen_name_snapshot}</h2>
                  <p className={styles.runningLabel}>Running to par</p>
                  <div className={styles.stepper}>
                    <button type="button" aria-label={`Decrease ${participant.player_screen_name_snapshot} running to par`} disabled={busy || !canDecrease} onClick={() => void updateRunningTotal(participant.id, -1)}>−</button>
                    <strong>{formatRunningToPar(currentRunning)}</strong>
                    <button type="button" aria-label={`Increase ${participant.player_screen_name_snapshot} running to par`} disabled={busy || currentPar == null || (value ?? currentPar) >= 99} onClick={() => void updateRunningTotal(participant.id, 1)}>+</button>
                  </div>
                  <p className={styles.holeConfirmation}>
                    Current hole: <strong>{session.current_hole}</strong>
                    <span>Hole strokes: <strong>{value ?? "—"}</strong></span>
                  </p>
                  <div className={styles.quickActions}>
                    <button type="button" className={styles.parButton} disabled={busy || currentPar == null} onClick={() => void confirmPar(participant.id)}>CONFIRM PAR</button>
                    {value != null && <button type="button" className={styles.clear} disabled={busy} onClick={() => void updateBroadcast(session.current_hole, [{ participant_id: participant.id, hole_number: session.current_hole, strokes: null }], false)}>Clear hole</button>}
                  </div>
                </article>
              )
            })}
          </section>

          <details className={styles.corrections}>
            <summary>SCORECARD / CORRECTIONS</summary>
            <p>Correct any earlier hole directly. Running totals and the OBS card recalculate automatically.</p>
            {participants.map((participant) => (
              <section key={participant.id} className={styles.correctionPlayer}>
                <header>
                  <h2>{participant.player_screen_name_snapshot}</h2>
                  <span>Running {formatRunningToPar(runningToPar(scores, participant.id, pars))}</span>
                </header>
                {[1, 10].map((firstHole) => (
                  <div key={firstHole} className={styles.correctionNine}>
                    <strong>{firstHole === 1 ? "FRONT NINE" : "BACK NINE"}</strong>
                    <div className={styles.correctionGrid}>
                      {Array.from({ length: 9 }, (_, index) => firstHole + index).map((hole) => {
                        const strokes = scoreMap.get(`${participant.id}:${hole}`)
                        return (
                          <label key={`${participant.id}:${hole}`} className={hole === session.current_hole ? styles.currentCorrection : ""}>
                            <span>H{hole}</span>
                            <small>Par {pars[hole - 1]}</small>
                            <input
                              key={`${participant.id}:${hole}:${strokes ?? "empty"}`}
                              type="number"
                              min="1"
                              max="99"
                              inputMode="numeric"
                              defaultValue={strokes ?? ""}
                              disabled={busy}
                              aria-label={`${participant.player_screen_name_snapshot} hole ${hole} strokes`}
                              onBlur={(event) => void correctHole(participant.id, hole, event.currentTarget.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur()
                              }}
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </details>

          <section className={styles.actions}>
            <button type="button" className={styles.fireworksButton} disabled={busy} onClick={() => void updateBroadcast(session.current_hole, [], true)}>🎆 HIO FIREWORKS</button>
            <div>
              <div className={styles.obsSource}>
                <strong>MASTERS SCORECARD OBS URL · 920 × 420</strong>
                <code>{browserOrigin}/majors/masters-stream/{session.id}</code>
              </div>
              <div className={styles.obsSource}>
                <strong>HIO FIREWORKS OBS URL · 1920 × 1080</strong>
                <code>{browserOrigin}/majors/masters-stream/{session.id}/fireworks</code>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
