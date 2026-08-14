"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { formatMajorDate, type MajorEvent } from "@/lib/majors"

export default function MajorsPage() {
  const [events, setEvents] = useState<MajorEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadEvents() {
      const response = await supabase
        .from("major_events")
        .select("*")
        .or("is_test_event.eq.false,test_event_listed.eq.true")
        .order("starts_at", { ascending: true, nullsFirst: false })
      setEvents((response.data as MajorEvent[] | null) || [])
      setError(response.error?.message || "")
      setLoading(false)
    }
    void loadEvents()
  }, [])

  return (
    <main style={page}>
      <div style={container}>
        <Link href="/" style={backLink}>← Krys Leagues</Link>
        <header style={hero}>
          <p style={eyebrow}>Krys Leagues</p>
          <h1 style={title}>The Four Majors</h1>
          <p style={subtitle}>Event details, registration, participants, status, and official stream links.</p>
        </header>

        {loading && <p>Loading Majors…</p>}
        {error && <p style={errorText}>Majors could not be loaded: {error}</p>}
        {!loading && !error && events.length === 0 && (
          <section style={card}>Major details are being prepared. Please check back soon.</section>
        )}
        <div style={grid}>
          {events.map((event) => (
            <Link key={event.id} href={`/majors/${event.slug}`} style={cardLink}>
              <div style={cardHeader}>
                <span style={statusBadge}>{event.status}</span>
                {event.signup_open && <span style={signupBadge}>Signup open</span>}
              </div>
              <h2 style={cardTitle}>{event.name}</h2>
              {event.is_test_event && <p style={testText}>TEST DATA — NOT OFFICIAL</p>}
              <p style={muted}>{event.year || "Year to be announced"}</p>
              <p style={muted}>{formatMajorDate(event.starts_at)}</p>
              {event.stream_is_live && <p style={liveText}>● Live now</p>}
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: "28px 18px 64px", background: "radial-gradient(circle at top, #172554, #020617 50%, #000)", color: "white" }
const container: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" }
const backLink: React.CSSProperties = { color: "#cbd5e1", textDecoration: "none", fontWeight: 700 }
const hero: React.CSSProperties = { margin: "24px 0", padding: "36px", border: "1px solid #334155", borderRadius: 24, background: "rgba(2,6,23,.88)" }
const eyebrow: React.CSSProperties = { color: "#60a5fa", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".12em" }
const title: React.CSSProperties = { margin: 0, fontSize: "clamp(38px, 8vw, 68px)" }
const subtitle: React.CSSProperties = { color: "#cbd5e1", fontSize: 18, lineHeight: 1.6, maxWidth: 720 }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }
const card: React.CSSProperties = { padding: 22, border: "1px solid #334155", borderRadius: 18, background: "#0f172a" }
const cardLink: React.CSSProperties = { ...card, color: "white", textDecoration: "none" }
const cardHeader: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" }
const statusBadge: React.CSSProperties = { padding: "5px 9px", borderRadius: 999, background: "#1e293b", textTransform: "capitalize", fontSize: 12, fontWeight: 800 }
const signupBadge: React.CSSProperties = { ...statusBadge, background: "#166534" }
const cardTitle: React.CSSProperties = { marginBottom: 4, fontSize: 26 }
const muted: React.CSSProperties = { color: "#cbd5e1" }
const liveText: React.CSSProperties = { color: "#f87171", fontWeight: 800 }
const errorText: React.CSSProperties = { color: "#fca5a5" }
const testText: React.CSSProperties = { color: "#fbbf24", fontWeight: 900, letterSpacing: ".08em" }
