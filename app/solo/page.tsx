"use client"
/* eslint-disable react-hooks/set-state-in-effect */
import Image from "next/image"
import Link from "next/link"
import {useCallback,useEffect,useMemo,useState} from "react"
import {supabase} from "@/lib/supabase"
import {SOLO_DIVISIONS,SOLO_DIVISION_PRESENTATION,type SoloDivision} from "@/lib/solo"
import styles from "./solo.module.css"

type Week={season_number:number;week_number:number;course_name:string|null;course_code:string|null;status:"open"|"closed"}
type Row={season_number:number;week_number:number;division:SoloDivision;player_screen_name:string;easy_stroke_score:number|null;easy_hn1_count:number|null;hard_stroke_score:number|null;hard_hn1_count:number|null;most_hn1_easy:number|null;most_hn1_hard:number|null}
type Trophy={season_number:number;division:SoloDivision;winner_screen_name:string;trophy_image_path:string|null}
type Payload={seasons:{season_number:number}[];weeks:Week[];rows:Row[];trophies:Trophy[]}

export default function SoloPage(){
 const [data,setData]=useState<Payload|null>(null),[view,setView]=useState<"week"|"season">("week"),[season,setSeason]=useState<number|null>(null),[archiveWeek,setArchiveWeek]=useState<number|null>(null),[error,setError]=useState("")
 const load=useCallback(async()=>{const {data:d,error:e}=await supabase.rpc("get_public_solo");if(e)setError(e.message);else{setData(d as Payload);setSeason(v=>v??(d as Payload).seasons[0]?.season_number??null)}},[])
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer)},[load])
 const weeks=useMemo(()=>data?.weeks.filter(w=>w.season_number===season)||[],[data,season]),current=weeks.find(w=>w.status==="open")||weeks.at(-1),shownWeek=archiveWeek??current?.week_number??1,rows=useMemo(()=>data?.rows.filter(r=>r.season_number===season)||[],[data,season]),latest=data?.seasons[0]?.season_number,previous=data?.seasons.find(s=>s.season_number<(latest??0))?.season_number,champions=data?.trophies.filter(t=>t.season_number===previous)||[]
 function chooseArchive(value:string){if(value==="season"){setView("season");setArchiveWeek(null)}else{setView("week");setArchiveWeek(Number(value))}}
 return <main className={styles.page}>
  <header><Image src="/league-media/BIG LOGO TRANSPARENT.png" width={150} height={150} priority alt="Krys Leagues logo"/><div><p>KRYS LEAGUES</p><h1>Krys Leagues Solo</h1><strong>Season {season??"—"} · Week {shownWeek} · {weeks.find(w=>w.week_number===shownWeek)?.course_name||"Course coming soon"} {weeks.find(w=>w.week_number===shownWeek)?.course_code&&`(${weeks.find(w=>w.week_number===shownWeek)?.course_code})`}</strong></div></header>
  <nav className={styles.controls}><button className={view==="week"?styles.active:""} onClick={()=>setView("week")}>CURRENT WEEK</button><button className={view==="season"?styles.active:""} onClick={()=>setView("season")}>SEASON STANDINGS</button><label>Season <select value={season??""} onChange={e=>{setSeason(Number(e.target.value));setArchiveWeek(null)}}>{data?.seasons.map(s=><option key={s.season_number}>{s.season_number}</option>)}</select></label>{season!==latest&&<label>Board <select value={archiveWeek??"season"} onChange={e=>chooseArchive(e.target.value)}><option value="season">Final season</option>{[1,2,3,4].map(n=><option value={n} key={n}>Week {n}</option>)}</select></label>}<Link href="/solo/hall-of-fame">Hall of Fame</Link></nav>
  {error&&<p className={styles.error}>Public Solo data is not installed yet: {error}</p>}
  {SOLO_DIVISIONS.map(division=><section key={division} style={{"--division":SOLO_DIVISION_PRESENTATION[division].color} as React.CSSProperties}><h2>{SOLO_DIVISION_PRESENTATION[division].symbol} {division} · Season {season??"—"}{view==="week"?` · Week ${shownWeek}`:""}</h2>{view==="week"?<Weekly rows={rows.filter(r=>r.division===division&&r.week_number===shownWeek)}/>:<Season rows={rows.filter(r=>r.division===division)} weeks={weeks}/>}</section>)}
  {champions.length>0&&<aside><h2>Defending Champions · Season {previous}</h2><div className={styles.trophies}>{SOLO_DIVISIONS.map(d=>{const t=champions.find(x=>x.division===d);return <article key={d}><b>{SOLO_DIVISION_PRESENTATION[d].symbol} {d}</b>{t?.trophy_image_path&&<Image src={t.trophy_image_path} width={90} height={90} alt={`${d} trophy`}/>}<span>{t?.winner_screen_name||"—"}</span></article>})}</div></aside>}
 </main>
}

function Weekly({rows}:{rows:Row[]}){const ranked=[...rows].sort((a,b)=>(a.easy_stroke_score??9999)+(a.hard_stroke_score??9999)-(b.easy_stroke_score??9999)-(b.hard_stroke_score??9999));return <Board heads={["RANK","PLAYER","E ST","E HN1","H ST","H HN1","E MOST","H MOST"]}>{ranked.map((r,i)=><tr key={r.player_screen_name}><td>{r.easy_stroke_score===null&&r.hard_stroke_score===null?"—":i+1}</td><td>{r.player_screen_name}</td><td>{r.easy_stroke_score??"—"}</td><td>{r.easy_hn1_count??"—"}</td><td>{r.hard_stroke_score??"—"}</td><td>{r.hard_hn1_count??"—"}</td><td>{r.most_hn1_easy??"—"}</td><td>{r.most_hn1_hard??"—"}</td></tr>)}</Board>}
function Season({rows,weeks}:{rows:Row[];weeks:Week[]}){const ranked=[...new Set(rows.map(r=>r.player_screen_name))].map(name=>{const player=rows.filter(r=>r.player_screen_name===name),values=player.flatMap(r=>[r.easy_stroke_score,r.hard_stroke_score]).filter((x):x is number=>x!==null);return{name,player,total:values.length?values.reduce((a,b)=>a+b,0):null}}).sort((a,b)=>a.total===null?1:b.total===null?-1:a.total-b.total);const heads=["RANK","ST","PLAYER",...weeks.flatMap(w=>[w.course_code?`${w.course_code}E`:`W${w.week_number} E`,w.course_code?`${w.course_code}H`:`W${w.week_number} H`])];return <Board heads={heads}>{ranked.map((r,i)=><tr key={r.name}><td>{r.total===null?"—":i+1}</td><td>{r.total??"—"}</td><td>{r.name}</td>{weeks.flatMap(w=>{const x=r.player.find(p=>p.week_number===w.week_number);return[<td key={`${w.week_number}e`}>{x?.easy_stroke_score??"—"}</td>,<td key={`${w.week_number}h`}>{x?.hard_stroke_score??"—"}</td>]})}</tr>)}</Board>}
function Board({heads,children}:{heads:string[];children:React.ReactNode}){return <div className={styles.scroll}><table><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}
