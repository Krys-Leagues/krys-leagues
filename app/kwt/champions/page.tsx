"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type Page = { id: string; season_number: number; week_number: number; course_code: string; title: string; article_title: string; story_body: string; artwork_storage_path: string | null; published_at: string | null }
type Award = { id: string; recipient_name_snapshot: string; division: string; placement: number; award_category: string; imageUrl: string; playerUrl: string; season: number; week: number; course: string }

export default function KwtChampionsPage() {
  const [pages, setPages] = useState<Page[]>([])
  const [awards, setAwards] = useState<Award[]>([])
  const [error, setError] = useState("")
  useEffect(() => { void fetch("/api/kwt/championships", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "KWT history is unavailable."); setPages(data.pages || []); setAwards(data.awards || []) }).catch((caught) => setError(caught instanceof Error ? caught.message : "KWT history is unavailable.")) }, [])
  return <main style={page}><div style={shell}><Link href="/kwt" style={back}>← KWT</Link><header><p style={eyebrow}>KRYS WEEKEND TOURNAMENT</p><h1>KWT Hall of Champions &amp; Memories</h1><p style={intro}>A permanent home for verified KWT champions, stories, photographs, scorecards, badges, and awarded trophies.</p></header>{error ? <p role="alert" style={card}>{error}</p> : pages.length === 0 ? <section style={card}><h2>Championship stories are being prepared.</h2><p>No approved KWT weekly story has been published yet. Drafts remain private until an authorized admin approves a complete page.</p></section> : pages.map((item) => <article key={item.id} style={story}>{item.artwork_storage_path && <img src={`/api/kwt/championships/${item.id}/artwork`} alt="Championship artwork" style={artwork} /> }<p style={eyebrow}>SEASON {item.season_number} · WEEK {item.week_number} · {item.course_code}</p><h2>{item.article_title || item.title}</h2><p style={copy}>{item.story_body}</p><section><h3>Verified awards</h3><div style={awardGrid}>{awards.filter((award) => award.season === item.season_number && award.week === item.week_number && award.course === item.course_code).map((award) => <div key={award.id} style={awardCard}><img src={award.imageUrl} alt={`${award.recipient_name_snapshot} trophy`} style={trophy} /><Link href={award.playerUrl}>{award.recipient_name_snapshot}</Link><span>{award.award_category} · {award.division} · {award.placement}</span></div>)}</div></section></article>)}</div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", color: "#fff", background: "linear-gradient(150deg,#080312,#20103b 52%,#050208)", padding: "28px 16px 64px" }
const shell: React.CSSProperties = { width: "min(1120px,100%)", margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-block", color: "#d9f5ff", textDecoration: "none", border: "1px solid #7356a6", borderRadius: 999, padding: "10px 15px" }
const eyebrow: React.CSSProperties = { color: "#8deeff", letterSpacing: ".16em", fontWeight: 900, fontSize: 12 }
const intro: React.CSSProperties = { maxWidth: 720, color: "#d7ccea", fontSize: 18 }
const card: React.CSSProperties = { marginTop: 28, padding: 26, borderRadius: 20, background: "rgba(14,7,28,.84)", border: "1px solid #5c4085" }
const story: React.CSSProperties = { ...card, marginTop: 24 }
const artwork: React.CSSProperties = { width: "100%", maxHeight: 620, objectFit: "contain", borderRadius: 14, background: "#050208" }
const copy: React.CSSProperties = { whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#eee7f7" }
const awardGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }
const awardCard: React.CSSProperties = { display: "grid", gap: 6, padding: 12, borderRadius: 14, background: "rgba(255,255,255,.06)", color: "#fff" }
const trophy: React.CSSProperties = { width: "100%", aspectRatio: "1", objectFit: "contain", background: "rgba(0,0,0,.3)" }
