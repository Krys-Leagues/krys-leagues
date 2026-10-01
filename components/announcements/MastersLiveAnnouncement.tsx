"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import {
  shouldRenderMastersLiveAnnouncement,
} from "@/lib/mastersLiveAnnouncement"

import styles from "./MastersLiveAnnouncement.module.css"

export default function MastersLiveAnnouncement() {
  const pathname = usePathname()
  const [open, setOpen] = useState(true)

  if (!pathname || !shouldRenderMastersLiveAnnouncement(pathname)) return null

  if (!open) {
    return (
      <div className={styles.launcherDock}>
        <button type="button" className={styles.launcher} onClick={() => setOpen(true)}>
          VIEW LIVE MASTERS SCORE TRACKER
        </button>
      </div>
    )
  }

  return (
    <aside
      className={styles.card}
      role="dialog"
      aria-modal="false"
      aria-labelledby="masters-live-announcement-title"
    >
      <button
        type="button"
        className={styles.close}
        aria-label="Close Live Masters Score Tracker"
        onClick={() => setOpen(false)}
      >
        ×
      </button>
      <p className={styles.eyebrow}>THE MINI-GOLF MASTERS</p>
      <h2 id="masters-live-announcement-title">LIVE SCORE TRACKER</h2>
      <p className={styles.message}>Follow the full Masters field and live round results.</p>
      <Link href="/majors/masters/results" className={styles.primary}>
        VIEW LIVE MASTERS SCORE TRACKER
      </Link>
    </aside>
  )
}
