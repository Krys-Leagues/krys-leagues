"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { consumeAuthReturnTo, createDiscordAuthCallbackUrl, safeInternalReturnTo } from "@/lib/authReturnTo"
import { getDiscordPlayerLoginDestination } from "@/lib/discordPlayerLogin"
import { supabase } from "@/lib/supabase"

const codeExchanges = new Map<string, ReturnType<typeof supabase.auth.exchangeCodeForSession>>()

function exchangeCodeOnce(code: string) {
  const existingExchange = codeExchanges.get(code)
  if (existingExchange) return existingExchange

  const exchange = supabase.auth.exchangeCodeForSession(code)
  codeExchanges.set(code, exchange)
  return exchange
}

async function hasAdminAccess(accessToken: string) {
  const response = await fetch("/api/auth/admin-authorization", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })

  if (!response.ok) return null
  return response.json() as Promise<{ siteAdmin?: boolean; soloAdmin?: boolean }>
}

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [errorMessage, setErrorMessage] = useState("")
  const [retryAvailable, setRetryAvailable] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    async function handleLogin() {
      const code = searchParams.get("code")
      const requestedNext = searchParams.get("next")
      const type = searchParams.get("type")

      const sessionResponse = code
        ? await exchangeCodeOnce(code)
        : await supabase.auth.getSession()
      const session = sessionResponse.data.session

      if (sessionResponse.error || !session) {
        setRetryAvailable(true)
        setErrorMessage("Discord sign-in did not complete in this browser. Please try signing in again.")
        return
      }

      const next = consumeAuthReturnTo(requestedNext)

      if (type === "admin" || next?.startsWith("/admin")) {
        try {
          const permissions = await hasAdminAccess(session.access_token)
          if (permissions?.siteAdmin) {
            router.replace(next?.startsWith("/admin") ? next : "/admin/command-center")
            return
          }
          if (permissions?.soloAdmin) {
            router.replace(next?.startsWith("/admin/solo") ? next : "/admin/solo")
            return
          }
        } catch {
          setErrorMessage("Administrator authorization could not be verified.")
          return
        }

        router.replace("/dashboard")
        return
      }

      const { data: resolutionRows, error: resolutionError } = await supabase.rpc(
        "resolve_current_discord_player_login"
      )

      if (resolutionError) {
        setErrorMessage("Your Discord account was signed in, but your player profile could not be verified. Please try again later.")
        return
      }

      const resolution = (Array.isArray(resolutionRows) ? resolutionRows[0] : resolutionRows) as {
        resolution_status?: "matched" | "no_match" | "conflict"
        canonical_player_id?: string | null
      } | null

      const destination = getDiscordPlayerLoginDestination(resolution, next)
      if (destination) {
        router.replace(destination)
        return
      }

      setErrorMessage("This Discord identity requires administrator review before it can be linked to a player.")
    }

    void handleLogin()
  }, [router, searchParams])

  async function retrySignIn() {
    setRetrying(true)
    setErrorMessage("")

    const returnTo = safeInternalReturnTo(searchParams.get("next")) || undefined
    const authType = searchParams.get("type") === "admin" ? "admin" : "player"
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: createDiscordAuthCallbackUrl(authType, returnTo),
      },
    })

    if (error) {
      setRetrying(false)
      setRetryAvailable(true)
      setErrorMessage("Discord sign-in could not be restarted. Please return to the site and try again.")
    }
  }

  return (
    <main style={page}>
      <h2>{errorMessage || "Logging you in..."}</h2>
      {errorMessage && <p style={helpText}>Your public player profiles are still available while you are signed out.</p>}
      {errorMessage && retryAvailable && <button type="button" style={retryButton} disabled={retrying} onClick={() => void retrySignIn()}>{retrying ? "Opening Discord..." : "Retry Sign In"}</button>}
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main style={page}>Loading...</main>}>
      <CallbackHandler />
    </Suspense>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 40,
  background: "black",
  color: "white",
}

const helpText: React.CSSProperties = {
  maxWidth: 560,
  color: "#cbd5e1",
  lineHeight: 1.5,
}

const retryButton: React.CSSProperties = {
  minHeight: 44,
  marginTop: 12,
  padding: "10px 18px",
  border: "1px solid #818cf8",
  borderRadius: 10,
  background: "#4f46e5",
  color: "white",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
}
