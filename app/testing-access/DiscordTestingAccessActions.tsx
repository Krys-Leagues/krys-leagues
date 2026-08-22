"use client"

import { useState } from "react"

import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"

export function DiscordTestingAccessSignIn({ next }: { next: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function signIn() {
    setBusy(true)
    setMessage("")
    const returnTo = `/testing-access?next=${encodeURIComponent(next)}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: createDiscordAuthCallbackUrl("player", returnTo) },
    })
    if (error) {
      setBusy(false)
      setMessage("Discord sign-in could not be started. Please try again.")
    }
  }

  return <>
    <button type="button" onClick={() => void signIn()} disabled={busy} style={button}>
      {busy ? "Opening Discord…" : "Sign in with Discord"}
    </button>
    {message && <p style={errorText}>{message}</p>}
  </>
}

export function DiscordTestingAccessSignOut() {
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    await supabase.auth.signOut()
    window.location.replace("/testing-access")
  }

  return <button type="button" onClick={() => void signOut()} disabled={busy} style={button}>
    {busy ? "Signing out…" : "Sign Out / Try Another Discord Account"}
  </button>
}

const button: React.CSSProperties = {
  minHeight: 46,
  padding: "12px 18px",
  border: 0,
  borderRadius: 10,
  background: "#5865f2",
  color: "white",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 800,
}

const errorText: React.CSSProperties = { color: "#fecaca" }
