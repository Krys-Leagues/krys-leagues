"use client"

import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import {
  CUP_SIGNUP_ARTWORK_PATH,
  CUP_SIGNUP_DESTINATIONS,
  CUP_SIGNUP_DISMISSAL_KEY,
  CUP_SIGNUP_INSTRUCTION,
  shouldRenderCupSignupAnnouncement,
} from "@/lib/cupSignupAnnouncement"

import styles from "./CupSignupAnnouncement.module.css"

type DisplayState = "checking" | "open" | "closed"

function hasBeenDismissed() {
  try {
    return window.localStorage.getItem(CUP_SIGNUP_DISMISSAL_KEY) === "dismissed"
  } catch {
    return false
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(CUP_SIGNUP_DISMISSAL_KEY, "dismissed")
  } catch {
    // The announcement still closes for this visit when storage is unavailable.
  }
}

export default function CupSignupAnnouncement() {
  const pathname = usePathname()
  const rendersOnCurrentPath = shouldRenderCupSignupAnnouncement(pathname)
  const [display, setDisplay] = useState<DisplayState>("checking")
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!rendersOnCurrentPath) return
    let active = true
    if (hasBeenDismissed()) {
      queueMicrotask(() => {
        if (active) setDisplay("closed")
      })
      return () => {
        active = false
      }
    }

    let observer: MutationObserver | null = null
    const root = document.documentElement
    const canAutoOpen = () => {
      if (!active || root.dataset.optionalSignInWelcome !== "settled") return
      const otherModal = document.querySelector('[role="dialog"][aria-modal="true"]')
      if (!otherModal) {
        observer?.disconnect()
        setDisplay("open")
      }
    }
    observer = new MutationObserver(canAutoOpen)
    observer.observe(root, { attributes: true, attributeFilter: ["data-optional-sign-in-welcome"] })
    observer.observe(document.body, { childList: true, subtree: true })
    canAutoOpen()
    return () => {
      active = false
      observer?.disconnect()
    }
  }, [rendersOnCurrentPath])

  useEffect(() => {
    if (display !== "open") return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        rememberDismissal()
        setDisplay("closed")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      previouslyFocused?.focus()
    }
  }, [display])

  if (!rendersOnCurrentPath || display === "checking") return null

  if (display === "closed") {
    return (
      <div className={styles.launcherDock}>
        <button type="button" className={styles.launcher} onClick={() => setDisplay("open")}>
          <span aria-hidden="true">🏆</span> CUP SIGNUPS
        </button>
      </div>
    )
  }

  const close = () => {
    rememberDismissal()
    setDisplay("closed")
  }

  return (
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) close()
    }}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cup-signup-announcement-title"
      >
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.close}
          aria-label="Close Cup signup announcement"
          onClick={close}
        >
          ×
        </button>
        <p className={styles.eyebrow}>KRYS LEAGUES CUP SIGNUPS</p>
        <h2 id="cup-signup-announcement-title">{CUP_SIGNUP_INSTRUCTION}</h2>
        <div className={styles.artworkFrame}>
          <Image
            className={styles.artwork}
            src={CUP_SIGNUP_ARTWORK_PATH}
            alt="Rydervale Cup, Tiara Cup, and Next Gen Cup signup artwork"
            width={2064}
            height={1152}
            priority
            sizes="(max-width: 700px) calc(100vw - 32px), min(1100px, calc(100vw - 64px))"
          />
          {CUP_SIGNUP_DESTINATIONS.map((cup) => (
            <a
              key={cup.id}
              className={styles.cupLink}
              href={cup.url}
              aria-label={cup.label}
              style={{
                left: `${cup.area.left}%`,
                top: `${cup.area.top}%`,
                width: `${cup.area.width}%`,
                height: `${cup.area.height}%`,
              }}
            />
          ))}
        </div>
        <button type="button" className={styles.closeText} onClick={close}>CLOSE</button>
      </section>
    </div>
  )
}
