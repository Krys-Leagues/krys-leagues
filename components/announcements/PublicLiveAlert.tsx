"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { getYouTubeLiveState, liveAlertDismissalKey, shouldRenderPublicLiveAlert } from "@/lib/youtubeLive"

import styles from "./PublicLiveAlert.module.css"

export default function PublicLiveAlert() {
  const pathname = usePathname()
  const state = getYouTubeLiveState()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!state.isLive || !state.streamId) return
    const streamKey = liveAlertDismissalKey(state.streamId)
    let active = true
    const applyDismissal = () => {
      if (!active) return
      try {
        setDismissed(window.localStorage.getItem(streamKey) === "dismissed")
      } catch {
        setDismissed(false)
      }
    }
    queueMicrotask(applyDismissal)
    return () => { active = false }
  }, [state.isLive, state.streamId])

  if (!state.isLive || !state.streamId || dismissed || !shouldRenderPublicLiveAlert(pathname)) return null

  const close = () => {
    try { window.localStorage.setItem(liveAlertDismissalKey(state.streamId as string), "dismissed") } catch { /* session-only dismissal */ }
    setDismissed(true)
  }

  return (
    <aside className={styles.alert} role="status" aria-label="Krys Leagues live stream">
      <span className={styles.dot} aria-hidden="true" />
      <span><strong>PRINCESS_BANKSHOT IS LIVE</strong><small>Krys Leagues is live on YouTube.</small></span>
      <a href={state.destination} target="_blank" rel="noreferrer">WATCH LIVE</a>
      <button type="button" onClick={close} aria-label="Dismiss live stream alert">×</button>
    </aside>
  )
}
