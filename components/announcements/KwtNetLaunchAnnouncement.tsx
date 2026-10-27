"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import {
  KWT_NET_LAUNCH_ANNOUNCEMENT_DISMISSAL_KEY,
  shouldRenderKwtNetLaunchAnnouncement,
} from "@/lib/kwtNetLaunchAnnouncement"
import styles from "./KwtNetLaunchAnnouncement.module.css"

const badges = [
  { src: "/kwt/green-kiwi-sticker.png", alt: "Green Kiwi — bogey-free Easy" },
  { src: "/kwt/gold-kiwi-sticker.png", alt: "Gold Kiwi — bogey-free Hard" },
  { src: "/kwt/coconut-sticker.png", alt: "Coconut — bogey-free Easy and Hard" },
]

export default function KwtNetLaunchAnnouncement() {
  const pathname = usePathname()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!shouldRenderKwtNetLaunchAnnouncement(pathname)) return
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(KWT_NET_LAUNCH_ANNOUNCEMENT_DISMISSAL_KEY) !== "dismissed") setVisible(true)
      } catch {
        setVisible(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [pathname])

  useEffect(() => {
    if (!visible) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [visible])

  function dismiss() {
    try { window.localStorage.setItem(KWT_NET_LAUNCH_ANNOUNCEMENT_DISMISSAL_KEY, "dismissed") } catch { /* continue for storage-restricted visitors */ }
    setVisible(false)
  }

  if (!visible) return null

  return <div className={styles.backdrop} role="presentation">
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="kwt-net-launch-title" aria-describedby="kwt-net-launch-message">
      <button ref={closeRef} className={styles.close} type="button" onClick={dismiss} aria-label="Close KWT NET announcement">×</button>
      <p className={styles.eyebrow}>KRYS LEAGUES · KWT</p>
      <h2 id="kwt-net-launch-title">ONE ROUND. TWO TOURNAMENTS. DOUBLE THE FUN!</h2>
      <p id="kwt-net-launch-message" className={styles.message}>Your KWT rounds now count toward <strong>TWO</strong> competitions! Keep competing in KWT GROSS and discover the new KWT NET Leaderboard, featuring Handicap-adjusted scores, division standings, points, and achievement badges.</p>
      <div className={styles.competitions}>
        <article><strong>KWT GROSS</strong><span>The original KWT competition using actual scores.</span></article>
        <article><strong>KWT NET</strong><span>A new Handicap-adjusted competition with rankings, points, and badges.</span></article>
      </div>
      <div className={styles.badges} aria-label="KWT NET badge examples">
        {badges.map((badge) => <Image key={badge.src} src={badge.src} alt={badge.alt} width={72} height={72} />)}
      </div>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/kwt/net" onClick={dismiss}>VIEW KWT NET LEADERBOARD</Link>
        <button className={styles.secondary} type="button" onClick={dismiss}>CLOSE</button>
      </div>
    </section>
  </div>
}
