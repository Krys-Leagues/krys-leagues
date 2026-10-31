"use client"

import { useEffect, useState } from "react"
import { currentInternalReturnTo } from "@/lib/authReturnTo"
import { startDiscordSignIn } from "./DiscordSignInButton"

export default function SignInRequiredModal({ open, onClose, unlinked = false }: { open: boolean; onClose: () => void; unlinked?: boolean }) {
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, open])

  if (!open) return null

  async function signIn() {
    setError("")
    const signInError = await startDiscordSignIn(currentInternalReturnTo() || undefined)
    if (signInError) setError(signInError.message)
  }

  return <div role="dialog" aria-modal="true" aria-labelledby="sign-in-required-title" style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 20, background: "#020617b8" }}>
    <section style={{ width: "min(100%, 470px)", padding: 26, border: "1px solid #ffffff38", borderRadius: 18, background: "linear-gradient(135deg, #172554, #111827)", color: "#f8fafc", boxShadow: "0 24px 80px #000b" }}>
      <p style={{ margin: "0 0 8px", color: "#f9a8d4", fontSize: 12, fontWeight: 900, letterSpacing: ".12em" }}>PLAYER PROFILE</p>
      <h2 id="sign-in-required-title" style={{ margin: "0 0 10px", fontSize: "clamp(1.35rem, 3vw, 2rem)" }}>{unlinked ? "Player link needed" : "Sign in required"}</h2>
      <p style={{ margin: "0 0 20px", color: "#cbd5e1", lineHeight: 1.55 }}>{unlinked ? "Your Discord account is signed in, but it is not linked to your Krys Leagues player profile yet. Please contact a Krys Leagues admin." : "You must sign in with Discord to do this."}</p>
      {error && <p role="alert" style={{ margin: "0 0 14px", color: "#fecaca" }}>{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {!unlinked && <button type="button" onClick={() => void signIn()} style={{ minHeight: 44, padding: "10px 16px", border: "1px solid #5865f2", borderRadius: 10, background: "#5865f2", color: "white", fontWeight: 800, cursor: "pointer" }}>SIGN IN WITH DISCORD</button>}
        <button type="button" onClick={onClose} style={{ minHeight: 44, padding: "10px 16px", border: "1px solid #ffffff38", borderRadius: 10, background: "#02061766", color: "white", fontWeight: 800, cursor: "pointer" }}>{unlinked ? "CLOSE" : "NOT NOW"}</button>
      </div>
    </section>
  </div>
}
