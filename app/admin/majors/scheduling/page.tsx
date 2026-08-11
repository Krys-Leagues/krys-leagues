"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { formatMajorSlot, toDateTimeLocal, type MajorDayChoice, type MajorEntry, type MajorEvent, type MajorPlayDay, type MajorTimeSlot } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

export default function MajorSchedulingAdminPage() {
  const [events, setEvents] = useState<MajorEvent[]>([])
  const [eventId, setEventId] = useState("")
  const [days, setDays] = useState<MajorPlayDay[]>([])
  const [slots, setSlots] = useState<MajorTimeSlot[]>([])
  const [entries, setEntries] = useState<MajorEntry[]>([])
  const [choices, setChoices] = useState<MajorDayChoice[]>([])
  const [message, setMessage] = useState("")
  const selectedEvent = events.find((event) => event.id === eventId)

  const loadSchedule = useCallback(async (id: string) => {
    if (!id) return
    const dayResult = await supabase.from("major_play_days").select("*").eq("major_event_id", id).order("day_number")
    const loadedDays = (dayResult.data as MajorPlayDay[] | null) || []
    const dayIds = loadedDays.map((day) => day.id)
    const [slotResult, entryResult] = await Promise.all([
      dayIds.length ? supabase.from("major_time_slots").select("*").in("play_day_id", dayIds).order("starts_at") : Promise.resolve({ data: [], error: null }),
      supabase.from("major_entries").select("*").eq("major_event_id", id).order("player_screen_name_snapshot"),
    ])
    const loadedEntries = (entryResult.data as MajorEntry[] | null) || []
    const entryIds = loadedEntries.map((entry) => entry.id)
    const choiceResult = entryIds.length ? await supabase.from("major_entry_day_choices").select("*").in("entry_id", entryIds) : { data: [], error: null }
    setDays(loadedDays); setSlots((slotResult.data as MajorTimeSlot[] | null) || []); setEntries(loadedEntries); setChoices((choiceResult.data as MajorDayChoice[] | null) || [])
    setMessage(dayResult.error?.message || slotResult.error?.message || entryResult.error?.message || choiceResult.error?.message || "")
  }, [])

  useEffect(() => { void (async () => {
    const result = await supabase.from("major_events").select("*").order("slug")
    const loaded = (result.data as MajorEvent[] | null) || []
    setEvents(loaded); setEventId(loaded[0]?.id || "")
    if (loaded[0]) await loadSchedule(loaded[0].id)
  })() }, [loadSchedule])

  async function saveDay(dayNumber: number, form: HTMLFormElement) {
    const data = new FormData(form)
    const existing = days.find((day) => day.day_number === dayNumber)
    const result = await supabase.from("major_play_days").upsert({ id: existing?.id, major_event_id: eventId, day_number: dayNumber, label: String(data.get("label")), play_date: String(data.get("date")), choices_locked: data.get("locked") === "on" }, { onConflict: "major_event_id,day_number" })
    setMessage(result.error?.message || `Day ${dayNumber} saved.`); if (!result.error) await loadSchedule(eventId)
  }

  async function addSlot(dayId: string, form: HTMLFormElement) {
    const data = new FormData(form); const localTime = String(data.get("time"))
    const result = await supabase.from("major_time_slots").insert({ play_day_id: dayId, starts_at: new Date(localTime).toISOString(), label: String(data.get("label")) || null })
    setMessage(result.error?.message || "Time added."); if (!result.error) { form.reset(); await loadSchedule(eventId) }
  }

  async function saveAssignment(choiceId: string, value: string) {
    const result = await supabase.from("major_entry_day_choices").update({ assignment_location: value.trim() || null }).eq("id", choiceId)
    setMessage(result.error?.message || "Assignment saved."); if (!result.error) await loadSchedule(eventId)
  }

  async function saveOpening(form: HTMLFormElement) {
    const data = new FormData(form)
    const result = await supabase.from("major_events").update({
      signup_capacity: data.get("capacity") ? Number(data.get("capacity")) : null,
      public_signup_opens_at: data.get("public_open") ? new Date(String(data.get("public_open"))).toISOString() : null,
      priority_signup_enabled: data.get("priority_enabled") === "on",
      priority_signup_opens_at: data.get("priority_open") ? new Date(String(data.get("priority_open"))).toISOString() : null,
      priority_source_event_id: data.get("priority_source") ? String(data.get("priority_source")) : null,
      minimum_public_spots_at_open: data.get("public_minimum") ? Number(data.get("public_minimum")) : null,
    }).eq("id", eventId)
    setMessage(result.error?.message || "Signup opening settings saved.")
    if (!result.error) {
      setEvents((current) => current.map((event) => event.id === eventId ? { ...event,
        signup_capacity: data.get("capacity") ? Number(data.get("capacity")) : null,
        public_signup_opens_at: data.get("public_open") ? new Date(String(data.get("public_open"))).toISOString() : null,
        priority_signup_enabled: data.get("priority_enabled") === "on",
        priority_signup_opens_at: data.get("priority_open") ? new Date(String(data.get("priority_open"))).toISOString() : null,
        priority_source_event_id: data.get("priority_source") ? String(data.get("priority_source")) : null,
        minimum_public_spots_at_open: data.get("public_minimum") ? Number(data.get("public_minimum")) : null,
      } : event))
    }
  }

  async function releaseSpots(form: HTMLFormElement) {
    const amount = Number(new FormData(form).get("release"))
    const result = await supabase.rpc("release_additional_major_spots", { p_major_event_id: eventId, p_additional_spots: amount })
    setMessage(result.error?.message || `${amount} additional spots released. This event cannot be expanded again.`)
    if (!result.error && result.data) setEvents((current) => current.map((event) => event.id===eventId ? result.data as MajorEvent : event))
  }

  return <main style={page}>
    <Link href="/admin/majors" style={link}>← Four Majors admin</Link><h1>Four-day signup schedule</h1>
    <p style={muted}>Enter times in this browser&apos;s time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Players see the same instant converted to their own time zone.</p>
    <select style={input} value={eventId} onChange={(e) => { setEventId(e.target.value); void loadSchedule(e.target.value) }}>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>
    {message && <p style={notice}>{message}</p>}
    {selectedEvent && <section style={card}><h2>Field and opening</h2>
      <form key={selectedEvent.id} onSubmit={(e) => { e.preventDefault(); void saveOpening(e.currentTarget) }}>
        <div style={settingsGrid}><label style={field}>Total field capacity<input name="capacity" type="number" min="1" defaultValue={selectedEvent.signup_capacity || 50} style={input} /></label><label style={field}>Public signup opens<input name="public_open" type="datetime-local" defaultValue={toDateTimeLocal(selectedEvent.public_signup_opens_at)} style={input} /></label><label style={field}>Minimum public spots at opening<input name="public_minimum" type="number" min="1" defaultValue={selectedEvent.minimum_public_spots_at_open || ""} placeholder="Not decided" style={input} /></label><label style={field}>Future priority opening<input name="priority_open" type="datetime-local" defaultValue={toDateTimeLocal(selectedEvent.priority_signup_opens_at)} style={input} /></label><label style={field}>Priority source Major<select name="priority_source" defaultValue={selectedEvent.priority_source_event_id || ""} style={input}><option value="">None — first Major</option>{events.filter((event) => event.id!==eventId).map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label></div>
        <label style={check}><input name="priority_enabled" type="checkbox" defaultChecked={selectedEvent.priority_signup_enabled} /> Enable previous-Major priority access</label>
        {!selectedEvent.priority_signup_enabled && <p style={muted}>Priority access is inactive. This is the correct setting for the first Major.</p>}
        <button style={button}>Save opening settings</button>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); void releaseSpots(e.currentTarget) }} style={releaseBox}><h3>One-time later reopening</h3>{selectedEvent.later_release_used_at ? <p style={notice}>Used: {selectedEvent.later_release_spots} additional spots. No further release is permitted.</p> : <><label style={field}>Additional spots (10–50)<input name="release" type="number" min="10" max="50" required style={input} /></label><button style={button}>Release spots once</button></>}</form>
    </section>}
    <div style={grid}>{[1,2,3,4].map((number) => {
      const day = days.find((item) => item.day_number === number)
      return <section key={`${eventId}-${number}`} style={card}><h2>Day {number}</h2>
        <form onSubmit={(e) => { e.preventDefault(); void saveDay(number, e.currentTarget) }}>
          <label style={field}>Label<input name="label" required defaultValue={day?.label || `Round ${number}`} style={input} /></label>
          <label style={field}>Official date<input name="date" type="date" required defaultValue={day?.play_date || ""} style={input} /></label>
          <label style={check}><input name="locked" type="checkbox" defaultChecked={day?.choices_locked} /> Lock player choices for this day</label>
          <button style={button}>Save day</button>
        </form>
        {day && <><h3>Available times</h3>{slots.filter((slot) => slot.play_day_id === day.id).map((slot) => <p key={slot.id} style={slotRow}>{formatMajorSlot(slot.starts_at)}{slot.label ? ` · ${slot.label}` : ""}</p>)}
          <form onSubmit={(e) => { e.preventDefault(); void addSlot(day.id, e.currentTarget) }}>
            <label style={field}>Time<input name="time" type="datetime-local" required style={input} /></label><label style={field}>Label (optional)<input name="label" style={input} /></label><button style={button}>Add time</button>
          </form></>}
      </section>
    })}</div>
    <section style={card}><h2>Player choices and assigned locations</h2><p style={muted}>Players choose before the cut. Assign the course, lobby, or other meeting location here.</p>
      {choices.map((choice) => { const entry = entries.find((item) => item.id === choice.entry_id); const day = days.find((item) => item.id === choice.play_day_id); const slot = slots.find((item) => item.id === choice.time_slot_id); return <form key={choice.id} style={assignmentRow} onSubmit={(e) => { e.preventDefault(); void saveAssignment(choice.id, String(new FormData(e.currentTarget).get("location"))) }}><strong>{entry?.player_screen_name_snapshot}</strong><span>Day {day?.day_number} · {slot ? formatMajorSlot(slot.starts_at) : "Unknown time"}</span><input name="location" defaultValue={choice.assignment_location || ""} placeholder="Course / lobby / location" style={input} /><button style={button}>Save</button></form> })}
    </section>
  </main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 28, background: "#020617", color: "white" }
const link: React.CSSProperties = { color: "#93c5fd" }
const muted: React.CSSProperties = { color: "#94a3b8" }
const notice: React.CSSProperties = { color: "#fde68a", fontWeight: 700 }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginTop: 20 }
const card: React.CSSProperties = { marginTop: 18, padding: 20, border: "1px solid #334155", borderRadius: 14, background: "#0f172a" }
const field: React.CSSProperties = { display: "grid", gap: 5, margin: "10px 0", fontWeight: 700 }
const check: React.CSSProperties = { display: "flex", gap: 8, margin: "12px 0" }
const input: React.CSSProperties = { padding: 10, borderRadius: 7, border: "1px solid #475569", background: "#020617", color: "white" }
const button: React.CSSProperties = { padding: "9px 13px", border: 0, borderRadius: 7, background: "#16a34a", color: "white", fontWeight: 800 }
const slotRow: React.CSSProperties = { padding: 8, background: "#020617", borderRadius: 7 }
const assignmentRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(150px,1fr) minmax(240px,2fr) minmax(220px,2fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #334155" }
const settingsGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }
const releaseBox: React.CSSProperties = { marginTop: 20, paddingTop: 16, borderTop: "1px solid #334155" }
