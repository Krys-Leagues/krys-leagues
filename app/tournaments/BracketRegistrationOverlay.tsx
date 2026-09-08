"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Registration = {
  tournament_name: string
  registration_url: string
  registration_open: boolean
  button_label: string
}

export default function BracketRegistrationOverlay() {
  const [registration, setRegistration] = useState<Registration | null>(null)

  useEffect(() => {
    let mounted = true
    void supabase
      .from("bracket_public_content")
      .select("tournament_name, registration_url, registration_open, button_label")
      .eq("active", true)
      .eq("registration_open", true)
      .order("display_order", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (mounted) setRegistration((data?.[0] as Registration | undefined) || null)
      })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div aria-live="polite" style={overlay}>
      {registration && (
        <a
          href={registration.registration_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${registration.button_label || "Register Now"} for ${registration.tournament_name}`}
          style={registrationLink}
        >
          <span>{registration.tournament_name}</span>
          <strong>{registration.button_label || "Register Now"} →</strong>
        </a>
      )}
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  pointerEvents: "none",
}

const registrationLink: React.CSSProperties = {
  position: "absolute",
  top: "73.5%",
  left: "21.0%",
  width: "18.4%",
  height: "15.0%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  gap: "4%",
  padding: "2.4% 3.2%",
  borderRadius: "2%",
  color: "#fff",
  background: "linear-gradient(180deg, rgba(1, 31, 32, .18), rgba(1, 31, 32, .92) 70%)",
  boxShadow: "inset 0 0 0 2px rgba(85, 255, 222, .7), 0 0 16px rgba(50, 255, 210, .45)",
  fontSize: "clamp(11px, 1.35vw, 22px)",
  fontWeight: 800,
  lineHeight: 1.1,
  pointerEvents: "auto",
  textDecoration: "none",
}
