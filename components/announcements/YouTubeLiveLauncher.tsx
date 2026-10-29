"use client"

import { getYouTubeLiveState } from "@/lib/youtubeLive"
import styles from "./YouTubeLiveLauncher.module.css"

export default function YouTubeLiveLauncher() {
  const state = getYouTubeLiveState()
  return <a className={styles.launcher} href={state.destination} target="_blank" rel="noreferrer" aria-label={state.isLive ? "Watch Krys Leagues live on YouTube" : "Watch Krys Leagues on YouTube"}>
    {state.isLive && <span className={styles.liveLabel}>LIVE NOW</span>}
    {state.isLive && <span className={styles.indicator} aria-hidden="true" />}
    <span className={styles.coreLabel}>WATCH KRYS LEAGUES ON YOUTUBE</span>
    {state.isLive && <span className={styles.indicator} aria-hidden="true" />}
    {state.isLive && <span className={styles.liveLabel}>LIVE NOW</span>}
  </a>
}
