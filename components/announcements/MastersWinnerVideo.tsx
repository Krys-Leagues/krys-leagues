"use client"

import { useEffect, useRef, useState } from "react"

import {
  isMastersWinnerVideoActive,
  MASTERS_WINNER_VIDEO_EXPIRES_AT,
  MASTERS_WINNER_VIDEO_PATH,
  MASTERS_WINNER_VIDEO_SEEN_KEY,
} from "@/lib/mastersWinnerVideo"

import styles from "./MastersWinnerVideo.module.css"

type Visibility = "checking" | "visible" | "expired"
type PlaybackState = "idle" | "attempting" | "playing" | "blocked" | "ended"
type VideoMode = "minimized" | "open"

function hasSeenWinnerVideo() {
  try {
    return window.localStorage.getItem(MASTERS_WINNER_VIDEO_SEEN_KEY) === "true"
  } catch {
    return false
  }
}

function markWinnerVideoSeen() {
  try {
    window.localStorage.setItem(MASTERS_WINNER_VIDEO_SEEN_KEY, "true")
  } catch {
    // The feature remains playable when browser storage is unavailable.
  }
}

export default function MastersWinnerVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [visibility, setVisibility] = useState<Visibility>(() => isMastersWinnerVideoActive() ? "visible" : "expired")
  const [mode, setMode] = useState<VideoMode>("minimized")
  const [playback, setPlayback] = useState<PlaybackState>("idle")

  useEffect(() => {
    if (visibility !== "visible") return
    const remaining = Date.parse(MASTERS_WINNER_VIDEO_EXPIRES_AT) - Date.now()
    const expiryTimer = window.setTimeout(() => setVisibility("expired"), Math.max(0, remaining))
    return () => window.clearTimeout(expiryTimer)
  }, [visibility])

  useEffect(() => {
    if (visibility !== "visible" || mode !== "open" || hasSeenWinnerVideo()) return

    const video = videoRef.current
    if (!video) return

    markWinnerVideoSeen()
    video.muted = true
    video.defaultMuted = true
    setPlayback("attempting")
    const attempt = video.play()
    attempt?.then(
      () => setPlayback("playing"),
      () => setPlayback("blocked"),
    )
  }, [mode, visibility])

  if (visibility !== "visible") return null

  const playManually = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = false
    setPlayback("attempting")
    video.play().then(
      () => setPlayback("playing"),
      () => setPlayback("blocked"),
    )
  }

  const watchAgain = () => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    setPlayback("attempting")
    video.play().then(
      () => setPlayback("playing"),
      () => setPlayback("blocked"),
    )
  }

  if (mode === "minimized") {
    return <aside className={styles.minimized} aria-label="Masters champion video">
      <span className={styles.minimizedLabel}>MASTERS CHAMPION</span>
      <button type="button" className={styles.openButton} onClick={() => setMode("open")}>WATCH AGAIN</button>
    </aside>
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="masters-winner-video-title">
      <aside className={styles.card}>
        <button type="button" className={styles.close} aria-label="Close Masters champion video" onClick={() => { videoRef.current?.pause(); setMode("minimized") }}>×</button>
      <p className={styles.eyebrow}>THE MINI-GOLF MASTERS</p>
      <h2 id="masters-winner-video-title">2026 CHAMPION PRESENTATION</h2>
      <div className={styles.videoFrame}>
        <video
          ref={videoRef}
          className={styles.video}
          controls
          playsInline
          preload="metadata"
          src={MASTERS_WINNER_VIDEO_PATH}
          onEnded={() => setPlayback("ended")}
          aria-label="2026 Masters champion presentation"
        />
      </div>
      <div className={styles.actions}>
        {playback === "blocked" && (
          <button type="button" className={styles.playButton} onClick={playManually}>
            PLAY PRESENTATION
          </button>
        )}
        <button type="button" className={styles.watchAgain} onClick={watchAgain}>
          WATCH AGAIN
        </button>
      </div>
      {playback === "playing" && <p className={styles.note}>Autoplay started muted. Use the video controls for sound.</p>}
      </aside>
    </div>
  )
}
