"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { ADMIN_PENDING_POLL_INTERVAL_MS, shouldPollAdminPendingAlerts } from "@/lib/adminPendingPolling"
import { supabase } from "@/lib/supabase"

type PendingSummary = {
  courseChallenges: { count: number; latestId: string | null }
  masters: { rooms: number; scores: number; latestId: string | null }
}

const EMPTY_SUMMARY: PendingSummary = {
  courseChallenges: { count: 0, latestId: null },
  masters: { rooms: 0, scores: 0, latestId: null },
}

export default function AdminPendingAlerts() {
  const pathname = usePathname()
  const hiddenForStream = pathname.startsWith("/majors/masters-stream")
  const [hasSession, setHasSession] = useState(false)
  const [summary, setSummary] = useState<PendingSummary>(EMPTY_SUMMARY)
  const [loaded, setLoaded] = useState(false)
  const [dismissedLatest, setDismissedLatest] = useState<string | null>(() => typeof window === "undefined" ? null : window.localStorage.getItem("course-challenge-dismissed-latest"))
  const previousCourseChallengeLatest = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const applySession = (session: { access_token?: string } | null) => {
      if (!active) return
      const authenticated = Boolean(session?.access_token)
      setHasSession(authenticated)
      if (!authenticated) {
        setSummary(EMPTY_SUMMARY)
        setLoaded(false)
      }
    }
    void supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session))
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!hasSession || hiddenForStream) return

    let active = true
    let accessDenied = false
    let inFlight = false
    let timer: number | null = null
    let controller: AbortController | null = null

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    }

    const canPoll = () => shouldPollAdminPendingAlerts({
      hasSession,
      accessDenied,
      hiddenForStream,
      documentVisible: document.visibilityState !== "hidden",
    })

    const schedule = () => {
      clearTimer()
      if (!active || !canPoll()) return
      timer = window.setTimeout(() => void refresh(), ADMIN_PENDING_POLL_INTERVAL_MS)
    }

    async function refresh() {
      if (!active || inFlight || !canPoll()) return
      inFlight = true
      controller = new AbortController()
      try {
        const response = await fetch("/api/admin/pending-summary", { cache: "no-store", signal: controller.signal })
        if (response.status === 401 || response.status === 403) {
          accessDenied = true
          setSummary(EMPTY_SUMMARY)
          setLoaded(false)
          return
        }
        if (!response.ok) return
        const payload = await response.json() as PendingSummary
        if (!active) return
        const nextLatest = payload.courseChallenges.latestId || null
        if (previousCourseChallengeLatest.current && nextLatest && previousCourseChallengeLatest.current !== nextLatest) playNotificationSound()
        previousCourseChallengeLatest.current = nextLatest
        setSummary(payload)
        setLoaded(true)
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          // Admin alert failure must not affect the site. A later bounded poll retries it.
        }
      } finally {
        inFlight = false
        controller = null
        schedule()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") clearTimer()
      else void refresh()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    if (document.visibilityState !== "hidden") void refresh()
    return () => {
      active = false
      clearTimer()
      controller?.abort()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [hasSession, hiddenForStream])

  if (hiddenForStream || !loaded) return null

  const courseChallengeCount = summary.courseChallenges.count
  const courseChallengeLatestId = summary.courseChallenges.latestId
  const showCourseChallengeBanner = courseChallengeCount > 0 && courseChallengeLatestId !== dismissedLatest

  function dismissCourseChallengeAlert() {
    if (!courseChallengeLatestId) return
    window.localStorage.setItem("course-challenge-dismissed-latest", courseChallengeLatestId)
    setDismissedLatest(courseChallengeLatestId)
  }

  return <>
    {showCourseChallengeBanner && <div style={courseChallengeBanner} role="alert"><strong>COURSE CHALLENGE REVIEWS WAITING: {courseChallengeCount}</strong><Link href="/admin/course-challenges/review-desk" style={reviewLink}>REVIEW NOW</Link><button type="button" onClick={dismissCourseChallengeAlert} style={dismissButton}>Dismiss</button></div>}
    {courseChallengeCount > 0 && <Link href="/admin/course-challenges/review-desk" style={courseChallengePersistent} aria-label={`Course Challenge reviews waiting: ${courseChallengeCount}`}>CC REVIEWS: {courseChallengeCount}</Link>}
    {summary.masters.scores > 0 && <Link href="/admin/majors/verification" style={mastersAlert} role="alert" data-latest-scorecard={summary.masters.latestId || undefined}>
      <strong>🔴 MASTERS SCORES WAITING</strong>
      <span>{summary.masters.rooms} {summary.masters.rooms === 1 ? "ROOM" : "ROOMS"} · {summary.masters.scores} {summary.masters.scores === 1 ? "SCORE" : "SCORES"} TO VERIFY</span>
      <b>REVIEW NOW</b>
    </Link>}
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

const courseChallengeBanner: React.CSSProperties = { position: "fixed", zIndex: 70, top: 12, left: "50%", transform: "translateX(-50%)", width: "min(680px, calc(100% - 24px))", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14, padding: "12px 16px", border: "2px solid #f87171", borderRadius: 12, background: "#7f1d1dee", color: "#fff", boxShadow: "0 8px 30px #0008" }
const reviewLink: React.CSSProperties = { color: "#fef08a", fontWeight: 900 }
const dismissButton: React.CSSProperties = { border: "1px solid #fecaca", borderRadius: 6, background: "transparent", color: "#fee2e2", padding: "4px 8px", cursor: "pointer" }
const courseChallengePersistent: React.CSSProperties = { position: "fixed", zIndex: 69, right: 14, bottom: 14, padding: "8px 11px", border: "2px solid #ef4444", borderRadius: 999, background: "#7f1d1d", color: "#fff", fontSize: 12, fontWeight: 900, textDecoration: "none", boxShadow: "0 4px 18px #0009" }
const mastersAlert: React.CSSProperties = { position: "fixed", zIndex: 71, top: 12, right: 12, display: "grid", gap: 3, maxWidth: "min(360px, calc(100vw - 24px))", padding: "11px 14px", border: "2px solid #fca5a5", borderRadius: 12, color: "#fff", background: "#7f1d1df2", boxShadow: "0 8px 30px #0009", fontSize: 12, textDecoration: "none" }
