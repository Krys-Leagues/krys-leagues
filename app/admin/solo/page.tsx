"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Season = { id: string; season_number: number; is_active: boolean }
type Roster = { season_id: string; status: string }

export default function SoloAdminPage() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [managed, setManaged] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    async function load() {
      const requested = new URLSearchParams(window.location.search).get("seasonId") || ""
      const { data, error } = await supabase.from("seasons").select("id, season_number, is_active").eq("league_type", "solo").is("division", null).order("season_number", { ascending: false })
      if (error) return setMessage(error.message)
      const found = (data || []) as Season[]
      const { data: rosters, error: rosterError } = found.length ? await supabase.from("solo_roster_versions").select("season_id, status").in("season_id", found.map((s) => s.id)).in("status", ["draft", "approved", "locked"]) : { data: [], error: null }
      if (rosterError) return setMessage(rosterError.message)
      const ids = new Set(((rosters || []) as Roster[]).map((r) => r.season_id))
      setSeasons(found); setManaged(ids)
      if (requested) {
        if (!found.some((s) => s.id === requested)) setMessage("The requested Solo season was not found. No fallback season was loaded.")
        else setSelectedId(requested)
      } else setSelectedId(found.find((s) => ids.has(s.id))?.id || "")
    }
    void load()
  }, [])

  const selected = seasons.find((season) => season.id === selectedId)
  const ready = Boolean(selected && managed.has(selected.id))
  const href = (route: string) => `${route}?seasonId=${encodeURIComponent(selectedId)}`
  return <main style={page}><div style={container}><h1 style={title}>Solo Admin Hub</h1><p style={subtitle}>Managed Solo seasons, flexible division rosters, and four-week setup.</p>
    <section style={panel}><label style={label}>Managed season<select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setMessage(""); window.history.replaceState(null, "", e.target.value ? href("/admin/solo") : "/admin/solo") }} style={input}><option value="">Choose a Solo season</option>{seasons.map((s) => <option key={s.id} value={s.id}>Season {s.season_number}{s.is_active ? " · Active" : ""}{managed.has(s.id) ? " · Managed" : " · Setup missing"}</option>)}</select></label>{message && <p style={notice}>{message}</p>}</section>
    <div style={grid}><Link href={selectedId ? href("/admin/solo/season") : "/admin/solo/season"} style={card}><strong>Season</strong><span>Create a season or review the exact selected season.</span></Link>{ready ? <><Link href={href("/admin/solo/setup")} style={card}><strong>Setup / Roster</strong><span>Assign canonical players to Solo divisions.</span></Link><Link href={href("/admin/solo/weeks")} style={card}><strong>Weeks</strong><span>Set courses, review missing scores, and close or reopen weeks.</span></Link><Link href={href("/admin/solo/results")} style={card}><strong>Results</strong><span>Enter scorecard attempts and view automatic weekly boards.</span></Link><Link href={href("/admin/solo/standings")} style={card}><strong>Standings</strong><span>View official totals from closed weeks.</span></Link></> : <><Disabled title="Setup / Roster" text="Select a managed Solo season first."/><Disabled title="Weeks" text="Select a managed Solo season first."/><Disabled title="Results" text="Select a managed Solo season first."/><Disabled title="Standings" text="Select a managed Solo season first."/></>}{["Final Scorecard · Coming later", "Transition · Coming later"].map((x) => <Disabled key={x} title={x} text="This workflow is reserved for a later Solo batch."/>)}</div>
  </div></main>
}
function Disabled({ title, text }: { title: string; text: string }) { return <div style={{ ...card, opacity: .55 }}><strong>{title}</strong><span>{text}</span></div> }
const page: React.CSSProperties={minHeight:"100vh",padding:24,background:"black",color:"white"};const container:React.CSSProperties={maxWidth:1100,margin:"0 auto"};const title:React.CSSProperties={fontSize:34,marginBottom:8};const subtitle:React.CSSProperties={color:"#bbb",marginBottom:24};const panel:React.CSSProperties={padding:18,border:"1px solid #333",borderRadius:14,background:"#0d0d0d",marginBottom:20};const label:React.CSSProperties={display:"flex",flexDirection:"column",gap:8,fontWeight:800};const input:React.CSSProperties={padding:11,background:"#111",color:"white",border:"1px solid #444",borderRadius:8};const notice:React.CSSProperties={color:"#fca5a5"};const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:14};const card:React.CSSProperties={display:"flex",flexDirection:"column",gap:8,padding:18,borderRadius:14,border:"1px solid #333",background:"#111",color:"white",textDecoration:"none"}
