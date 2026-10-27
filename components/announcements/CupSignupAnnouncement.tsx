"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"

import { shouldRenderCupSignupAnnouncement } from "@/lib/cupSignupAnnouncement"
import { isMajorCompleted, type MajorEvent } from "@/lib/majors"
import { getHomeTournamentAction, isVerifiedOpenRegistration, type HomeRegistrationState } from "@/lib/homeTournamentAction"

type Registration = {
  tournament_name: string
} & HomeRegistrationState

type MastersState = Pick<MajorEvent, "slug" | "status" | "signup_open" | "ends_at">

export default function CupSignupAnnouncement() {
  const pathname = usePathname()
  const rendersOnCurrentPath = shouldRenderCupSignupAnnouncement(pathname)
  const [registration, setRegistration] = useState<Registration | null | undefined>(undefined)
  const [mastersCompleted, setMastersCompleted] = useState(false)

  useEffect(() => {
    if (!rendersOnCurrentPath) return
    let active = true
    void Promise.all([
      supabase
        .from("bracket_public_content")
        .select("tournament_name, registration_url, active, registration_open, updated_at")
        .eq("active", true)
        .eq("registration_open", true)
        .order("display_order", { ascending: true })
        .limit(1),
      supabase
        .from("major_events")
        .select("slug, status, signup_open, ends_at")
        .eq("slug", "masters")
        .maybeSingle(),
    ]).then(([registrationResult, mastersResult]) => {
        if (!active) return
        const candidate = (registrationResult.data?.[0] as Registration | undefined) || null
        const next = isVerifiedOpenRegistration(candidate) ? candidate : null
        setRegistration(next)
        setMastersCompleted(Boolean(mastersResult.data && isMajorCompleted(mastersResult.data as MastersState)))
      })
    return () => {
      active = false
    }
  }, [rendersOnCurrentPath])

  if (!rendersOnCurrentPath) return null

  const action = getHomeTournamentAction(registration?.registration_url || null, mastersCompleted)
  if (!action) return null

  return (
    <Link href={action.href} className="artwork-navigation__masters-link" aria-label={action.label}>
      <svg className="artwork-navigation__masters-jacket" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="masters-jacket-green" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2c8a59" />
            <stop offset="0.48" stopColor="#0f5c37" />
            <stop offset="1" stopColor="#062918" />
          </linearGradient>
          <clipPath id="masters-logo-clip">
            <circle cx="36" cy="38" r="6.2" />
          </clipPath>
        </defs>
        <path d="M23 12 36 7l13 5 13 9-6 36H16L10 21l13-9Z" fill="url(#masters-jacket-green)" />
        <path d="M23 12 36 28l13-16M36 7v48M28 40h-8M44 40h8" />
        <path d="m28 40 8-7 8 7v13H28Z" />
        <path d="M30 48h12M30 53h12" />
        <circle cx="36" cy="28" r="1.8" />
        <circle cx="36" cy="36" r="1.8" />
        <image href="/krys-leagues-logo.png" x="29.8" y="31.8" width="12.4" height="12.4" clipPath="url(#masters-logo-clip)" opacity="0.94" preserveAspectRatio="xMidYMid slice" />
      </svg>
      <span className="artwork-navigation__masters-copy">
        <strong>{action.kind === "registration" ? "LIVE TOURNEY SIGN-UPS" : "THE MGA OPEN"}</strong>
        <small>{action.kind === "registration" ? "REGISTER NOW" : "COMING SOON"}</small>
      </span>
      <span className="artwork-navigation__masters-arrow" aria-hidden="true">→</span>
    </Link>
  )
}
