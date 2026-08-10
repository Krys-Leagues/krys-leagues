"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { MAJOR_ENTRY_STATUSES, MAJOR_EVENT_STATUSES, formatMajorDate, toDateTimeLocal, type MajorEntry, type MajorEvent } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

type EventDraft = Omit<MajorEvent, "created_at" | "updated_at">

export default function MajorsAdminPage() {
  const [events, setEvents] = useState<MajorEvent[]>([])
  const [entries, setEntries] = useState<MajorEntry[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [playerId, setPlayerId] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadEntries = useCallback(async (eventId: string) => {
    const response = await supabase.from("major_entries").select("*").eq("major_event_id", eventId).order("registered_at")
    setEntries((response.data as MajorEntry[] | null) || [])
    if (response.error) setMessage(response.error.message)
  }, [])

  const loadEvents = useCallback(async (preferredId?: string) => {
    const response = await supabase.from("major_events").select("*").order("slug")
    const loaded = (response.data as MajorEvent[] | null) || []
    const nextId = preferredId || loaded[0]?.id || ""
    const nextEvent = loaded.find((event) => event.id === nextId) || null
    setEvents(loaded)
    setSelectedId(nextId)
    setDraft(nextEvent ? { ...nextEvent } : null)
    setMessage(response.error?.message || "")
    setLoading(false)
    if (nextId) await loadEntries(nextId)
  }, [loadEntries])

  useEffect(() => {
    // Initial client-side Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents()
  }, [loadEvents])

  function selectEvent(event: MajorEvent) {
    setSelectedId(event.id)
    setDraft({ ...event })
    void loadEntries(event.id)
  }

  function setField<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }

  async function saveEvent() {
    if (!draft) return
    setSaving(true)
    setMessage("")
    const response = await supabase.rpc("save_major_event", {
      p_id: draft.id,
      p_slug: draft.slug,
      p_name: draft.name,
      p_year: draft.year,
      p_status: draft.status,
      p_signup_open: draft.signup_open,
      p_starts_at: draft.starts_at,
      p_ends_at: draft.ends_at,
      p_is_public: draft.is_public,
      p_description: draft.description || "",
      p_stream_url: draft.stream_url || "",
      p_stream_platform: draft.stream_platform || "",
      p_stream_label: draft.stream_label || "",
      p_stream_scheduled_at: draft.stream_scheduled_at,
      p_stream_is_live: draft.stream_is_live,
    })
    setSaving(false)
    if (response.error) return setMessage(response.error.message)
    setMessage("Major saved.")
    await loadEvents(draft.id)
  }

  async function addPlayer() {
    if (!draft || !playerId.trim()) return
    const response = await supabase.rpc("admin_register_major_player", { p_major_event_id: draft.id, p_player_id: playerId.trim() })
    if (response.error) return setMessage(response.error.message)
    setPlayerId("")
    setMessage("Player registered.")
    await loadEntries(draft.id)
  }

  async function updateEntryStatus(entryId: string, status: MajorEntry["status"]) {
    const response = await supabase.rpc("set_major_entry_status", { p_entry_id: entryId, p_status: status })
    if (response.error) return setMessage(response.error.message)
    if (draft) await loadEntries(draft.id)
  }

  return (
    <main style={page}>
      <div style={topRow}>
        <div><Link href="/admin" style={backLink}>← Admin</Link><h1 style={title}>Four Majors</h1><p style={muted}>Configure four reusable event records, signup, participants, and streams.</p></div>
        <div style={headerLinks}><Link href="/admin/majors/scoring" style={scoringLink}>Live scoring</Link><Link href="/majors" style={publicLink}>View public Majors</Link></div>
      </div>
      {message && <p style={notice}>{message}</p>}
      {loading ? <p>Loading…</p> : (
        <>
          <nav style={eventTabs}>{events.map((event) => <button key={event.id} onClick={() => selectEvent(event)} style={event.id === selectedId ? activeTab : tab}><strong>{event.name}</strong><span style={tabMeta}>{event.status}{event.is_public ? " · public" : " · private"}</span></button>)}</nav>
          {draft && (
            <div style={columns}>
              <section style={panel}>
                <h2>Event configuration</h2>
                <div style={formGrid}>
                  <Field label="Name"><input value={draft.name} onChange={(event) => setField("name", event.target.value)} style={input} /></Field>
                  <Field label="Public URL slug"><input value={draft.slug} onChange={(event) => setField("slug", event.target.value)} style={input} /></Field>
                  <Field label="Year"><input type="number" value={draft.year || ""} onChange={(event) => setField("year", event.target.value ? Number(event.target.value) : null)} style={input} /></Field>
                  <Field label="Event status"><select value={draft.status} onChange={(event) => setField("status", event.target.value as MajorEvent["status"])} style={input}>{MAJOR_EVENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></Field>
                  <Field label="Starts"><input type="datetime-local" value={toDateTimeLocal(draft.starts_at)} onChange={(event) => setField("starts_at", event.target.value ? new Date(event.target.value).toISOString() : null)} style={input} /></Field>
                  <Field label="Ends"><input type="datetime-local" value={toDateTimeLocal(draft.ends_at)} onChange={(event) => setField("ends_at", event.target.value ? new Date(event.target.value).toISOString() : null)} style={input} /></Field>
                </div>
                <Field label="Public description"><textarea value={draft.description || ""} onChange={(event) => setField("description", event.target.value)} style={textarea} /></Field>
                <div style={checks}>
                  <label><input type="checkbox" checked={draft.signup_open} onChange={(event) => setField("signup_open", event.target.checked)} /> Signup open</label>
                  <label><input type="checkbox" checked={draft.is_public} onChange={(event) => setField("is_public", event.target.checked)} /> Publicly visible</label>
                </div>

                <h2 style={sectionHeading}>Streaming</h2>
                <div style={formGrid}>
                  <Field label="HTTPS stream URL"><input value={draft.stream_url || ""} onChange={(event) => setField("stream_url", event.target.value)} placeholder="https://…" style={input} /></Field>
                  <Field label="Platform"><input value={draft.stream_platform || ""} onChange={(event) => setField("stream_platform", event.target.value)} placeholder="Twitch, YouTube…" style={input} /></Field>
                  <Field label="Display label"><input value={draft.stream_label || ""} onChange={(event) => setField("stream_label", event.target.value)} style={input} /></Field>
                  <Field label="Scheduled"><input type="datetime-local" value={toDateTimeLocal(draft.stream_scheduled_at)} onChange={(event) => setField("stream_scheduled_at", event.target.value ? new Date(event.target.value).toISOString() : null)} style={input} /></Field>
                </div>
                <label style={liveCheck}><input type="checkbox" checked={draft.stream_is_live} onChange={(event) => setField("stream_is_live", event.target.checked)} /> Mark official stream live</label>
                <button onClick={saveEvent} disabled={saving} style={saveButton}>{saving ? "Saving…" : "Save Major"}</button>
              </section>

              <section style={panel}>
                <h2>Entries ({entries.length})</h2>
                <p style={muted}>All entries use the canonical <code>public.players.id</code>. Screen names below are signup snapshots.</p>
                <div style={addRow}><input value={playerId} onChange={(event) => setPlayerId(event.target.value)} placeholder="Canonical player UUID" style={input} /><button onClick={addPlayer} style={smallButton}>Add player</button></div>
                <div style={entryList}>{entries.map((entry) => (
                  <article key={entry.id} style={entryCard}>
                    <div><strong>{entry.player_screen_name_snapshot}</strong><code style={uuid}>{entry.player_id}</code><span style={registered}>Registered {formatMajorDate(entry.registered_at)}</span></div>
                    <select value={entry.status} onChange={(event) => void updateEntryStatus(entry.id, event.target.value as MajorEntry["status"])} style={statusSelect}>{MAJOR_ENTRY_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
                  </article>
                ))}</div>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={field}><span style={labelStyle}>{label}</span>{children}</label> }

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#000", color: "white" }
const topRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }
const backLink: React.CSSProperties = { color: "#94a3b8", textDecoration: "none", fontWeight: 700 }
const title: React.CSSProperties = { margin: "10px 0 4px", fontSize: 38 }
const muted: React.CSSProperties = { color: "#a1a1aa", lineHeight: 1.5 }
const publicLink: React.CSSProperties = { padding: "11px 15px", borderRadius: 9, background: "#1d4ed8", color: "white", textDecoration: "none", fontWeight: 800 }
const scoringLink: React.CSSProperties = { ...publicLink, background: "#16a34a" }
const headerLinks: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" }
const notice: React.CSSProperties = { padding: 12, borderRadius: 10, background: "#292524", color: "#fde68a" }
const eventTabs: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4,minmax(150px,1fr))", gap: 10, margin: "24px 0" }
const tab: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, padding: 14, borderRadius: 12, border: "1px solid #3f3f46", background: "#18181b", color: "white", textAlign: "left", cursor: "pointer" }
const activeTab: React.CSSProperties = { ...tab, borderColor: "#60a5fa", background: "#172554" }
const tabMeta: React.CSSProperties = { color: "#a1a1aa", fontSize: 12, textTransform: "capitalize" }
const columns: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(360px,.8fr)", gap: 18, alignItems: "start" }
const panel: React.CSSProperties = { padding: 22, border: "1px solid #333", borderRadius: 16, background: "#111" }
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }
const labelStyle: React.CSSProperties = { color: "#d4d4d8", fontWeight: 700, fontSize: 13 }
const input: React.CSSProperties = { minWidth: 0, width: "100%", boxSizing: "border-box", padding: 11, border: "1px solid #52525b", borderRadius: 8, background: "#09090b", color: "white" }
const textarea: React.CSSProperties = { ...input, minHeight: 110, resize: "vertical" }
const checks: React.CSSProperties = { display: "flex", gap: 22, flexWrap: "wrap", marginTop: 6 }
const sectionHeading: React.CSSProperties = { marginTop: 28 }
const liveCheck: React.CSSProperties = { display: "block", margin: "8px 0 18px" }
const saveButton: React.CSSProperties = { padding: "12px 20px", border: 0, borderRadius: 9, background: "#16a34a", color: "white", fontWeight: 800, cursor: "pointer" }
const addRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, margin: "16px 0" }
const smallButton: React.CSSProperties = { ...saveButton, padding: "10px 14px" }
const entryList: React.CSSProperties = { display: "grid", gap: 9 }
const entryCard: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: 13, border: "1px solid #3f3f46", borderRadius: 10, background: "#09090b" }
const uuid: React.CSSProperties = { display: "block", marginTop: 5, color: "#a1a1aa", fontSize: 11, overflowWrap: "anywhere" }
const registered: React.CSSProperties = { display: "block", marginTop: 5, color: "#71717a", fontSize: 11 }
const statusSelect: React.CSSProperties = { alignSelf: "start", padding: 7, borderRadius: 7, background: "#18181b", color: "white", border: "1px solid #52525b" }
