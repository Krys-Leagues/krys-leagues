"use client"
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const today = () => new Date().toLocaleDateString("en-CA")

export default function SoloSeasonPage() {
  const router = useRouter()
  const [number, setNumber] = useState("")
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [requested, setRequested] = useState("")

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("seasonId") || ""
    setRequested(id)
    if (!id) return
    void supabase.from("seasons").select("season_number,league_type,start_date,end_date").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (error || !data || data.league_type !== "solo") {
        setMessage(error?.message || "The requested Solo season was not found. No fallback season was loaded.")
        return
      }
      setNumber(String(data.season_number))
      setStart(data.start_date || "")
      setEnd(data.end_date || "")
      setMessage(`Editing managed Solo Season ${data.season_number}. Historical dates may be left blank.`)
    })
  }, [])

  async function save() {
    const seasonNumber = Number(number)
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) return setMessage("Enter a valid season number.")
    if (start && end && end < start) return setMessage("End date cannot be before start date.")
    setBusy(true)
    if (requested) {
      const { error } = await supabase.rpc("update_solo_season_dates", { p_season_id: requested, p_start_date: start || null, p_end_date: end || null })
      setBusy(false)
      setMessage(error?.message || "Solo season dates saved. Blank historical dates are stored as unknown.")
      return
    }
    const { data, error } = await supabase.rpc("create_solo_season_with_roster", { p_season_number: seasonNumber, p_start_date: start || null, p_end_date: end || null }).single()
    setBusy(false)
    if (error || !data) return setMessage(error?.message || "Solo season could not be created.")
    router.push(`/admin/solo/setup?seasonId=${encodeURIComponent((data as { season_id: string }).season_id)}`)
  }

  return <main style={page}><div style={box}>
    <button onClick={() => router.push(requested ? `/admin/solo?seasonId=${encodeURIComponent(requested)}` : "/admin/solo")} style={button}>← Solo Hub</button>
    <h1>Solo Season</h1><p style={muted}>{requested ? "Edit exact known dates, or clear unknown historical dates." : "New season dates start at today for convenience and may be changed or cleared before saving."}</p>
    <label style={field}>Season number<input type="number" value={number} disabled={Boolean(requested)} onChange={(event) => setNumber(event.target.value)} style={input} /></label>
    <label style={field}>Start date <span style={hint}>optional for historical seasons</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} style={input} /></label>
    <label style={field}>End date <span style={hint}>optional for historical seasons</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} style={input} /></label>
    <button disabled={busy} onClick={save} style={primary}>{busy ? "Saving…" : requested ? "Save Solo season dates" : "Create managed Solo season"}</button>
    {message && <p style={notice}>{message}</p>}
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const box: React.CSSProperties = { maxWidth: 760, margin: "0 auto" }
const muted: React.CSSProperties = { color: "#bbb" }
const hint: React.CSSProperties = { color: "#aaa", fontWeight: 400, fontSize: 13 }
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7, margin: "16px 0", fontWeight: 700 }
const input: React.CSSProperties = { padding: 11, borderRadius: 8, border: "1px solid #444", background: "#111", color: "white" }
const button: React.CSSProperties = { padding: "9px 13px", border: "1px solid #555", borderRadius: 8, background: "#171717", color: "white" }
const primary: React.CSSProperties = { ...button, background: "#126b3c", borderColor: "#167a45", fontWeight: 800 }
const notice: React.CSSProperties = { padding: 12, border: "1px solid #444", borderRadius: 8, background: "#171717" }
