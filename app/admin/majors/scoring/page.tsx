"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  MASTERS_SCORECARD_THEME,
  participantTotal,
  type MajorEvent,
  type MajorHoleScore,
  type MajorScoringParticipant,
  type MajorScoringSession,
} from "@/lib/majors"
import { supabase } from "@/lib/supabase"

type Player = { id: string; screen_name: string; active: boolean | null; status: string | null }

export default function MajorScoringAdminPage() {
  const [events, setEvents] = useState<MajorEvent[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [sessions, setSessions] = useState<MajorScoringSession[]>([])
  const [sessionId, setSessionId] = useState("")
  const [participants, setParticipants] = useState<MajorScoringParticipant[]>([])
  const [scores, setScores] = useState<MajorHoleScore[]>([])
  const [mode, setMode] = useState<2 | 3>(2)
  const [newEventId, setNewEventId] = useState("")
  const [newLabel, setNewLabel] = useState("Live round")
  const [newPlayerIds, setNewPlayerIds] = useState(["", "", ""])
  const [hole, setHole] = useState(1)
  const [holeInputs, setHoleInputs] = useState<Record<string, string>>({})
  const [label, setLabel] = useState("")
  const [active, setActive] = useState(false)
  const [published, setPublished] = useState(false)
  const [themeBackground, setThemeBackground] = useState("")
  const [themeAccent, setThemeAccent] = useState("")
  const [themeText, setThemeText] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) || null,
    [sessionId, sessions]
  )
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedSession?.major_event_id) || null,
    [events, selectedSession]
  )
  const browserOrigin = typeof window === "undefined" ? "" : window.location.origin

  const loadSession = useCallback(async (id: string) => {
    const [participantResponse, scoreResponse] = await Promise.all([
      supabase.from("major_scoring_participants").select("*").eq("session_id", id).order("position"),
      supabase.from("major_hole_scores").select("*").eq("session_id", id).order("hole_number"),
    ])
    const loadedParticipants = (participantResponse.data as MajorScoringParticipant[] | null) || []
    const loadedScores = (scoreResponse.data as MajorHoleScore[] | null) || []
    setParticipants(loadedParticipants)
    setScores(loadedScores)
    const session = sessions.find((item) => item.id === id)
    if (session) {
      setHole(session.current_hole)
      setLabel(session.label)
      setActive(session.is_active)
      setPublished(session.is_public)
    }
    setMessage(participantResponse.error?.message || scoreResponse.error?.message || "")
  }, [sessions])

  const loadFoundation = useCallback(async () => {
    const [eventResponse, playerResponse, sessionResponse] = await Promise.all([
      supabase.from("major_events").select("*").order("slug"),
      supabase.from("players").select("id, screen_name, active, status").order("screen_name"),
      supabase.from("major_scoring_sessions").select("*").order("updated_at", { ascending: false }),
    ])
    const loadedEvents = (eventResponse.data as MajorEvent[] | null) || []
    const loadedSessions = (sessionResponse.data as MajorScoringSession[] | null) || []
    setEvents(loadedEvents)
    setPlayers((playerResponse.data as Player[] | null) || [])
    setSessions(loadedSessions)
    setNewEventId((current) => current || loadedEvents[0]?.id || "")
    setMessage(eventResponse.error?.message || playerResponse.error?.message || sessionResponse.error?.message || "")
  }, [])

  useEffect(() => {
    // Initial authenticated Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFoundation()
  }, [loadFoundation])

  useEffect(() => {
    if (!sessionId) return
    // Load the selected persistent session and all saved holes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession(sessionId)
  }, [loadSession, sessionId])

  useEffect(() => {
    const next: Record<string, string> = {}
    participants.forEach((participant) => {
      const saved = scores.find((score) => score.participant_id === participant.id && score.hole_number === hole)
      next[participant.id] = saved ? String(saved.strokes) : ""
    })
    // Form inputs intentionally mirror the selected persisted hole.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHoleInputs(next)
  }, [hole, participants, scores])

  useEffect(() => {
    // Theme form mirrors the selected event configuration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeBackground(selectedEvent?.scorecard_background_url || "")
    setThemeAccent(selectedEvent?.scorecard_accent_color || "")
    setThemeText(selectedEvent?.scorecard_text_color || "")
  }, [selectedEvent])

  async function createSession() {
    const ids = newPlayerIds.slice(0, mode)
    if (!newEventId || !newLabel.trim() || ids.some((id) => !id)) return setMessage("Choose an event, label, and every player.")
    setBusy(true)
    const response = await supabase.rpc("create_major_scoring_session", {
      p_major_event_id: newEventId,
      p_label: newLabel.trim(),
      p_player_ids: ids,
    })
    setBusy(false)
    if (response.error) return setMessage(response.error.message)
    await loadFoundation()
    setSessionId(response.data as string)
    setMessage("Scoring session created. Player names were snapshotted from canonical UUIDs.")
  }

  async function saveSession() {
    if (!selectedSession) return
    setBusy(true)
    const response = await supabase.rpc("update_major_scoring_session", {
      p_session_id: selectedSession.id,
      p_label: label,
      p_current_hole: hole,
      p_is_active: active,
      p_is_public: published,
    })
    setBusy(false)
    if (response.error) return setMessage(response.error.message)
    await loadFoundation()
    setMessage("Session state saved.")
  }

  async function saveHole() {
    if (!selectedSession) return
    setBusy(true)
    for (const participant of participants) {
      const raw = holeInputs[participant.id]?.trim() || ""
      const existing = scores.some((score) => score.participant_id === participant.id && score.hole_number === hole)
      if (!raw && existing) {
        const clearResponse = await supabase.rpc("clear_major_hole_score", { p_session_id: selectedSession.id, p_participant_id: participant.id, p_hole_number: hole })
        if (clearResponse.error) { setBusy(false); return setMessage(clearResponse.error.message) }
      }
    }
    const filled = participants.flatMap((participant) => {
      const raw = holeInputs[participant.id]?.trim()
      return raw ? [{ participant_id: participant.id, strokes: Number(raw) }] : []
    })
    if (filled.length) {
      const response = await supabase.rpc("save_major_hole_scores", { p_session_id: selectedSession.id, p_hole_number: hole, p_scores: filled })
      if (response.error) { setBusy(false); return setMessage(response.error.message) }
    }
    setBusy(false)
    await loadSession(selectedSession.id)
    setMessage(`Hole ${hole} saved.`)
  }

  async function saveTheme() {
    if (!selectedEvent) return
    setBusy(true)
    const response = await supabase.rpc("save_major_scorecard_theme", {
      p_major_event_id: selectedEvent.id,
      p_background_url: themeBackground,
      p_accent_color: themeAccent,
      p_text_color: themeText,
    })
    setBusy(false)
    if (response.error) return setMessage(response.error.message)
    await loadFoundation()
    setMessage("Major scorecard visual configuration saved.")
  }

  function useMastersArtwork() {
    setThemeBackground(MASTERS_SCORECARD_THEME.backgroundUrl)
    setThemeAccent(MASTERS_SCORECARD_THEME.accentColor)
    setThemeText(MASTERS_SCORECARD_THEME.textColor)
    setMessage("Masters artwork selected. Save the visual configuration to apply it to this Major.")
  }

  const updateNewPlayer = (index: number, value: string) =>
    setNewPlayerIds((current) => current.map((id, position) => position === index ? value : id))

  return (
    <main style={page}>
      <header style={header}>
        <div><Link href="/admin/majors" style={back}>← Four Majors</Link><h1>Live Major Scoring</h1><p style={muted}>Remote persistent controls for large and compact broadcast scorecards.</p></div>
      </header>
      {message && <p style={notice}>{message}</p>}
      <div style={columns}>
        <aside style={panel}>
          <h2>Create session</h2>
          <Field label="Major"><select value={newEventId} onChange={(event) => setNewEventId(event.target.value)} style={input}>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></Field>
          <Field label="Session label"><input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} style={input} /></Field>
          <Field label="Players"><select value={mode} onChange={(event) => setMode(Number(event.target.value) as 2 | 3)} style={input}><option value={2}>2-player</option><option value={3}>3-player</option></select></Field>
          {Array.from({ length: mode }, (_, index) => <Field key={index} label={`Player ${index + 1}`}><select value={newPlayerIds[index]} onChange={(event) => updateNewPlayer(index, event.target.value)} style={input}><option value="">Choose canonical player…</option>{players.map((player) => <option key={player.id} value={player.id}>{player.screen_name} · {player.id}</option>)}</select></Field>)}
          <button onClick={createSession} disabled={busy} style={primary}>Create scoring session</button>

          <h2 style={sectionTitle}>Open session</h2>
          <div style={sessionList}>{sessions.map((session) => {
            const event = events.find((item) => item.id === session.major_event_id)
            return <button key={session.id} onClick={() => setSessionId(session.id)} style={session.id === sessionId ? activeSessionButton : sessionButton}><strong>{session.label}</strong><span>{event?.name || "Major"} · {session.participant_count} players</span><small>{session.is_active ? "Active" : "Inactive"} · {session.is_public ? "Published" : "Private"}</small></button>
          })}</div>
        </aside>

        <section style={panel}>
          {!selectedSession ? <p style={muted}>Create or open a scoring session.</p> : <>
            <h2>{selectedEvent?.name} · {selectedSession.participant_count}-player scorecard</h2>
            <div style={formGrid}>
              <Field label="Session label"><input value={label} onChange={(event) => setLabel(event.target.value)} style={input} /></Field>
              <Field label="Current/edit hole"><select value={hole} onChange={(event) => setHole(Number(event.target.value))} style={input}>{Array.from({ length: 18 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></Field>
            </div>
            <div style={checks}><label><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active session</label><label><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> Public browser source</label></div>
            <button onClick={saveSession} disabled={busy} style={secondary}>Save session state</button>

            <h2 style={sectionTitle}>Hole {hole}</h2>
            <div style={scoreGrid}>{participants.map((participant) => <Field key={participant.id} label={participant.player_screen_name_snapshot}><input type="number" min={1} max={99} value={holeInputs[participant.id] || ""} onChange={(event) => setHoleInputs((current) => ({ ...current, [participant.id]: event.target.value }))} style={scoreInput} /><small style={uuid}>{participant.player_id}</small></Field>)}</div>
            <button onClick={saveHole} disabled={busy} style={primary}>Save/correct hole {hole}</button>

            <h2 style={sectionTitle}>Running totals</h2>
            <div style={totals}>{participants.map((participant) => <div key={participant.id} style={totalCard}><strong>{participant.player_screen_name_snapshot}</strong><span>{participantTotal(scores, participant.id)}</span></div>)}</div>

            <h2 style={sectionTitle}>Browser-source URLs</h2>
            <p style={url}><code>{browserOrigin}/majors/live/{selectedSession.id}/compact</code></p>
            <p style={url}><code>{browserOrigin}/majors/live/{selectedSession.id}/large</code></p>

            <h2 style={sectionTitle}>Existing scorecard visual</h2>
            <p style={muted}>Point this event at the established scorecard image when it is added to <code>public/</code>. The large display keeps that image as its background.</p>
            <Field label="Background image path or HTTPS URL"><input value={themeBackground} onChange={(event) => setThemeBackground(event.target.value)} placeholder="/major-scorecards/masters.png" style={input} /></Field>
            <div style={formGrid}><Field label="Accent color"><input value={themeAccent} onChange={(event) => setThemeAccent(event.target.value)} placeholder="#D4AF37" style={input} /></Field><Field label="Text color"><input value={themeText} onChange={(event) => setThemeText(event.target.value)} placeholder="#FFFFFF" style={input} /></Field></div>
            <div style={actionRow}><button onClick={useMastersArtwork} disabled={busy} style={mastersButton}>Use Masters artwork</button><button onClick={saveTheme} disabled={busy} style={secondary}>Save visual configuration</button></div>
          </>}
        </section>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={field}><span style={fieldLabel}>{label}</span>{children}</label> }

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#000", color: "white" }
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", marginBottom: 20 }
const back: React.CSSProperties = { color: "#94a3b8", textDecoration: "none", fontWeight: 700 }
const muted: React.CSSProperties = { color: "#a1a1aa", lineHeight: 1.5 }
const notice: React.CSSProperties = { padding: 12, borderRadius: 9, background: "#292524", color: "#fde68a" }
const columns: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(300px,.65fr) minmax(0,1.35fr)", gap: 18, alignItems: "start" }
const panel: React.CSSProperties = { padding: 20, border: "1px solid #3f3f46", borderRadius: 15, background: "#111" }
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }
const fieldLabel: React.CSSProperties = { color: "#d4d4d8", fontWeight: 700, fontSize: 13 }
const input: React.CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid #52525b", background: "#09090b", color: "white" }
const primary: React.CSSProperties = { padding: "11px 15px", border: 0, borderRadius: 8, background: "#16a34a", color: "white", fontWeight: 800, cursor: "pointer" }
const secondary: React.CSSProperties = { ...primary, background: "#2563eb" }
const sectionTitle: React.CSSProperties = { marginTop: 28 }
const sessionList: React.CSSProperties = { display: "grid", gap: 8 }
const sessionButton: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, padding: 11, textAlign: "left", borderRadius: 8, border: "1px solid #3f3f46", background: "#18181b", color: "white", cursor: "pointer" }
const activeSessionButton: React.CSSProperties = { ...sessionButton, borderColor: "#60a5fa", background: "#172554" }
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }
const checks: React.CSSProperties = { display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }
const scoreGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }
const scoreInput: React.CSSProperties = { ...input, fontSize: 26, fontWeight: 900 }
const uuid: React.CSSProperties = { color: "#71717a", overflowWrap: "anywhere" }
const totals: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }
const totalCard: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: 14, borderRadius: 9, background: "#09090b", border: "1px solid #3f3f46", fontSize: 20 }
const url: React.CSSProperties = { padding: 10, overflowWrap: "anywhere", background: "#09090b", borderRadius: 8, color: "#bfdbfe" }
const actionRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10 }
const mastersButton: React.CSSProperties = { ...primary, background: "#9d174d" }
