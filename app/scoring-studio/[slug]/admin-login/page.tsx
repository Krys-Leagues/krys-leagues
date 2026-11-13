"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo"
import { supabase } from "@/lib/supabase"

export default function ScoringStudioAdminLoginPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const destination = `/scoring-studio/${encodeURIComponent(params.slug)}/admin`

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) router.replace(destination) })
  }, [destination, router])

  async function signIn() {
    setBusy(true); setError("")
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: createDiscordAuthCallbackUrl("player", destination) } })
    if (authError) { setBusy(false); setError(authError.message) }
  }

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07120d", color: "#f8f5e9", padding: 24 }}><section style={{ width: "min(440px, 100%)", padding: 28, border: "1px solid #f3c75f66", borderRadius: 16, background: "#0d2419" }}><p style={{ color: "#f3c75f", fontWeight: 800 }}>KRYS&apos; LEAGUES · SCORING STUDIO</p><h1>Tournament Admin sign-in</h1><p>Sign in with your existing Global Player account. Tournament Admin permission is checked against this tournament.</p><button onClick={() => void signIn()} disabled={busy} style={{ padding: "12px 16px", borderRadius: 9, fontWeight: 800 }}>{busy ? "Opening Discord…" : "Continue with Discord"}</button>{error && <p role="alert">{error}</p>}</section></main>
}
