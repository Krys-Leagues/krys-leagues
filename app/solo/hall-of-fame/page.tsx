"use client"
import Image from "next/image"
import Link from "next/link"
import {useEffect,useState} from "react"
import {supabase} from "@/lib/supabase"
import {SOLO_DIVISION_PRESENTATION,type SoloDivision} from "@/lib/solo"
type Trophy={season_number:number;division:SoloDivision;winner_screen_name:string;trophy_image_path:string|null}
export default function SoloHallOfFame(){const [trophies,setTrophies]=useState<Trophy[]>([]);useEffect(()=>{void supabase.rpc("get_public_solo").then(({data})=>setTrophies((data?.trophies||[]) as Trophy[]))},[]);return <main style={{minHeight:"100vh",padding:24,background:"linear-gradient(145deg,#06282d,#240919)",color:"white"}}><Link href="/solo" style={{color:"#8de5dd"}}>← Krys Leagues Solo</Link><h1>Solo Hall of Fame</h1>{[...new Set(trophies.map(t=>t.season_number))].sort((a,b)=>b-a).map(season=><section key={season}><h2>Season {season}</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>{trophies.filter(t=>t.season_number===season).map(t=><article key={t.division} style={{padding:15,borderRadius:14,background:SOLO_DIVISION_PRESENTATION[t.division]?.color||"#ddd",color:"#151515",textAlign:"center"}}><h3>{SOLO_DIVISION_PRESENTATION[t.division]?.symbol} {t.division}</h3>{t.trophy_image_path&&<Image src={t.trophy_image_path} width={180} height={180} alt={`${t.division} champion trophy`} style={{objectFit:"contain"}}/>}<strong>{t.winner_screen_name}</strong></article>)}</div></section>)}</main>}
