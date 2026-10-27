"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { createDiscordAuthCallbackUrl, currentInternalReturnTo } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"

export async function startDiscordSignIn(returnTo?: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: createDiscordAuthCallbackUrl("player", returnTo),
    },
  })
  return error ? new Error("Sign-in could not be started. Please try again.") : null
}

export default function DiscordSignInButton({ className, returnTo, style }: { className?: string; returnTo?: string; style?: CSSProperties }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session))
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session))
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (signedIn !== false) return null

  async function signIn() {
    setError(false)
    if (await startDiscordSignIn(returnTo || currentInternalReturnTo() || undefined)) setError(true)
  }

  return <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
    <button
      type="button"
      onClick={() => void signIn()}
      aria-label="Sign in with Discord"
      title="Sign in with Discord"
      style={{ width: 42, height: 42, display: "inline-grid", placeItems: "center", padding: 0, border: "1px solid #ffffff38", borderRadius: 10, background: "#5865f233", color: "#f8fafc", cursor: "pointer" }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M19.54 4.37A16.9 16.9 0 0 0 15.46 3l-.5 1.02a15.3 15.3 0 0 0-5.92 0L8.54 3a16.9 16.9 0 0 0-4.08 1.37C1.88 8.42 1.18 12.36 1.53 16.24a16.8 16.8 0 0 0 5.02 2.54l1.22-1.67c-.67-.24-1.31-.54-1.91-.9l.47-.36c3.68 1.73 7.67 1.73 11.3 0l.47.36c-.6.36-1.24.67-1.91.9l1.22 1.67a16.8 16.8 0 0 0 5.02-2.54c.41-4.49-.7-8.4-2.89-11.87ZM8.1 14.54c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2c1.13 0 2.02.99 2 2.2 0 1.21-.88 2.2-2 2.2Zm7.8 0c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2c1.13 0 2.02.99 2 2.2s-.88 2.2-2 2.2Z" />
      </svg>
    </button>
    {error && <span role="alert" style={{ color: "#fecaca", fontSize: 12 }}>Sign-in unavailable</span>}
  </span>
}
