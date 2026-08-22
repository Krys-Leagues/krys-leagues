"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import styles from "./PublicRecordsUI.module.css"

type Category = "Easy" | "Combined Easy" | "Hard" | "Combined Hard"
type DisplayRow = { key: string; rank: number | null; course: string; score: number }
const CATEGORIES: Category[] = ["Easy", "Combined Easy", "Hard", "Combined Hard"]

export default function PlayerCourseRecords({ playerId }: { playerId: string }) {
  const [category,setCategory]=useState<Category>("Easy"),[rows,setRows]=useState<DisplayRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("")
  useEffect(()=>{let cancelled=false;void(async()=>{setLoading(true);setError("");try{const response=await fetch(`/api/records/public?view=profile&playerId=${encodeURIComponent(playerId)}&category=${encodeURIComponent(category)}`),payload=await response.json() as {rows?:DisplayRow[];error?:string};if(!response.ok)throw new Error(payload.error);if(!cancelled)setRows(payload.rows??[])}catch(caught){if(!cancelled){setError(caught instanceof Error?caught.message:"Course Records could not be loaded.");setRows([])}}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[category,playerId])
  const color=category==="Easy"?styles.easy:category==="Hard"?styles.hard:category==="Combined Easy"?styles.combinedEasy:styles.combinedHard
  return <section className={styles.profilePanel} aria-label="Course Records"><div><h2 className={styles.heading}>Course Records</h2><p className={styles.copy}>All-Time individual and combined-map performances.</p></div><div className={styles.profileTabs}>{CATEGORIES.map(item=><button type="button" key={item} className={styles.tab} aria-pressed={category===item} onClick={()=>setCategory(item)}>{item}</button>)}</div>{loading?<div className={styles.empty}>Loading Course Records…</div>:error?<div className={styles.empty}>{error}</div>:rows.length?<div>{rows.map(row=><div className={styles.compactRow} key={row.key}><span className={styles.compactRank}>#{row.rank}</span><span className={styles.compactCourse}>{row.course}</span><span className={`${styles.compactScore} ${color}`}>{row.score}</span></div>)}</div>:<div className={styles.empty}>No {category} records yet.</div>}<Link className={styles.profileLink} href={category.startsWith("Combined")?"/records/combined":"/records"}>View full leaderboard →</Link></section>
}
