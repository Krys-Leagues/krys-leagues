"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import Papa from "papaparse"
import { parseKwtSeason15Week01, type KwtSeason15ParseResult } from "@/lib/kwtSeason15Scorecards"
import { verifiedWeek01ScreenName } from "@/lib/kwtSeason15Week01Verification"

export default function KwtWeek01ScorecardsPage() {
  const [review, setReview] = useState<KwtSeason15ParseResult | null>(null)
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState("")
  const rows = useMemo(() => review?.rows.filter((row) => row.playerName.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [], [review, search])

  async function readFile(file: File | undefined) {
    if (!file) return
    setMessage("")
    const text = await file.text()
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    const result = parseKwtSeason15Week01(parsed.data, file.name)
    result.errors.push(...parsed.errors.map((error) => `${file.name}: ${error.message}`))
    setReview(result)
    setMessage(result.errors.length ? "Review is blocked until every source error is resolved." : "Review-only staging complete. No database write was attempted.")
  }

  return <main style={page}><div style={shell}><Link href="/admin/kwt" style={back}>← KWT Admin</Link><h1 style={title}>Season 15 Week 01 Scorecard Review</h1><p style={subtitle}>Protected review of the supplied KWTS15W01 Raptor Cliffs CSV. This Preview preserves raw holes in memory only; Apply/finalization is disabled until the authoritative storage contract and identity decisions are approved.</p><input type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])} />{message && <p role="status" style={messageStyle}>{message}</p>}{review && <><section style={card}><h2>{review.courseName} · {review.eventIdentifier}</h2><p>{review.rows.length} valid scorecards · {review.duplicateRows} exact duplicate rows skipped · {review.errors.length} errors</p><input aria-label="Search player" placeholder="Search player" value={search} onChange={(event) => setSearch(event.target.value)} />{review.errors.map((error) => <p key={error} style={errorStyle}>{error}</p>)}{review.warnings.map((warning) => <p key={warning} style={warningStyle}>{warning}</p>)}</section><section style={card}><h2>Hole-by-hole evidence</h2>{rows.map((row) => { const canonicalName = verifiedWeek01ScreenName(row.playerName); return <details key={`${row.playerName}-${row.sourceRow}`} style={detail}><summary><strong>{row.playerName}</strong> · {row.grossDivision ?? "UNKNOWN GROSS DIVISION"} · Easy {row.easyScore} · Hard {row.hardScore} · {row.combinedAces} gross aces · {canonicalName ? `IDENTITY VERIFIED · ${canonicalName}` : "IDENTITY REVIEW REQUIRED"}</summary><div style={grid}><div><h3>Easy · {row.easyCode}</h3><p>Raw strokes: {row.easyHoles.join(", ")}</p><p>Relative-to-par source score: {row.easyScore}</p><p>Actual gross aces: {row.easyAces}</p></div><div><h3>Hard · {row.hardCode}</h3><p>Raw strokes: {row.hardHoles.join(", ")}</p><p>Relative-to-par source score: {row.hardScore}</p><p>Actual gross aces: {row.hardAces}</p></div></div><p>Total source score: {row.totalScore} · Position: {row.position ?? "—"} · Points: {row.points ?? "—"} · Badges: {row.badges.join(", ") || "—"}</p></details> })}</section></>}</div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#05020d", color: "white" }
const shell: React.CSSProperties = { width: "min(100%, 1100px)", margin: "0 auto" }
const back: React.CSSProperties = { display: "inline-flex", color: "white", textDecoration: "none", border: "1px solid #4de8ff", borderRadius: 999, padding: "10px 16px" }
const title: React.CSSProperties = { fontSize: 38, margin: "28px 0 8px" }
const subtitle: React.CSSProperties = { color: "#b9c4dc", lineHeight: 1.5 }
const card: React.CSSProperties = { marginTop: 20, padding: 20, border: "1px solid #385b89", borderRadius: 14, background: "#071226" }
const detail: React.CSSProperties = { marginTop: 10, padding: 14, border: "1px solid #334155", borderRadius: 10, background: "#0b1220" }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }
const messageStyle: React.CSSProperties = { marginTop: 18, padding: 14, border: "1px solid #2563eb", borderRadius: 10 }
const errorStyle: React.CSSProperties = { color: "#fca5a5" }
const warningStyle: React.CSSProperties = { color: "#fde68a" }
