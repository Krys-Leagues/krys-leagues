"use client"

import { useEffect, useRef, useState } from "react"
import { isMastersWinnerVideoActive, MASTERS_WINNER_VIDEO_EXPIRES_AT, MASTERS_WINNER_VIDEO_PATH, MASTERS_WINNER_VIDEO_SEEN_KEY } from "@/lib/mastersWinnerVideo"
import styles from "./MastersWinnerVideo.module.css"

type PlaybackState = "idle" | "attempting" | "playing" | "blocked" | "ended"

function hasSeenVideo() {
  try { return window.localStorage.getItem(MASTERS_WINNER_VIDEO_SEEN_KEY) === "true" } catch { return false }
}

function markVideoSeen() {
  try { window.localStorage.setItem(MASTERS_WINNER_VIDEO_SEEN_KEY, "true") } catch { /* play remains available */ }
}

export default function MastersWinnerVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(() => isMastersWinnerVideoActive())
  const [playback, setPlayback] = useState<PlaybackState>("idle")

  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => setVisible(false), Math.max(0, Date.parse(MASTERS_WINNER_VIDEO_EXPIRES_AT) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [visible])

  useEffect(() => {
    if (!visible || hasSeenVideo() || !videoRef.current) return
    markVideoSeen()
    const video = videoRef.current
    video.muted = true
    video.defaultMuted = true
    setPlayback("attempting")
    video.play().then(() => setPlayback("playing"), () => setPlayback("blocked"))
  }, [visible])

  if (!visible) return null

  const play = (withSound: boolean, restart = false) => {
    const video = videoRef.current
    if (!video) return
    if (restart) video.currentTime = 0
    video.muted = !withSound
    setPlayback("attempting")
    video.play().then(() => setPlayback("playing"), () => setPlayback("blocked"))
  }

  return (
    <aside className={styles.card} aria-labelledby="masters-winner-video-title">
      <p className={styles.eyebrow}>THE MINI-GOLF MASTERS</p>
      <h2 id="masters-winner-video-title">2026 CHAMPION PRESENTATION</h2>
      <div className={styles.videoFrame}>
        <video ref={videoRef} className={styles.video} controls playsInline preload="metadata" src={MASTERS_WINNER_VIDEO_PATH} onEnded={() => setPlayback("ended")} aria-label="2026 Masters champion presentation" />
      </div>
      <div className={styles.actions}>
        {playback === "blocked" && <button type="button" className={styles.playButton} onClick={() => play(true)}>PLAY PRESENTATION</button>}
        <button type="button" className={styles.watchAgain} onClick={() => play(true, true)}>WATCH AGAIN</button>
      </div>
      {playback === "playing" && <p className={styles.note}>Autoplay started muted. Use the video controls for sound.</p>}
    </aside>
  )
}
