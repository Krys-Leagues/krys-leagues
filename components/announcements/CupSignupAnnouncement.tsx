"use client"

import Image from "next/image"
import { usePathname } from "next/navigation"
import { useRef, useState } from "react"
import { CUP_SIGNUP_ARTWORK_PATH, CUP_SIGNUP_DESTINATIONS, CUP_SIGNUP_DISCORD_INVITE_URL, CUP_SIGNUP_DISMISSAL_KEY, CUP_SIGNUP_INSTRUCTION, XYLODON_SIGNUP_ARTWORK_PATH, XYLODON_SIGNUP_URL, shouldRenderCupSignupAnnouncement } from "@/lib/cupSignupAnnouncement"
import styles from "./CupSignupAnnouncement.module.css"

export default function CupSignupAnnouncement() {
  const pathname = usePathname()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  if (!shouldRenderCupSignupAnnouncement(pathname)) return null

  const close = () => {
    try { window.localStorage.setItem(CUP_SIGNUP_DISMISSAL_KEY, "dismissed") } catch { /* close for this visit */ }
    setOpen(false)
  }

  if (!open) return <div className={`${styles.launcherDock} artwork-navigation__utility-launcher`}><button type="button" className={styles.launcher} onClick={() => setOpen(true)}><span aria-hidden="true">🏆</span> LIVE TOURNEY SIGN-UPS</button></div>

  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="cup-signup-announcement-title">
      <button ref={closeButtonRef} type="button" className={styles.close} aria-label="Close live tourney sign-ups" onClick={close}>×</button>
      <p className={styles.eyebrow}>KRYS LEAGUES</p>
      <h2 id="cup-signup-announcement-title">LIVE TOURNEY SIGN-UPS</h2>
      <div className={styles.cardGrid}>
        <article className={styles.signupCard}>
          <p className={styles.cardTitle}>CUP SIGN-UPS</p>
          <p className={styles.cardInstruction}>{CUP_SIGNUP_INSTRUCTION}</p>
          <div className={styles.artworkFrame}>
            <Image className={styles.artwork} src={CUP_SIGNUP_ARTWORK_PATH} alt="Rydervale Cup, Tiara Cup, and Next Gen Cup signup artwork" width={2064} height={1152} />
            {CUP_SIGNUP_DESTINATIONS.map((cup) => <a key={cup.id} className={styles.cupLink} href={cup.url} aria-label={cup.label} style={{ left: `${cup.area.left}%`, top: `${cup.area.top}%`, width: `${cup.area.width}%`, height: `${cup.area.height}%` }} />)}
          </div>
        </article>
        <article className={styles.signupCard}>
          <p className={styles.cardTitle}>ESCAPE FROM PLANET XYLODON</p>
          <a className={styles.xylodonLink} href={XYLODON_SIGNUP_URL} aria-label="Sign up for Escape from Planet Xylodon"><Image className={styles.xylodonArtwork} src={XYLODON_SIGNUP_ARTWORK_PATH} alt="Escape from Planet Xylodon 1-Day Tourney" width={1536} height={1024} /></a>
          <a className={styles.cardButton} href={XYLODON_SIGNUP_URL}>SIGN UP FOR XYLODON</a>
        </article>
      </div>
      <div className={styles.joinFallback}><span>Not in the Krys Leagues Discord yet?</span><a className={styles.joinButton} href={CUP_SIGNUP_DISCORD_INVITE_URL}>JOIN OUR DISCORD</a></div>
      <button type="button" className={styles.closeText} onClick={close}>CLOSE</button>
    </section>
  </div>
}
