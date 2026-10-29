"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

type BannerState = "upcoming" | "priority" | "open" | "full" | "closed"

type BannerPayload = {
  state?: BannerState
  publicSignupOpensAt?: string | null
  scheduleTimeZone?: string | null
}

const FALLBACK_PUBLIC_OPEN = "November 1, 2026 at 8:00 AM EST"

function formatPublicOpening(value: string | null | undefined, timeZone: string | null | undefined) {
  if (!value) return FALLBACK_PUBLIC_OPEN

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone || "America/New_York",
      timeZoneName: "short",
    }).format(new Date(value))
  } catch {
    return FALLBACK_PUBLIC_OPEN
  }
}

function stateCopy(state: BannerState, publicOpening: string) {
  switch (state) {
    case "priority":
      return "VIP priority registration is open for eligible Masters finalists."
    case "open":
      return "Registration is open — choose all four playing times."
    case "full":
      return "Registration is currently full."
    case "closed":
      return "Registration is currently closed."
    default:
      return `General registration opens ${publicOpening}.`
  }
}

export default function MgaHomepageBanner() {
  const [payload, setPayload] = useState<BannerPayload>({ state: "upcoming" })

  useEffect(() => {
    let cancelled = false
    void fetch("/api/majors/home-banner", { cache: "no-store", credentials: "include" })
      .then((response) => response.ok ? response.json() as Promise<BannerPayload> : null)
      .then((next) => {
        if (!cancelled && next) setPayload(next)
      })
      .catch(() => {
        // The safe fallback keeps the general opening date visible when the
        // optional personalized status request is unavailable.
      })

    return () => { cancelled = true }
  }, [])

  const publicOpening = formatPublicOpening(payload.publicSignupOpensAt, payload.scheduleTimeZone)
  const state = payload.state || "upcoming"

  return (
    <section className="artwork-navigation__mga-section" aria-label="The MGA Open registration">
      <Link
        href="/majors/major-2"
        className="artwork-navigation__mga-link"
        aria-label="The MGA Open registration and signup"
      >
        <Image
          className="artwork-navigation__mga-artwork"
          src="/approved-pages/the mga open.jpg"
          alt="Gardens of Babylon artwork for The MGA Open"
          width={2048}
          height={682}
          priority
          draggable={false}
        />
        <span className="artwork-navigation__mga-status-panel">
          <strong className="artwork-navigation__mga-status-title">THE MGA OPEN</strong>
          <span className="artwork-navigation__mga-status-copy" role="status">{stateCopy(state, publicOpening)}</span>
          <span className="artwork-navigation__mga-status-cta">VIEW SIGNUP →</span>
        </span>
      </Link>
    </section>
  )
}
