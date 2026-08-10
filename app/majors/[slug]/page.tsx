"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { formatMajorDate, type MajorEntry, type MajorEvent } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

export default function MajorDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [event, setEvent] = useState<MajorEvent | null>(null)
  const [entries, setEntries] = useState<MajorEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [signingUp, setSigningUp] = useState(false)

  const loadEvent = useCallback(async () => {
    const eventResponse = await supabase.from("major_events").select("*").eq("slug", slug).maybeSingle()
    const loadedEvent = eventResponse.data as MajorEvent | null
    setEvent(loadedEvent)
    if (loadedEvent) {
      const entryResponse = await supabase.from("major_entries").select("*").eq("major_event_id", loadedEvent.id).order("registered_at")
      setEntries((entryResponse.data as MajorEntry[] | null) || [])
      setMessage(eventResponse.error?.message || entryResponse.error?.message || "")
    } else {
      setMessage(eventResponse.error?.message || "This Major is not available.")
    }
    setLoading(false)
  }, [slug])

  useEffect(() => {
    // Initial client-side Supabase synchronization for the route parameter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvent()
  }, [loadEvent])

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/majors/${slug}`)}&type=player` },
    })
  }

  async function signup() {
    if (!event) return
    setSigningUp(true)
    setMessage("")
    const userResponse = await supabase.auth.getUser()
    if (!userResponse.data.user) {
      setSigningUp(false)
      await signIn()
      return
    }
    const response = await supabase.rpc("signup_for_major", { p_major_event_id: event.id })
    setSigningUp(false)
    if (response.error) {
      setMessage(response.error.message)
      return
    }
    setMessage("You are registered.")
    await loadEvent()
  }

  if (loading) return <main style={page}>Loading Major…</main>
  if (!event) return <main style={page}><Link href="/majors" style={backLink}>← Four Majors</Link><p>{message}</p></main>

  return (
    <main style={page}>
      <div style={container}>
        <Link href="/majors" style={backLink}>← Four Majors</Link>
        <header style={hero}>
          <div style={statusRow}><span style={badge}>{event.status}</span>{event.signup_open && <span style={openBadge}>Signup open</span>}</div>
          <h1 style={title}>{event.name}</h1>
          <p style={meta}>{event.year || "Year to be announced"} · {formatMajorDate(event.starts_at)}</p>
          {event.ends_at && <p style={meta}>Ends {formatMajorDate(event.ends_at)}</p>}
          {event.description && <p style={description}>{event.description}</p>}
          {event.signup_open && <button onClick={signup} disabled={signingUp} style={primaryButton}>{signingUp ? "Registering…" : "Register with linked Discord account"}</button>}
          {message && <p style={notice}>{message}</p>}
        </header>

        {(event.stream_url || event.stream_scheduled_at) && (
          <section style={card}>
            <h2>Official stream</h2>
            {event.stream_is_live && <p style={liveText}>● Live now</p>}
            <p style={meta}>{event.stream_label || event.stream_platform || "Major broadcast"}</p>
            {event.stream_scheduled_at && <p style={meta}>Scheduled {formatMajorDate(event.stream_scheduled_at)}</p>}
            {event.stream_url && <a href={event.stream_url} target="_blank" rel="noreferrer" style={streamLink}>Watch official stream ↗</a>}
          </section>
        )}

        <section style={card}>
          <h2>Participants ({entries.length})</h2>
          {entries.length === 0 ? <p style={meta}>No public participants yet.</p> : (
            <div style={entrantGrid}>{entries.map((entry) => <div key={entry.id} style={entrant}><strong>{entry.player_screen_name_snapshot}</strong><span style={entryStatus}>{entry.status}</span></div>)}</div>
          )}
        </section>
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: "28px 18px 64px", background: "radial-gradient(circle at top, #172554, #020617 50%, #000)", color: "white" }
const container: React.CSSProperties = { maxWidth: 900, margin: "0 auto" }
const backLink: React.CSSProperties = { color: "#cbd5e1", textDecoration: "none", fontWeight: 700 }
const hero: React.CSSProperties = { margin: "24px 0 18px", padding: 32, border: "1px solid #334155", borderRadius: 22, background: "rgba(2,6,23,.9)" }
const statusRow: React.CSSProperties = { display: "flex", gap: 8 }
const badge: React.CSSProperties = { padding: "5px 9px", borderRadius: 999, background: "#1e293b", textTransform: "capitalize", fontSize: 12, fontWeight: 800 }
const openBadge: React.CSSProperties = { ...badge, background: "#166534" }
const title: React.CSSProperties = { fontSize: "clamp(38px,8vw,64px)", margin: "18px 0 8px" }
const meta: React.CSSProperties = { color: "#cbd5e1", lineHeight: 1.5 }
const description: React.CSSProperties = { fontSize: 18, lineHeight: 1.65, maxWidth: 700 }
const primaryButton: React.CSSProperties = { marginTop: 16, padding: "13px 18px", border: 0, borderRadius: 10, background: "#16a34a", color: "white", fontWeight: 800, cursor: "pointer" }
const notice: React.CSSProperties = { color: "#fde68a", fontWeight: 700 }
const card: React.CSSProperties = { marginTop: 18, padding: 24, border: "1px solid #334155", borderRadius: 18, background: "#0f172a" }
const liveText: React.CSSProperties = { color: "#f87171", fontWeight: 800 }
const streamLink: React.CSSProperties = { display: "inline-block", padding: "11px 15px", borderRadius: 9, background: "#dc2626", color: "white", textDecoration: "none", fontWeight: 800 }
const entrantGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }
const entrant: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: 13, background: "#020617", borderRadius: 10, border: "1px solid #334155" }
const entryStatus: React.CSSProperties = { color: "#94a3b8", textTransform: "capitalize", fontSize: 13 }
