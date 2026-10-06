"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { shouldRenderMastersLiveAnnouncement } from "@/lib/mastersLiveAnnouncement"
import styles from "./MastersLiveAnnouncement.module.css"

export default function MastersLiveAnnouncement() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  if (!pathname || !shouldRenderMastersLiveAnnouncement(pathname)) return null

  if (!open) return <div className={`${styles.launcherDock} artwork-navigation__utility-launcher`}><button type="button" className={styles.launcher} onClick={() => setOpen(true)}>VIEW MASTERS FINAL RESULTS</button></div>

  return <aside className={styles.card} role="dialog" aria-modal="false" aria-labelledby="masters-live-announcement-title">
    <button type="button" className={styles.close} aria-label="Close Masters Final Results" onClick={() => setOpen(false)}>×</button>
    <p className={styles.eyebrow}>THE MINI-GOLF MASTERS</p>
    <h2 id="masters-live-announcement-title">FINAL RESULTS</h2>
    <p className={styles.message}>View the final Masters standings and results.</p>
    <Link href="/majors/masters/results" className={styles.primary}>VIEW MASTERS FINAL RESULTS</Link>
  </aside>
}
