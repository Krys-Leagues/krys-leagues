"use client"

import type { CSSProperties } from "react"
import { getYouTubeLiveState } from "@/lib/youtubeLive"
import styles from "./YouTubeLiveLauncher.module.css"

export default function YouTubeLiveLauncher({ artworkStyle }: { artworkStyle?: CSSProperties }) {
  const state = getYouTubeLiveState()
  const label = state.isLive ? "Watch Krys Leagues live on YouTube" : "Watch Krys Leagues on YouTube"

  if (artworkStyle) {
    return (
      <a className="artwork-navigation__target" style={artworkStyle} href={state.destination} target="_blank" rel="noreferrer" aria-label={label} data-artwork-target-id="youtube">
        <span className="sr-only">{label}</span>
      </a>
    )
  }

  return <a className={styles.launcher} href={state.destination} target="_blank" rel="noreferrer" aria-label={label}>
    {state.isLive && <span className={styles.liveLabel}>LIVE NOW</span>}
    {state.isLive && <span className={styles.indicator} aria-hidden="true" />}
    <span className={styles.coreLabel}>WATCH KRYS LEAGUES ON YOUTUBE</span>
    {state.isLive && <span className={styles.indicator} aria-hidden="true" />}
    {state.isLive && <span className={styles.liveLabel}>LIVE NOW</span>}
  </a>
}
