"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import {
  MASTERS_LIVE_ANNOUNCEMENT_KEY,
  shouldRenderMastersLiveAnnouncement,
} from "@/lib/mastersLiveAnnouncement"

import styles from "./MastersLiveAnnouncement.module.css"

export default function MastersLiveAnnouncement() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      if (!pathname || !shouldRenderMastersLiveAnnouncement(pathname)) {
        setVisible(false)
        return
      }

      try {
        setVisible(window.localStorage.getItem(MASTERS_LIVE_ANNOUNCEMENT_KEY) !== "dismissed")
      } catch {
        // A storage restriction must not make the public site unusable.
        setVisible(true)
      }
    })
    return () => {
      active = false
    }
  }, [pathname])

  function dismiss() {
    try {
      window.localStorage.setItem(MASTERS_LIVE_ANNOUNCEMENT_KEY, "dismissed")
    } catch {
      // The component still closes for this render if browser storage is unavailable.
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="masters-live-announcement-title"
    >
      <section className={styles.panel}>
        <div className={styles.blossom} aria-hidden="true">🌸</div>
        <p className={styles.eyebrow}>KRYS LEAGUES PRESENTS</p>
        <h2 id="masters-live-announcement-title">THE MINI-GOLF MASTERS IS LIVE! 🌸⛳</h2>
        <p className={styles.message}>Players of ALL skill levels are welcome in The Masters.</p>
        <p className={styles.message}>
          Signups are now open. Choose your times for all four rounds and come join us for the first Krys Leagues Major!
        </p>
        <div className={styles.actions}>
          <Link href="/majors/masters" onClick={dismiss} className={styles.primary}>
            GO TO THE MINI-GOLF MASTERS
          </Link>
          <button type="button" onClick={dismiss} className={styles.secondary}>
            NOT NOW
          </button>
        </div>
      </section>
    </div>
  )
}
