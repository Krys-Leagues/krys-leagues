"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

export default function MastersVerificationPendingAlert() {
  const pathname = usePathname()
  const hiddenForStream = pathname.startsWith("/majors/masters-stream")
  const [summary, setSummary] = useState({ rooms: 0, scores: 0, latestId: null as string | null })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (hiddenForStream) return
    let active = true
    async function refresh() {
      try {
        const result = await fetch("/api/admin/majors/verification-summary", { cache: "no-store" })
        if (!result.ok) return
        const body = await result.json() as { rooms?: number; scores?: number; latestId?: string | null }
        if (active) {
          setSummary({ rooms: Number(body.rooms) || 0, scores: Number(body.scores) || 0, latestId: body.latestId || null })
          setLoaded(true)
        }
      } catch { /* The admin-only alert must never interrupt normal pages. */ }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 20_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [hiddenForStream])

  if (hiddenForStream || !loaded || summary.scores < 1) return null
  return (
    <Link href="/admin/majors/verification" style={alertStyle} role="alert" data-latest-scorecard={summary.latestId || undefined}>
      <strong>🔴 MASTERS SCORES WAITING</strong>
      <span>{summary.rooms} {summary.rooms === 1 ? "ROOM" : "ROOMS"} · {summary.scores} {summary.scores === 1 ? "SCORE" : "SCORES"} TO VERIFY</span>
      <b>REVIEW NOW</b>
    </Link>
  )
}

const alertStyle: React.CSSProperties = {
  position: "fixed", zIndex: 71, top: 12, right: 12, display: "grid", gap: 3,
  maxWidth: "min(360px, calc(100vw - 24px))", padding: "11px 14px", border: "2px solid #fca5a5",
  borderRadius: 12, color: "#fff", background: "#7f1d1df2", boxShadow: "0 8px 30px #0009",
  fontSize: 12, textDecoration: "none",
}
