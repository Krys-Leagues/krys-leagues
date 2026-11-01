"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const DRAFT_KEY = "pyp-season-create-draft"
type Draft = { seasonNumber: string; divisionCount: string; startDate: string; endDate: string }

export default function PypSeasonPage() {
  const router = useRouter()
  const [seasonNumber, setSeasonNumber] = useState("")
  const [divisionCount, setDivisionCount] = useState("5")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const draftReady = useRef(false)

  // Restore the browser-only draft once when this client page mounts.
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(DRAFT_KEY)
      if (saved) {
        const draft = JSON.parse(saved) as Partial<Draft>
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSeasonNumber(typeof draft.seasonNumber === "string" ? draft.seasonNumber : "")
        setDivisionCount(typeof draft.divisionCount === "string" ? draft.divisionCount : "5")
        setStartDate(typeof draft.startDate === "string" ? draft.startDate : "")
        setEndDate(typeof draft.endDate === "string" ? draft.endDate : "")
      }
    } catch {
      window.sessionStorage.removeItem(DRAFT_KEY)
    }
    draftReady.current = true
  }, [])

  useEffect(() => {
    if (!draftReady.current) return
    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ seasonNumber, divisionCount, startDate, endDate } satisfies Draft)
    )
  }, [divisionCount, endDate, seasonNumber, startDate])

  async function createSeason() {
    setMessage("")
    const number = Number(seasonNumber)
    const divisions = Number(divisionCount)
    if (!Number.isInteger(number) || number <= 0) return setMessage("Enter a valid season number.")
    if (!Number.isInteger(divisions) || divisions < 1 || divisions > 20) return setMessage("Number of divisions must be between 1 and 20.")
    if (!startDate) return setMessage("Choose a start date.")
    if (!endDate) return setMessage("Choose an end date.")
    if (endDate < startDate) return setMessage("End date cannot be before the start date.")

    setSaving(true)
    const { data, error } = await supabase.rpc("create_pyp_season_with_roster", {
      p_season_number: number,
      p_division_count: divisions,
      p_start_date: startDate,
      p_due_date: endDate,
      p_end_date: endDate,
    }).single()
    setSaving(false)

    if (error || !data) {
      setMessage(`PYP season was not created: ${error?.message || "No season data was returned."}`)
      return
    }

    const result = data as { season_id: string; first_division_number: number }
    window.sessionStorage.removeItem(DRAFT_KEY)
    router.push(`/admin/pyp/setup?seasonId=${encodeURIComponent(result.season_id)}&division=${result.first_division_number}`)
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button type="button" onClick={() => router.push("/admin/pyp")} style={secondaryButton}>← PYP Hub</button>
          <button type="button" onClick={() => router.push("/admin")} style={secondaryButton}>← Admin</button>
        </div>
        <h1 style={title}>PYP Season</h1>
        <p style={subtitle}>Create and manage PYP seasons inside the PYP hub.</p>

        <section style={panel}>
          <h2 style={sectionTitle}>Create PYP Season</h2>
          <p style={helper}>PYP players choose their matchup courses, so no fixed season courses are required.</p>
          <div style={formGrid}>
            <Field label="Season Number"><input type="number" min="1" step="1" value={seasonNumber} onChange={(event) => setSeasonNumber(event.target.value)} style={input} disabled={saving} /></Field>
            <Field label="Number of Divisions"><input type="number" min="1" max="20" step="1" value={divisionCount} onChange={(event) => setDivisionCount(event.target.value)} style={input} disabled={saving} /></Field>
            <Field label="Start Date"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={input} disabled={saving} /></Field>
            <Field label="End Date"><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={input} disabled={saving} /></Field>
          </div>
          <button type="button" onClick={createSeason} disabled={saving} style={primaryButton}>{saving ? "Creating..." : "Create PYP Season"}</button>
          {message && <p style={messageStyle}>{message}</p>}
        </section>

        <section style={panel}>
          <h2 style={sectionTitle}>Edit Current PYP Season</h2>
          <p style={helper}>Open the current managed season to resize divisions or continue roster setup.</p>
          <button type="button" onClick={() => router.push("/admin/pyp/season/edit")} style={secondaryButton}>Edit Current PYP Season</button>
        </section>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={field}><span style={labelStyle}>{label}</span>{children}</label>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const container: React.CSSProperties = { maxWidth: 980, margin: "0 auto" }
const topBar: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }
const title: React.CSSProperties = { fontSize: 34, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#bbb", marginBottom: 28 }
const panel: React.CSSProperties = { marginBottom: 22, padding: 24, borderRadius: 14, border: "1px solid #333", background: "#0d0d0d" }
const sectionTitle: React.CSSProperties = { marginTop: 0, marginBottom: 8 }
const helper: React.CSSProperties = { color: "#aaa", lineHeight: 1.5 }
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, margin: "22px 0" }
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 }
const labelStyle: React.CSSProperties = { color: "#ddd", fontWeight: 700 }
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", padding: 12, borderRadius: 8, border: "1px solid #444", background: "#111", color: "white" }
const primaryButton: React.CSSProperties = { padding: "12px 18px", borderRadius: 8, border: "1px solid #167a45", background: "#126b3c", color: "white", fontWeight: 800, cursor: "pointer" }
const secondaryButton: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #555", background: "#171717", color: "white", cursor: "pointer" }
const messageStyle: React.CSSProperties = { marginTop: 16, padding: 12, borderRadius: 8, background: "#171717", border: "1px solid #444" }
