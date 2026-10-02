"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { majorAdminRouteContext, majorAdminToolHref, majorAdminWorkspaceHref, selectMajorAdminEvent } from "@/lib/majorAdminSelection"
import { MAJOR_ENTRY_STATUSES, MAJOR_EVENT_STATUSES, formatMajorDate, toDateTimeLocal, type MajorEntry, type MajorEvent } from "@/lib/majors"
import { isActiveMajorEntryStatus, majorEntrantAddState } from "@/lib/majorEntryParticipation"
import {
  globalPlayerIdentitySummary,
  globalPlayerMatchesSearch,
  loadProtectedAdminGlobalPlayers,
  type ProtectedAdminGlobalPlayer,
} from "@/lib/identity/adminGlobalPlayerClient"
import { supabase } from "@/lib/supabase"

type EventDraft = Omit<MajorEvent, "created_at" | "updated_at">

export default function MajorsAdminPage() {
  const [events, setEvents] = useState<MajorEvent[]>([])
  const [entries, setEntries] = useState<MajorEntry[]>([])
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [globalPlayers, setGlobalPlayers] = useState<ProtectedAdminGlobalPlayer[]>([])
  const [playerSearch, setPlayerSearch] = useState("")
  const [selectedPlayerId, setSelectedPlayerId] = useState("")
  const [administrativeAddNote, setAdministrativeAddNote] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showChooser, setShowChooser] = useState(false)

  const loadEntries = useCallback(async (eventId: string) => {
    const response = await supabase.from("major_entries").select("*").eq("major_event_id", eventId).order("registered_at")
    setEntries((response.data as MajorEntry[] | null) || [])
    if (response.error) setMessage(response.error.message)
  }, [])

  const loadEvents = useCallback(async (preferredId?: string) => {
    const [response, playerDirectoryResult] = await Promise.all([
      supabase.from("major_events").select("*").order("slug"),
      loadProtectedAdminGlobalPlayers()
        .then((data) => ({ data, error: null }))
        .catch((error: Error) => ({ data: [], error })),
    ])
    const loaded = (response.data as MajorEvent[] | null) || []
    const routeContext = majorAdminRouteContext(window.location.search)
    const requestedId = preferredId || routeContext.eventId
    const nextEvent = routeContext.showAll ? null : selectMajorAdminEvent(loaded, requestedId)
    const nextId = nextEvent?.id || ""
    setEvents(loaded)
    setGlobalPlayers(playerDirectoryResult.data)
    setDraft(nextEvent ? { ...nextEvent } : null)
    setShowChooser(routeContext.showAll)
    setMessage(response.error?.message || playerDirectoryResult.error?.message || "")
    setLoading(false)
    if (nextId) await loadEntries(nextId)
  }, [loadEntries])

  useEffect(() => {
    // Initial client-side Supabase synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents()
  }, [loadEvents])

  const selectedPlayer = useMemo(
    () => globalPlayers.find((player) => player.id === selectedPlayerId) || null,
    [globalPlayers, selectedPlayerId],
  )
  const selectedPlayerAddState = selectedPlayer ? majorEntrantAddState(entries, selectedPlayer.id) : null
  const playerSearchResults = useMemo(
    () => playerSearch.trim()
      ? globalPlayers.filter((player) => globalPlayerMatchesSearch(player, playerSearch)).slice(0, 20)
      : [],
    [globalPlayers, playerSearch],
  )
  const isMastersWorkspace = draft?.slug === "masters" || draft?.name.toLowerCase().includes("masters")

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
    if (!draft || !selectedPlayer) return
    if (selectedPlayerAddState === "reactivate_required") {
      return setMessage(`${selectedPlayer.screenName} already has a WITHDRAWN entry. Use REACTIVATE PLAYER; do not add a duplicate.`)
    }
    if (selectedPlayerAddState !== "available") {
      return setMessage(`${selectedPlayer.screenName} already has an entry in this Major.`)
    }
    const confirmed = window.confirm(
      `ADD ${selectedPlayer.screenName} TO ${draft.name.toUpperCase()} AS AN ADMIN EXCEPTION?\n\nPublic signup will remain ${draft.signup_open ? "OPEN" : "CLOSED"}. No selected times or rooms will be created. Schedule every required round deliberately afterward.`,
    )
    if (!confirmed) return
    setSaving(true)
    setMessage("")
    const response = await supabase.rpc("admin_add_major_entrant_exception", {
      p_major_event_id: draft.id,
      p_player_id: selectedPlayer.id,
      p_note: administrativeAddNote,
    })
    setSaving(false)
    if (response.error) return setMessage(response.error.message)
    setSelectedPlayerId("")
    setPlayerSearch("")
    setAdministrativeAddNote("")
    setMessage(`${selectedPlayer.screenName} was added as an ACTIVE Masters admin exception. Public signup was not changed. Assign their required round times and rooms deliberately.`)
    await loadEntries(draft.id)
  }

  async function updateEntryStatus(entryId: string, status: MajorEntry["status"]) {
    const response = await supabase.rpc("set_major_entry_status", { p_entry_id: entryId, p_status: status })
    if (response.error) return setMessage(response.error.message)
    if (draft) await loadEntries(draft.id)
  }

  async function updateParticipation(entry: MajorEntry, action: "withdraw" | "reactivate") {
    const withdrawing = action === "withdraw"
    const confirmed = window.confirm(withdrawing
      ? `WITHDRAW ${entry.player_screen_name_snapshot} FROM THE MASTERS?\n\nThey will no longer participate in future Masters rounds. Future room and scoring eligibility will stop. Their registration, selected-time choices, completed/submitted/verified scores, and audit history will remain.`
      : `REACTIVATE ${entry.player_screen_name_snapshot} FOR THE MASTERS?\n\nThey will return to active future scheduling eligibility, but will not be automatically placed back into a room.`)
    if (!confirmed) return

    const note = window.prompt(withdrawing ? "Optional withdrawal reason or note" : "Optional reactivation note")
    if (note === null) return

    setSaving(true)
    setMessage("")
    const response = await supabase.rpc("admin_set_major_entry_participation", {
      p_entry_id: entry.id,
      p_action: action,
      p_reason: note,
    })
    setSaving(false)
    if (response.error) return setMessage(response.error.message)
    setMessage(withdrawing
      ? `${entry.player_screen_name_snapshot} is withdrawn. Historical registration, selections, rooms with play history, and scores were preserved.`
      : `${entry.player_screen_name_snapshot} is active again. Place them into any future room deliberately.`)
    if (draft) await loadEntries(draft.id)
  }

  return (
    <main style={page}>
      <div style={topRow}>
        <div><Link href="/admin" style={backLink}>← Admin</Link><h1 style={title}>{draft ? `${draft.name} Admin Workspace` : "Four Majors"}</h1><p style={muted}>{draft ? `Manage ${draft.name} without reselecting the event between tools.` : "Choose a Major to enter its dedicated admin workspace."}</p></div>
        <div style={headerLinks}>{draft && <Link href="/admin/majors?view=all" style={allMajorsLink}>← ALL MAJORS</Link>}<Link href="/majors" style={publicLink}>View public Majors</Link></div>
      </div>
      {message && <p style={notice}>{message}</p>}
      {loading ? <p>Loading…</p> : (
        <>
          {showChooser && <nav style={eventTabs} aria-label="Choose a Major">{events.map((event) => <Link key={event.id} href={majorAdminWorkspaceHref(event.id)} style={tab}><strong>{event.name}</strong><span style={tabMeta}>{event.status}{event.is_public ? " · public" : " · private"}</span></Link>)}</nav>}
          {draft && (
            <>
              <nav style={workspaceTools} aria-label={`${draft.name} admin tools`}>
                <a href="#event-configuration" style={workspaceTool}><strong>Overview / Event Configuration</strong><span>Event status, dates, public visibility, and stream details</span></a>
                <a href="#entrants" style={workspaceTool}><strong>Entrants</strong><span>Add, withdraw, reactivate, and review players for this Major</span></a>
                <Link href={majorAdminToolHref("/admin/majors/scheduling", draft.id)} style={workspaceTool}><strong>Signup, Time Slots, Rooms & Scheduling</strong><span>Manage the full schedule workspace for this Major</span></Link>
                <Link href={majorAdminToolHref("/admin/majors/scoring", draft.id)} style={workspaceTool}><strong>Live Scoring</strong><span>Open persistent live scoring sessions</span></Link>
                <Link href={majorAdminToolHref("/admin/majors/verification", draft.id)} style={workspaceTool}><strong>Score Verification</strong><span>Review submitted player scorecards</span></Link>
                {isMastersWorkspace && <Link href={majorAdminToolHref("/admin/majors/waitlist", draft.id)} style={workspaceTool}><strong>Wait List</strong><span>Manage the existing Masters wait list</span></Link>}
                {isMastersWorkspace && <Link href={majorAdminToolHref("/admin/majors/stream-scorecard", draft.id)} style={workspaceTool}><strong>Stream Control</strong><span>Open the existing Masters stream controller</span></Link>}
                {isMastersWorkspace && <Link href={majorAdminToolHref("/admin/majors/simple-stream-scorecard", draft.id)} style={workspaceTool}><strong>Simple Stream Card</strong><span>Open the existing total-score stream controller</span></Link>}
                {isMastersWorkspace && <Link href={majorAdminToolHref("/admin/majors/manual-stream-scorecard", draft.id)} style={workspaceTool}><strong>Manual Stream Card</strong><span>Open the existing manual broadcast fallback</span></Link>}
                <Link href={`/majors/${draft.slug}/results`} style={workspaceTool}><strong>Results / Live Score Tracker</strong><span>Open the public results page for this Major</span></Link>
              </nav>
              <div style={columns}>
              <section id="event-configuration" style={panel}>
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

              <section id="entrants" style={panel}>
                <h2>Entries ({entries.length} registered history · {entries.filter((entry) => isActiveMajorEntryStatus(entry.status)).length} active)</h2>
                <p style={muted}>All entries use the canonical <code>public.players.id</code>. Screen names below are signup snapshots.</p>
                <div style={addPanel}>
                  <h3 style={addHeading}>ADD PLAYER — ADMIN EXCEPTION</h3>
                  <p style={addHelp}>Search and select the exact canonical Global Player. This does not reopen public signup, create selected times, or change existing rooms.</p>
                  <input value={playerSearch} onChange={(event) => { setPlayerSearch(event.target.value); setSelectedPlayerId("") }} placeholder="Search Global Players by screen name or verified alias" style={input} />
                  {playerSearchResults.length > 0 && !selectedPlayer && <div style={searchResults}>{playerSearchResults.map((player) => (
                    <button key={player.id} type="button" onClick={() => { setSelectedPlayerId(player.id); setPlayerSearch(player.screenName) }} style={searchResultButton}>
                      <strong>{player.screenName}</strong>
                      <span>{globalPlayerIdentitySummary(player)} · {player.active ? "active" : player.status || "inactive"}</span>
                    </button>
                  ))}</div>}
                  {playerSearch.trim() && playerSearchResults.length === 0 && <p style={addHelp}>No canonical Global Player matches this search. Do not create or guess an identity here.</p>}
                  {selectedPlayer && <div style={selectedPlayerCard}>
                    <strong>{selectedPlayer.screenName}</strong>
                    <span>{globalPlayerIdentitySummary(selectedPlayer)}</span>
                    <code style={uuid}>{selectedPlayer.id}</code>
                    {selectedPlayerAddState === "already_active" && <b style={blockedText}>ALREADY ENTERED — duplicate add blocked.</b>}
                    {selectedPlayerAddState === "reactivate_required" && <b style={blockedText}>WITHDRAWN ENTRY EXISTS — use REACTIVATE PLAYER.</b>}
                    {selectedPlayerAddState === "existing_conflict" && <b style={blockedText}>AN ENTRY ALREADY EXISTS — review its status; no duplicate will be created.</b>}
                    {selectedPlayerAddState === "available" && <b style={readyText}>READY FOR ADMIN EXCEPTION — scheduling will still be required.</b>}
                  </div>}
                  <textarea value={administrativeAddNote} onChange={(event) => setAdministrativeAddNote(event.target.value)} placeholder="Optional administrative late-add note" style={addNote} />
                  <button type="button" onClick={() => void addPlayer()} disabled={saving || !selectedPlayer || selectedPlayerAddState !== "available"} style={smallButton}>ADD PLAYER</button>
                </div>
                <div style={entryList}>{entries.map((entry) => (
                  <article key={entry.id} style={entry.status === "withdrawn" ? withdrawnEntryCard : entryCard}>
                    <div><strong>{entry.player_screen_name_snapshot}</strong><code style={uuid}>{entry.player_id}</code><span style={registered}>Registered {formatMajorDate(entry.registered_at)}{entry.registration_source === "admin_exception" ? " · ADMIN EXCEPTION" : ""}</span>{entry.registration_source === "admin_exception" && <span style={adminAddDetails}>Added by {entry.administratively_added_by_screen_name_snapshot || "authorized admin"}{entry.administratively_added_at ? ` · ${formatMajorDate(entry.administratively_added_at)}` : ""}{entry.administrative_add_note ? ` · ${entry.administrative_add_note}` : ""}<br /><strong>Scheduling required until all round times and rooms are assigned.</strong></span>}{entry.status === "withdrawn" && <span style={withdrawalDetails}><strong>WITHDRAWN</strong> {entry.withdrawn_at ? formatMajorDate(entry.withdrawn_at) : ""}<br />By {entry.withdrawn_by_screen_name_snapshot || "authorized admin"}{entry.withdrawal_reason ? ` · ${entry.withdrawal_reason}` : ""}</span>}</div>
                    <div style={entryActions}>{entry.status === "withdrawn" ? <><strong style={withdrawnStatus}>WITHDRAWN</strong><button type="button" onClick={() => void updateParticipation(entry, "reactivate")} style={reactivateButton} disabled={saving}>Reactivate player</button></> : <><select value={entry.status} onChange={(event) => void updateEntryStatus(entry.id, event.target.value as MajorEntry["status"])} style={statusSelect}>{MAJOR_ENTRY_STATUSES.filter((status) => status !== "withdrawn").map((status) => <option key={status}>{status}</option>)}</select>{isActiveMajorEntryStatus(entry.status) && <button type="button" onClick={() => void updateParticipation(entry, "withdraw")} style={withdrawButton} disabled={saving}>Withdraw player</button>}</>}</div>
                  </article>
                ))}</div>
              </section>
              </div>
            </>
          )}
          {!showChooser && !draft && <p style={muted}>No Major events are available.</p>}
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
const allMajorsLink: React.CSSProperties = { ...publicLink, background: "#334155" }
const headerLinks: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" }
const notice: React.CSSProperties = { padding: 12, borderRadius: 10, background: "#292524", color: "#fde68a" }
const eventTabs: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(150px,100%),1fr))", gap: 10, margin: "24px 0" }
const tab: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, padding: 14, borderRadius: 12, border: "1px solid #3f3f46", background: "#18181b", color: "white", textAlign: "left", cursor: "pointer", textDecoration: "none" }
const tabMeta: React.CSSProperties = { color: "#a1a1aa", fontSize: 12, textTransform: "capitalize" }
const workspaceTools: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, margin: "24px 0" }
const workspaceTool: React.CSSProperties = { display: "grid", gap: 5, padding: 14, border: "1px solid #2563eb", borderRadius: 12, background: "#0f172a", color: "white", textDecoration: "none" }
const columns: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(360px,100%),1fr))", gap: 18, alignItems: "start" }
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
const addPanel: React.CSSProperties = { display: "grid", gap: 9, margin: "16px 0", padding: 14, border: "1px solid #2563eb", borderRadius: 10, background: "#071427" }
const addHeading: React.CSSProperties = { margin: 0, color: "#bfdbfe", fontSize: 15 }
const addHelp: React.CSSProperties = { margin: 0, color: "#bfdbfe", fontSize: 12, lineHeight: 1.5 }
const searchResults: React.CSSProperties = { display: "grid", gap: 6, maxHeight: 240, overflowY: "auto" }
const searchResultButton: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, padding: 10, border: "1px solid #475569", borderRadius: 8, background: "#0f172a", color: "white", textAlign: "left", cursor: "pointer" }
const selectedPlayerCard: React.CSSProperties = { display: "grid", gap: 4, padding: 10, border: "1px solid #3b82f6", borderRadius: 8, background: "#020617" }
const blockedText: React.CSSProperties = { color: "#fca5a5", fontSize: 12 }
const readyText: React.CSSProperties = { color: "#86efac", fontSize: 12 }
const addNote: React.CSSProperties = { ...input, minHeight: 70, resize: "vertical" }
const smallButton: React.CSSProperties = { ...saveButton, padding: "10px 14px" }
const entryList: React.CSSProperties = { display: "grid", gap: 9 }
const entryCard: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: 13, border: "1px solid #3f3f46", borderRadius: 10, background: "#09090b" }
const withdrawnEntryCard: React.CSSProperties = { ...entryCard, border: "2px solid #dc2626", background: "#250909" }
const uuid: React.CSSProperties = { display: "block", marginTop: 5, color: "#a1a1aa", fontSize: 11, overflowWrap: "anywhere" }
const registered: React.CSSProperties = { display: "block", marginTop: 5, color: "#71717a", fontSize: 11 }
const withdrawalDetails: React.CSSProperties = { display: "block", marginTop: 8, color: "#fecaca", fontSize: 12, lineHeight: 1.5 }
const adminAddDetails: React.CSSProperties = { display: "block", marginTop: 8, color: "#bfdbfe", fontSize: 12, lineHeight: 1.5 }
const entryActions: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 7, minWidth: 150 }
const statusSelect: React.CSSProperties = { alignSelf: "start", padding: 7, borderRadius: 7, background: "#18181b", color: "white", border: "1px solid #52525b" }
const withdrawnStatus: React.CSSProperties = { color: "#fca5a5", textAlign: "right", fontSize: 12 }
const withdrawButton: React.CSSProperties = { padding: "7px 9px", borderRadius: 7, border: "1px solid #ef4444", background: "#450a0a", color: "#fecaca", fontWeight: 800, cursor: "pointer" }
const reactivateButton: React.CSSProperties = { ...withdrawButton, borderColor: "#22c55e", background: "#052e16", color: "#bbf7d0" }
