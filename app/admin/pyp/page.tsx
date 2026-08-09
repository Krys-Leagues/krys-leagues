"use client"
import Link from "next/link"
import { useEffect,useState } from "react"
import { supabase } from "@/lib/supabase"
type Season={id:string;season_number:number};
export default function PYPAdminPage(){const [season,setSeason]=useState<Season|null>(null)
useEffect(()=>{void(async()=>{const {data:s}=await supabase.from("seasons").select("id,season_number").eq("league_type","pyp").is("division",null).order("season_number",{ascending:false});if(!s?.length)return;const {data:r}=await supabase.from("pyp_roster_versions").select("season_id").in("season_id",s.map(x=>x.id)).in("status",["draft","approved"]);const ids=new Set((r||[]).map(x=>x.season_id));setSeason((s as Season[]).find(x=>ids.has(x.id))||null)})()},[])
return <main style={page}><h1>PYP Admin</h1><p>Managed Pick Your Poison seasons, rosters, and Home/Away schedules.</p><div style={grid}>
<Link href="/admin/pyp/season" style={card}><b>Setup New Season</b><span>Create one managed PYP season and roster.</span></Link>
<Link href="/admin/pyp/season/edit" style={card}><b>Edit Current Season</b><span>Safely resize a current managed PYP roster.</span></Link>
{season?<><Link href={`/admin/pyp/setup?seasonId=${season.id}&division=1`} style={card}><b>Setup / Rosters</b><span>Edit Season {season.season_number} roster divisions.</span></Link><Link href={`/admin/pyp/schedule?seasonId=${season.id}`} style={card}><b>Schedule &amp; Images</b><span>Generate, review, preview, and download PYP schedules.</span></Link></>:<div style={{...card,opacity:.6}}><b>No managed PYP season</b><span>Create one to begin.</span></div>}
<Link href="/admin/players" style={card}><b>Players</b><span>Open the global player manager.</span></Link><Link href="/admin" style={card}><b>Back to Admin Home</b></Link></div></main>}
const page:React.CSSProperties={minHeight:"100vh",padding:24,background:"black",color:"white"};const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:14};const card:React.CSSProperties={display:"flex",flexDirection:"column",gap:8,padding:18,borderRadius:14,border:"1px solid #333",background:"#111",color:"white",textDecoration:"none"}
