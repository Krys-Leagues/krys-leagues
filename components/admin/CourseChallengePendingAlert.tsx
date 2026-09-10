"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

export default function CourseChallengePendingAlert() {
  const [count, setCount] = useState(0)
  const [latestId, setLatestId] = useState<string | null>(null)
  const [dismissedLatest, setDismissedLatest] = useState<string | null>(() => typeof window === "undefined" ? null : window.localStorage.getItem("course-challenge-dismissed-latest"))
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    let previousLatest: string | null = null
    async function refresh() {
      try {
        const response = await fetch("/api/admin/course-challenges?summary=1", { cache: "no-store" })
        if (!response.ok) return
        const payload = await response.json() as { pendingCount?: number; latestPendingId?: string | null }
        if (!active) return
        const nextCount = Number(payload.pendingCount) || 0
        const nextLatest = payload.latestPendingId || null
        if (previousLatest && nextLatest && previousLatest !== nextLatest) playNotificationSound()
        previousLatest = nextLatest
        setCount(nextCount)
        setLatestId(nextLatest)
        setLoaded(true)
      } catch { /* Admin alert failure must not affect the site. */ }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 20_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  if (!loaded || count < 1) return null
  const showLarge = latestId !== dismissedLatest
  function dismiss() {
    if (!latestId) return
    window.localStorage.setItem("course-challenge-dismissed-latest", latestId)
    setDismissedLatest(latestId)
  }
  return <>
    {showLarge && <div style={banner} role="alert"><strong>COURSE CHALLENGE REVIEWS WAITING: {count}</strong><Link href="/admin/course-challenges/review-desk" style={reviewLink}>REVIEW NOW</Link><button type="button" onClick={dismiss} style={dismissButton}>Dismiss</button></div>}
    <Link href="/admin/course-challenges/review-desk" style={persistent} aria-label={`Course Challenge reviews waiting: ${count}`}>CC REVIEWS: {count}</Link>
  </>
}

function playNotificationSound() {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.2)
    window.setTimeout(() => { void context.close() }, 300)
  } catch { /* Browser audio permissions are optional. */ }
}

const banner: React.CSSProperties = { position: "fixed", zIndex: 70, top: 12, left: "50%", transform: "translateX(-50%)", width: "min(680px, calc(100% - 24px))", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14, padding: "12px 16px", border: "2px solid #f87171", borderRadius: 12, background: "#7f1d1dee", color: "#fff", boxShadow: "0 8px 30px #0008" }
const reviewLink: React.CSSProperties = { color: "#fef08a", fontWeight: 900 }
const dismissButton: React.CSSProperties = { border: "1px solid #fecaca", borderRadius: 6, background: "transparent", color: "#fee2e2", padding: "4px 8px", cursor: "pointer" }
const persistent: React.CSSProperties = { position: "fixed", zIndex: 69, right: 14, bottom: 14, padding: "8px 11px", border: "2px solid #ef4444", borderRadius: 999, background: "#7f1d1d", color: "#fff", fontSize: 12, fontWeight: 900, textDecoration: "none", boxShadow: "0 4px 18px #0009" }
