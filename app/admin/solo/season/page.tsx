"use client"
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function SoloSeasonPage() {
  const router = useRouter()
  const [number, setNumber] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [requested, setRequested] = useState("")

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("seasonId") || ""
    setRequested(id)
    if (id) {
      void supabase.from("seasons").select("season_number,league_type").eq("id", id).maybeSingle().then(({ data, error }) => {
        setMessage(error?.message || (!data || data.league_type !== "solo" ? "The requested Solo season was not found. No fallback season was loaded." : `Viewing managed Solo Season ${data.season_number}.`))
      })
    }
  }, [])

  async function create() {
    const n = Number(number)
    if (!Number.isInteger(n) || n < 1 || !start || !end || end < start) return setMessage("Enter a valid season number and date range.")
    setBusy(true)
    const { data, error } = await supabase.rpc("create_solo_season_with_roster", { p_season_number: n, p_start_date: start, p_end_date: end }).single()
    setBusy(false)
    if (error || !data) return setMessage(error?.message || "No season was returned.")
    router.push(`/admin/solo/setup?seasonId=${encodeURIComponent((data as { season_id: string }).season_id)}`)
  }

  return <main style={page}><div style={box}>
    <button onClick={() => router.push(requested ? `/admin/solo?seasonId=${encodeURIComponent(requested)}` : "/admin/solo")} style={button}>← Solo Hub</button>
    <h1>Solo Season</h1><p style={muted}>Create one managed season, its draft roster, and exactly four weeks transactionally.</p>
    <label style={field}>Season number<input type="number" value={number} onChange={(e) => setNumber(e.target.value)} style={input}/></label>
    <label style={field}>Start date<input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={input}/></label>
    <label style={field}>End date<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={input}/></label>
    <button disabled={busy} onClick={create} style={primary}>{busy ? "Creating…" : "Create managed Solo season"}</button>
    {message && <p style={notice}>{message}</p>}
  </div></main>
}

const page:React.CSSProperties={minHeight:"100vh",padding:24,background:"black",color:"white"};const box:React.CSSProperties={maxWidth:760,margin:"0 auto"};const muted:React.CSSProperties={color:"#bbb"};const field:React.CSSProperties={display:"flex",flexDirection:"column",gap:7,margin:"16px 0",fontWeight:700};const input:React.CSSProperties={padding:11,borderRadius:8,border:"1px solid #444",background:"#111",color:"white"};const button:React.CSSProperties={padding:"9px 13px",border:"1px solid #555",borderRadius:8,background:"#171717",color:"white"};const primary:React.CSSProperties={...button,background:"#126b3c",borderColor:"#167a45",fontWeight:800};const notice:React.CSSProperties={padding:12,border:"1px solid #444",borderRadius:8,background:"#171717"}
