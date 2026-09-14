"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { currentInternalReturnTo } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"
import { startDiscordSignIn } from "./DiscordSignInButton"

const WELCOME_STORAGE_KEY = "krys-leagues:optional-sign-in-welcome-dismissed-v1"

export default function OptionalSignInWelcome() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/auth")) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || data.session) return
      try {
        if (window.sessionStorage.getItem(WELCOME_STORAGE_KEY) !== "dismissed") setVisible(true)
      } catch {
        setVisible(true)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setVisible(false)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [pathname])

  function dismiss() {
    try { window.sessionStorage.setItem(WELCOME_STORAGE_KEY, "dismissed") } catch { /* continue without the preference if storage is unavailable */ }
    setVisible(false)
  }

  async function signIn() {
    setError("")
    const signInError = await startDiscordSignIn(currentInternalReturnTo() || undefined)
    if (signInError) setError(signInError.message)
  }

  if (!visible) return null

  return <div role="dialog" aria-modal="true" aria-labelledby="welcome-sign-in-title" style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center", padding: 20, background: "#0206178c" }}>
    <section style={{ width: "min(100%, 540px)", padding: "clamp(22px, 4vw, 36px)", border: "1px solid #ffffff38", borderRadius: 22, background: "linear-gradient(135deg, #172554f5, #111827f5)", color: "#f8fafc", boxShadow: "0 24px 90px #000b" }}>
      <p style={{ margin: "0 0 8px", color: "#f9a8d4", fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>KRYS LEAGUES</p>
      <h2 id="welcome-sign-in-title" style={{ margin: "0 0 12px", fontSize: "clamp(1.6rem, 4vw, 2.4rem)" }}>WELCOME TO KRYS LEAGUES</h2>
      <p style={{ margin: "0 0 22px", color: "#cbd5e1", lineHeight: 1.6 }}>Sign in with Discord for the full Krys Leagues experience. Signing in connects you to your Player Profile, league information, earned stickers and badges, signups, and other personal features.</p>
      <p style={{ margin: "0 0 22px", color: "#e2e8f0", lineHeight: 1.55 }}>You can still browse the public site without signing in.</p>
      {error && <p role="alert" style={{ margin: "0 0 14px", color: "#fecaca" }}>{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button type="button" onClick={() => void signIn()} style={{ minHeight: 46, padding: "11px 17px", border: "1px solid #5865f2", borderRadius: 10, background: "#5865f2", color: "white", fontWeight: 900, cursor: "pointer" }}>SIGN IN WITH DISCORD</button>
        <button type="button" onClick={dismiss} style={{ minHeight: 46, padding: "11px 17px", border: "1px solid #ffffff38", borderRadius: 10, background: "#02061766", color: "white", fontWeight: 800, cursor: "pointer" }}>CONTINUE WITHOUT SIGNING IN</button>
      </div>
    </section>
  </div>
}
