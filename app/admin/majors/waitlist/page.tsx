"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { type MajorEvent, type MajorWaitlistEntry, formatMajorDate } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

const MASTERS_EVENT_ID = "c3eb8cee-586d-464b-b3fc-026a975b015e"

export default function MastersWaitlistAdminPage() {
  const [events, setEvents] = useState<MajorEvent[]>([])
  const [eventId, setEventId] = useState(MASTERS_EVENT_ID)
  const [entries, setEntries] = useState<MajorWaitlistEntry[]>([])
  const [message, setMessage] = useState("")
  const [busyId, setBusyId] = useState("")

  const load = useCallback(async (preferredEventId = eventId) => {
    const eventResult = await supabase.from("major_events").select("*").eq("slug", "masters")
    const loadedEvents = (eventResult.data as MajorEvent[] | null) || []
    const selectedId = loadedEvents.some((event) => event.id === preferredEventId)
      ? preferredEventId
      : loadedEvents.find((event) => event.slug === "masters")?.id || loadedEvents[0]?.id || ""
    setEvents(loadedEvents)
    setEventId(selectedId)
    if (!selectedId) {
      setEntries([])
      setMessage(eventResult.error?.message || "No Major events found.")
      return
    }
    const waitlistResult = await supabase.rpc("get_major_waitlist", { p_major_event_id: selectedId })
    setEntries((waitlistResult.data as MajorWaitlistEntry[] | null) || [])
    setMessage(waitlistResult.error?.message || eventResult.error?.message || "")
  }, [eventId])

  useEffect(() => {
    // Initial client-side synchronization for the protected admin queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function promote(entry: MajorWaitlistEntry) {
    if (!window.confirm(`Promote ${entry.screen_name} into the confirmed field? Their saved times will be revalidated first.`)) return
    setBusyId(entry.id); setMessage("")
    const result = await supabase.rpc("promote_major_waitlist_entry", { p_entry_id: entry.id })
    setBusyId("")
    setMessage(result.error?.message || `${entry.screen_name} promoted.`)
    if (!result.error) await load(eventId)
  }

  async function remove(entry: MajorWaitlistEntry) {
    const notes = window.prompt(`Reason for removing ${entry.screen_name} from the wait list:`)
    if (notes === null || !notes.trim()) return
    if (!window.confirm(`Remove ${entry.screen_name} from the Masters wait list?`)) return
    setBusyId(entry.id); setMessage("")
    const result = await supabase.rpc("remove_major_waitlist_entry", { p_entry_id: entry.id, p_notes: notes.trim() })
    setBusyId("")
    setMessage(result.error?.message || `${entry.screen_name} removed.`)
    if (!result.error) await load(eventId)
  }

  const selectedEvent = events.find((event) => event.id === eventId)
  const waiting = entries.filter((entry) => entry.state === "waiting")

  return (
    <main style={page}>
      <div style={header}>
        <div><Link href="/admin/majors" style={back}>← Four Majors</Link><h1 style={title}>Masters Wait List</h1><p style={muted}>Waiting players are preferences only until an administrator promotes them.</p></div>
        <button type="button" onClick={() => void load(eventId)} style={refresh}>Refresh</button>
      </div>
      <label style={field}>Event<select value={eventId} onChange={(event) => { setEventId(event.target.value); void load(event.target.value) }} style={select}>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.slug}</option>)}</select></label>
      {selectedEvent && <p style={muted}>{selectedEvent.name} · {selectedEvent.status} · {waiting.length} waiting</p>}
      {message && <p style={notice}>{message}</p>}
      <section style={panel}>
        <h2>Queue</h2>
        {entries.length === 0 ? <p style={muted}>The wait list is empty.</p> : <div style={list}>{entries.map((entry) => <article key={entry.id} style={card}>
          <div><strong>{entry.state === "waiting" ? `#${waiting.findIndex((item) => item.id === entry.id) + 1} · ` : ""}{entry.screen_name}</strong><code style={uuid}>{entry.player_id}</code><span style={muted}>Joined {formatMajorDate(entry.joined_at)} · {entry.state}</span>{entry.choices.length > 0 && <div style={choices}>{entry.choices.map((choice) => <span key={choice.play_day_id}>{choice.day_label || choice.play_date || choice.play_day_id}: {choice.slot_label || (choice.starts_at ? formatMajorDate(choice.starts_at) : choice.time_slot_id)}</span>)}</div>}{entry.notes && <p style={muted}>Note: {entry.notes}</p>}</div>
          {entry.state === "waiting" && <div style={actions}><button type="button" onClick={() => void promote(entry)} disabled={busyId === entry.id} style={promoteButton}>{busyId === entry.id ? "Working…" : "PROMOTE"}</button><button type="button" onClick={() => void remove(entry)} disabled={busyId === entry.id} style={removeButton}>REMOVE</button></div>}
        </article>)}</div>}
      </section>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#000", color: "white" }
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }
const back: React.CSSProperties = { color: "#94a3b8", textDecoration: "none", fontWeight: 700 }
const title: React.CSSProperties = { margin: "10px 0 4px", fontSize: 38 }
const muted: React.CSSProperties = { color: "#a1a1aa", lineHeight: 1.5 }
const refresh: React.CSSProperties = { padding: "11px 15px", border: "1px solid #52525b", borderRadius: 8, background: "#18181b", color: "white", cursor: "pointer", fontWeight: 700 }
const field: React.CSSProperties = { display: "grid", gap: 6, maxWidth: 500, margin: "26px 0 10px", fontWeight: 700 }
const select: React.CSSProperties = { padding: 11, border: "1px solid #52525b", borderRadius: 8, background: "#09090b", color: "white" }
const notice: React.CSSProperties = { padding: 12, borderRadius: 10, background: "#292524", color: "#fde68a" }
const panel: React.CSSProperties = { marginTop: 22, padding: 22, border: "1px solid #333", borderRadius: 16, background: "#111" }
const list: React.CSSProperties = { display: "grid", gap: 12 }
const card: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 18, padding: 16, border: "1px solid #3f3f46", borderRadius: 12, background: "#09090b" }
const uuid: React.CSSProperties = { display: "block", marginTop: 5, color: "#a1a1aa", fontSize: 11, overflowWrap: "anywhere" }
const choices: React.CSSProperties = { display: "grid", gap: 4, marginTop: 10, color: "#d4d4d8", fontSize: 13 }
const actions: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }
const promoteButton: React.CSSProperties = { padding: "10px 14px", border: 0, borderRadius: 8, background: "#16a34a", color: "white", fontWeight: 800, cursor: "pointer" }
const removeButton: React.CSSProperties = { padding: "10px 14px", border: "1px solid #7f1d1d", borderRadius: 8, background: "#450a0a", color: "#fecaca", fontWeight: 800, cursor: "pointer" }
