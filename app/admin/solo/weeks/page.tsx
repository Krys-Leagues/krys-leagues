"use client"
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Week={id:string;week_number:number;course_name:string|null;status:"open"|"closed";due_date:string|null}
type Season={season_number:number;league_type:string|null}
type Missing={easy:number;hard:number;both:number}

export default function SoloWeeksPage(){
  const router=useRouter();const [seasonId,setSeasonId]=useState("");const [season,setSeason]=useState<Season|null>(null);const [weeks,setWeeks]=useState<Week[]>([]);const [missing,setMissing]=useState<Record<string,Missing>>({});const [message,setMessage]=useState("");const [loading,setLoading]=useState(true);const [busy,setBusy]=useState("")
  const load=useCallback(async()=>{
    const id=new URLSearchParams(window.location.search).get("seasonId")||"";setSeasonId(id)
    if(!id){setMessage("A seasonId is required. No fallback season was loaded.");setLoading(false);return}
    const [{data:s,error:se},{data:w,error:we},{data:r,error:re}]=await Promise.all([
      supabase.from("seasons").select("season_number,league_type").eq("id",id).maybeSingle(),
      supabase.from("solo_weeks").select("id,week_number,course_name,status,due_date").eq("season_id",id).order("week_number"),
      supabase.from("solo_roster_versions").select("id").eq("season_id",id).eq("status","approved").maybeSingle(),
    ])
    if(se||we||!s||s.league_type!=="solo"||(w||[]).length!==4){setMessage(se?.message||we?.message||"The exact managed Solo season and four weeks were not found.");setLoading(false);return}
    const summary:Record<string,Missing>={}
    if(r&&!re){
      const {data:e}=await supabase.from("solo_roster_entries").select("player_id").eq("roster_version_id",r.id)
      for(const week of (w||[]) as Week[]){
        const {data:a}=await supabase.from("solo_live_best_attempts").select("player_id,difficulty").eq("week_id",week.id)
        const players=(e||[]).map(x=>x.player_id),easy=new Set((a||[]).filter(x=>x.difficulty==="easy").map(x=>x.player_id)),hard=new Set((a||[]).filter(x=>x.difficulty==="hard").map(x=>x.player_id))
        summary[week.id]={easy:players.filter(p=>!easy.has(p)).length,hard:players.filter(p=>!hard.has(p)).length,both:players.filter(p=>!easy.has(p)&&!hard.has(p)).length}
      }
    }
    setMissing(summary);setSeason(s as Season);setWeeks((w||[]) as Week[]);setLoading(false)
  },[])
  useEffect(()=>{void load()},[load])
  function patchWeek(n:number,change:Partial<Week>){setWeeks(v=>v.map(w=>w.week_number===n?{...w,...change}:w))}
  async function save(w:Week){setBusy(w.id);const {error}=await supabase.rpc("update_solo_week",{p_season_id:seasonId,p_week_number:w.week_number,p_course_name:w.course_name||null,p_due_date:w.due_date||null});setBusy("");setMessage(error?.message||`Week ${w.week_number} saved.`);if(!error)await load()}
  async function close(w:Week){const m=missing[w.id];if(!window.confirm(`Close Week ${w.week_number} and freeze official scores? Missing Easy: ${m?.easy??0}; Missing Hard: ${m?.hard??0}; Missing both: ${m?.both??0}. This can only be corrected after an explicit reopen.`))return;setBusy(w.id);const {error}=await supabase.rpc("close_solo_week",{p_season_id:seasonId,p_week_id:w.id});setBusy("");setMessage(error?.message||`Week ${w.week_number} closed and frozen.`);if(!error)await load()}
  async function reopen(w:Week){if(!window.confirm(`Reopen Week ${w.week_number}? Its prior frozen revision will be preserved as superseded and corrections will become available.`))return;setBusy(w.id);const {error}=await supabase.rpc("reopen_solo_week",{p_season_id:seasonId,p_week_id:w.id});setBusy("");setMessage(error?.message||`Week ${w.week_number} reopened.`);if(!error)await load()}
  return <main style={page}><div style={container}><nav style={nav}><button style={button} onClick={()=>router.push(`/admin/solo?seasonId=${encodeURIComponent(seasonId)}`)}>← Solo Hub</button><button style={button} onClick={()=>router.push(`/admin/solo/results?seasonId=${encodeURIComponent(seasonId)}`)}>Results</button><button style={button} onClick={()=>router.push(`/admin/solo/standings?seasonId=${encodeURIComponent(seasonId)}`)}>Standings</button></nav><h1>Solo Weeks</h1><p style={muted}>{season?`Season ${season.season_number} · each week closes independently`:"Load exact Solo season."}</p>{loading?<p>Loading…</p>:<div style={grid}>{weeks.map(w=>{const m=missing[w.id];return <section key={w.id} style={card}><h2>Week {w.week_number} · {w.status.toUpperCase()}</h2><label style={field}>Map / course<input style={input} value={w.course_name||""} disabled={w.status!=="open"} onChange={e=>patchWeek(w.week_number,{course_name:e.target.value})}/></label><label style={field}>Due date<input type="date" style={input} value={w.due_date||""} disabled={w.status!=="open"} onChange={e=>patchWeek(w.week_number,{due_date:e.target.value})}/></label><p style={muted}>Missing Easy: {m?.easy??0} · Hard: {m?.hard??0} · Both: {m?.both??0}</p><div style={actions}><button style={button} onClick={()=>router.push(`/admin/solo/results?seasonId=${encodeURIComponent(seasonId)}&week=${w.week_number}`)}>Enter / View Results</button>{w.status==="open"?<><button disabled={busy!==""} style={button} onClick={()=>save(w)}>Save setup</button><button disabled={busy!==""} style={danger} onClick={()=>close(w)}>Close Week</button></>:<button disabled={busy!==""} style={danger} onClick={()=>reopen(w)}>Reopen Week</button>}</div></section>})}</div>}{message&&<p style={notice}>{message}</p>}</div></main>
}
const page:React.CSSProperties={minHeight:"100vh",padding:24,background:"black",color:"white"};const container:React.CSSProperties={maxWidth:1100,margin:"0 auto"};const nav:React.CSSProperties={display:"flex",gap:10,flexWrap:"wrap"};const muted:React.CSSProperties={color:"#bbb"};const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14};const card:React.CSSProperties={padding:18,border:"1px solid #333",borderRadius:12,background:"#0d0d0d"};const field:React.CSSProperties={display:"flex",flexDirection:"column",gap:7,margin:"14px 0",fontWeight:700};const input:React.CSSProperties={padding:10,border:"1px solid #444",borderRadius:8,background:"#111",color:"white"};const button:React.CSSProperties={padding:"9px 12px",border:"1px solid #555",borderRadius:8,background:"#171717",color:"white"};const danger:React.CSSProperties={...button,background:"#651b1b",borderColor:"#991b1b",fontWeight:800};const actions:React.CSSProperties={display:"flex",gap:8,flexWrap:"wrap"};const notice:React.CSSProperties={padding:12,border:"1px solid #555",borderRadius:8,background:"#171717"}
